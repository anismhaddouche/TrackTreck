# TrackTreck — Production deployment (Hetzner CX23)

Target: **Hetzner CX23** (2 vCPU, 4 GB RAM, 40 GB SSD) running Docker Compose.
Supabase is **external** (Supabase Cloud) — no Supabase containers run on the VPS.

Stack:
- `caddy` — reverse proxy + automatic HTTPS (Let's Encrypt)
- `app` — React/Vite admin UI served by Nginx
- `n8n` — automation engine (SQLite, lightweight)
- `evolution-api` — WhatsApp gateway
- `evolution-postgres` — Postgres 15 (Evolution only)
- `evolution-redis` — Redis 7 (Evolution only)

Only ports **80** and **443** are exposed publicly. Postgres and Redis are internal-only.

---

## 1. Provision the VPS

1. Create a Hetzner CX23 server (Ubuntu 24.04 LTS, x86).
2. Add your SSH key during creation.
3. Note the public IPv4.

### DNS

Create A records (TTL 300s) pointing to the VPS IP:

| Subdomain                 | Purpose            |
| ------------------------- | ------------------ |
| `admin.example.com`       | Frontend / admin   |
| `n8n.example.com`         | n8n editor         |
| `api.example.com`         | Evolution API      |

Wait for propagation (`dig +short admin.example.com`) before starting Caddy — otherwise certificate issuance will fail.

### Hetzner Cloud Firewall (recommended)

Allow inbound only:

| Proto | Port  | Source     |
| ----- | ----- | ---------- |
| TCP   | 22    | your IP    |
| TCP   | 80    | 0.0.0.0/0  |
| TCP   | 443   | 0.0.0.0/0  |

Block everything else. (Or use `ufw` — see below.)

---

## 2. Connect & prepare the server

```bash
ssh root@<VPS_IP>

# Create a non-root user
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
su - deploy

# System update
sudo apt update && sudo apt -y upgrade

# Basic firewall
sudo apt -y install ufw
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# 2 GB swap (recommended on CX23)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

### Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version    # should print v2.x
```

---

## 3. Clone the repository

```bash
cd ~
git clone https://github.com/<owner>/TrackTreck.git
cd TrackTreck
```

---

## 4. Create the `.env`

```bash
cp .env.example .env
nano .env
```

Replace every `change_me` value. Generate strong secrets:

```bash
openssl rand -hex 32   # N8N_ENCRYPTION_KEY
openssl rand -hex 24   # EVOLUTION_API_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD
```

Required values:

- `DOMAIN_NAME`, `APP_HOST`, `N8N_HOST`, `EVOLUTION_HOST`, `ACME_EMAIL`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (from the Supabase Cloud dashboard → Project Settings → API)
- `N8N_ENCRYPTION_KEY`, `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD`
- `EVOLUTION_API_KEY`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `REDIS_PASSWORD`

Store `SUPABASE_SERVICE_ROLE_KEY` as an **n8n credential** inside the n8n UI — do **not** ship it to the frontend.

---

## 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First run will:
- build the frontend image (`app/Dockerfile`)
- pull n8n / evolution / postgres / redis / caddy
- request Let's Encrypt certificates for the three subdomains.

Watch the logs until issuance completes:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Visit:
- `https://admin.example.com` — admin UI
- `https://n8n.example.com` — n8n (Basic Auth)
- `https://api.example.com/manager` — Evolution manager UI (use `EVOLUTION_API_KEY`)

---

## 6. Day-to-day operations

| Action                         | Command                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Start                          | `docker compose -f docker-compose.prod.yml up -d`                                        |
| Stop                           | `docker compose -f docker-compose.prod.yml down`                                         |
| Restart one service            | `docker compose -f docker-compose.prod.yml restart n8n`                                  |
| Rebuild after `git pull`       | `git pull && docker compose -f docker-compose.prod.yml up -d --build`                    |
| Update images (n8n, evolution) | `docker compose -f docker-compose.prod.yml pull && docker compose -f ... up -d`          |
| Tail logs                      | `docker compose -f docker-compose.prod.yml logs -f --tail=200`                           |
| Logs of one service            | `docker compose -f docker-compose.prod.yml logs -f n8n`                                  |
| Running containers             | `docker compose -f docker-compose.prod.yml ps`                                           |
| Resource usage                 | `docker stats --no-stream`                                                               |
| Prune unused images/layers     | `docker system prune -af`                                                                |

---

## 7. Backups

Volumes that contain irreplaceable state:

- `n8n_data` — workflows, credentials, executions
- `evolution_instances` — WhatsApp session data (avoids re-scanning QR codes)
- `evolution_postgres_data` — Evolution database (messages, contacts, chats)

The Supabase data is backed up by Supabase Cloud — no action needed.

### Daily backup script

Create `~/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F)
DEST=/home/deploy/backups/$STAMP
mkdir -p "$DEST"

cd /home/deploy/TrackTreck

# Postgres logical dump
docker compose -f docker-compose.prod.yml exec -T evolution-postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DEST/evolution-db.sql.gz"

# Named volumes -> tarballs
for VOL in tracktreck_n8n_data tracktreck_evolution_instances; do
  docker run --rm -v "$VOL":/data -v "$DEST":/backup alpine \
    tar czf "/backup/$VOL.tgz" -C /data .
done

# Keep last 7 days
find /home/deploy/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

```bash
chmod +x ~/backup.sh
( crontab -l 2>/dev/null; echo "30 3 * * * /home/deploy/backup.sh >> /home/deploy/backups/cron.log 2>&1" ) | crontab -
```

> Tip: copy backups off-server (rclone to S3 / Hetzner Storage Box).

### Restore

```bash
# Restore Postgres
gunzip -c evolution-db.sql.gz | docker compose -f docker-compose.prod.yml exec -T evolution-postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Restore a volume
docker run --rm -v tracktreck_n8n_data:/data -v "$PWD":/backup alpine \
  sh -c "cd /data && tar xzf /backup/tracktreck_n8n_data.tgz"
```

---

## 8. Hetzner CX23 sizing notes

- **Lightweight by design.** No Supabase stack, no local OCR/LLM models — always use the Supabase Cloud + external APIs (OpenAI, etc.) called from n8n.
- **Docker log rotation** is already enforced via the `x-logging` block in the compose file (10 MB × 3 files per container).
- **2 GB swap** is recommended (see step 2).
- **Upgrade trigger:** if `docker stats` shows steady RAM > 3.2 GB, or you start running heavy n8n workflows / many Evolution instances (>3 WhatsApp numbers), move to **Hetzner CX33** (4 vCPU / 8 GB RAM).

---

## 9. Pre-push checklist

- [ ] `.env` is **not** tracked (`git status` shows it ignored)
- [ ] No real keys committed (`git grep -nE "eyJ|supabase\.co|change_me" -- :!.env.example :!README_DEPLOYMENT.md`)
- [ ] `.env.example` has only placeholder values
- [ ] DNS A records point to the VPS
- [ ] Strong `N8N_ENCRYPTION_KEY`, `EVOLUTION_API_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD` set on VPS
- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored as n8n credential, not in build args
- [ ] Hetzner firewall / `ufw` only allows 22/80/443
- [ ] Backup cron is running

---

## 10. Production validation checklist (run once after deploy)

Run these on the VPS, *after* `docker compose -f docker-compose.prod.yml up -d`:

```bash
# All containers up & healthy
docker compose -f docker-compose.prod.yml ps

# Only 80/443 listening publicly — no 5432 / 6379 / 5678 / 8080 on 0.0.0.0
sudo ss -tlnp | grep -E "LISTEN.*0\.0\.0\.0|LISTEN.*\[::\]"

# Caddy obtained valid certs (no staging / errors)
docker compose -f docker-compose.prod.yml logs caddy | grep -iE "certificate|error" | tail

# Each subdomain returns 200 over HTTPS
curl -sS -o /dev/null -w "%{http_code}\n" https://admin.example.com
curl -sS -o /dev/null -w "%{http_code}\n" https://n8n.example.com
curl -sS -o /dev/null -w "%{http_code}\n" https://api.example.com

# Evolution API health (replace with your key)
curl -sS https://api.example.com -H "apikey: $EVOLUTION_API_KEY" | head

# n8n editor responds with 401 (Basic Auth active) — not 502
curl -sS -o /dev/null -w "%{http_code}\n" https://n8n.example.com   # expect 401

# Frontend bundle does NOT contain the service-role key
docker compose -f docker-compose.prod.yml exec app sh -c \
  "grep -REo 'service_role|sb_secret_' /usr/share/nginx/html || echo OK_NO_SERVICE_ROLE"

# Frontend bundle has NO localhost references
docker compose -f docker-compose.prod.yml exec app sh -c \
  "grep -REo 'localhost|127\\.0\\.0\\.1' /usr/share/nginx/html || echo OK_NO_LOCALHOST"

# Resource usage fits CX23
docker stats --no-stream
```

Expected:

- [ ] `docker compose ps` → every service `Up` (healthy where defined)
- [ ] `ss -tlnp` shows only `:80` and `:443` on public interfaces (Postgres/Redis/n8n/Evolution bound only to the internal network)
- [ ] Caddy logs report `certificate obtained successfully` for each subdomain
- [ ] `https://admin.example.com` → `200`, loads the admin UI
- [ ] `https://n8n.example.com` → `401` (Basic Auth) then 200 after login
- [ ] `https://api.example.com` with valid `apikey` → JSON response
- [ ] Frontend grep → `OK_NO_SERVICE_ROLE` and `OK_NO_LOCALHOST`
- [ ] `docker stats` → total memory under ~2 GB at idle
- [ ] WhatsApp QR pairing in Evolution manager succeeds, instance persists after `docker compose restart evolution-api`
- [ ] n8n test workflow can call Supabase Cloud (anon + service-role credential) and the Evolution API at `http://evolution-api:8080` (internal) or `https://api.example.com` (external)
- [ ] Backup script ran at least once; restore tested in a scratch directory

