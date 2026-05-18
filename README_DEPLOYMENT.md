# TrackTreck — Production deployment (Hetzner CX23+ / self-hosted)

**Architecture**: every service runs in its own container on a single VPS,
wired together by Docker Compose. **Supabase is self-hosted on the same VPS**
— no external Supabase Cloud dependency.

```
                Internet (TCP 80 / 443)
                          │
                  ┌───────▼───────┐
                  │     Caddy     │  auto-HTTPS (Let's Encrypt)
                  └─┬─────┬─────┬─┴───┐
        admin.host │     │     │     │ supabase.host
        n8n.host   │     │     │ api.host
   ┌────────▼┐ ┌───▼─┐ ┌─▼──────┐ ┌───▼────────────┐
   │  app    │ │ n8n │ │ evo-api│ │ supabase-kong  │
   │ (nginx) │ │     │ │        │ └─┬──────────────┘
   └─────────┘ └─────┘ └─┬────┬─┘   │ /auth /rest /storage /pg /
                        │    │     ├──> supabase-auth (gotrue)
                        │    │     ├──> supabase-rest (postgrest)
                        │    │     ├──> supabase-storage + imgproxy
                        │    │     ├──> supabase-meta
                        │    │     └──> supabase-studio (Basic Auth)
                        │    │           │
                ┌───────▼┐ ┌─▼────┐ ┌─────▼──────┐
                │ evo-pg │ │ evo- │ │ supabase-db│  (separate Postgres clusters)
                │  (15)  │ │ redis│ │   (15.x)   │
                └────────┘ └──────┘ └────────────┘
```

Only ports **80** and **443** are exposed publicly. Every database, cache and
internal Supabase service stays on the private `tracktreck` Docker network.

---

## 1. Provision the VPS

1. Create a Hetzner **CX33 or larger** (Ubuntu 24.04 LTS). See §11 for sizing.
   CX23 boots but is **MVP-only** — see the warning at the bottom.
2. Add your SSH key.
3. Note the public IPv4.

### DNS

Create A records (TTL 300s) pointing to the VPS IP:

| Subdomain                  | Purpose            |
| -------------------------- | ------------------ |
| `admin.example.com`        | Frontend / admin   |
| `n8n.example.com`          | n8n editor         |
| `api.example.com`          | Evolution API      |
| `supabase.example.com`     | Supabase gateway   |

No domain yet? Use `sslip.io`:
`supabase.<your.vps.ip>.sslip.io` — resolves to your IP without any DNS setup.

### Hetzner firewall

Allow inbound TCP only on **22** (your IP), **80**, **443**. Block everything
else. (Or use `ufw` — see step 2.)

---

## 2. Connect & prepare the server

```bash
ssh root@<VPS_IP>

adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
su - deploy

sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw jq openssl
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# 2 GB swap (REQUIRED on CX23, recommended on CX33)
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
cp .env.example .env
```

---

## 4. Generate secrets

```bash
# Postgres / Redis / API passwords
openssl rand -hex 24    # SUPABASE_DB_PASSWORD
openssl rand -hex 24    # EVOLUTION_DB_PASSWORD
openssl rand -hex 24    # REDIS_PASSWORD
openssl rand -hex 24    # EVOLUTION_API_KEY
openssl rand -hex 32    # N8N_ENCRYPTION_KEY
openssl rand -hex 32    # SUPABASE_JWT_SECRET   <-- write this down first
openssl rand -base64 18 # STUDIO_PASSWORD
openssl rand -base64 18 # N8N_BASIC_AUTH_PASSWORD
```

Edit `.env` and fill every value.

---

## 5. Generate Supabase keys (anon + service_role JWTs)

Both keys are JWTs signed with `SUPABASE_JWT_SECRET`. Generate them on your
laptop (Node ≥ 18) or directly on the VPS:

```bash
# On the VPS, inside the repo:
docker run --rm -e JWT_SECRET="$(grep ^SUPABASE_JWT_SECRET= .env | cut -d= -f2-)" \
  node:20-alpine sh -lc '
    npm i -s jsonwebtoken@9 > /dev/null 2>&1
    node -e "
      const jwt = require(\"jsonwebtoken\");
      const s = process.env.JWT_SECRET;
      const iat = Math.floor(Date.now()/1000);
      const exp = iat + 60*60*24*365*5; // 5 years
      console.log(\"ANON=\"        + jwt.sign({role:\"anon\",         iss:\"supabase\", iat, exp}, s));
      console.log(\"SERVICE_ROLE=\"+ jwt.sign({role:\"service_role\", iss:\"supabase\", iat, exp}, s));
    "
'
```

Copy the two printed values into `.env` as `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. **Never** expose `SUPABASE_SERVICE_ROLE_KEY` to
the browser — only the frontend `VITE_*` build args read `SUPABASE_ANON_KEY`.
Store the service role as an **n8n credential** inside n8n.

---

## 6. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First run will:
- build the frontend image,
- pull Supabase / n8n / Evolution / Caddy images,
- initialize both Postgres clusters,
- request Let's Encrypt certificates for the four hostnames.

Watch Caddy until certs are issued:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Then visit:
- `https://admin.example.com` — admin UI
- `https://n8n.example.com` — n8n (Basic Auth)
- `https://api.example.com/manager` — Evolution manager
- `https://supabase.example.com` — Supabase Studio (Basic Auth via Kong)
- `https://supabase.example.com/rest/v1/`, `/auth/v1/`, `/storage/v1/` — APIs

Create the storage bucket once Studio is up:

```bash
docker compose -f docker-compose.prod.yml exec -T supabase-db \
  psql -U postgres -d postgres -c \
  "insert into storage.buckets (id, name, public) values ('travel-offer-assets','travel-offer-assets',false) on conflict do nothing;"
```

---

## 7. Day-to-day operations

| Action                         | Command                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Start                          | `docker compose -f docker-compose.prod.yml up -d`                                        |
| Stop                           | `docker compose -f docker-compose.prod.yml down`                                         |
| Restart one service            | `docker compose -f docker-compose.prod.yml restart supabase-auth`                        |
| Rebuild app after `git pull`   | `git pull && docker compose -f docker-compose.prod.yml up -d --build app`                |
| Pull newer Supabase images     | `docker compose -f docker-compose.prod.yml pull && docker compose -f ... up -d`          |
| Tail logs                      | `docker compose -f docker-compose.prod.yml logs -f --tail=200`                           |
| One service logs               | `docker compose -f docker-compose.prod.yml logs -f supabase-db`                          |
| Running containers             | `docker compose -f docker-compose.prod.yml ps`                                           |
| Live resource usage            | `docker stats --no-stream`                                                               |
| Disk usage by container/volume | `docker system df -v`                                                                    |
| Free RAM / swap                | `free -h`                                                                                |
| Disk free                      | `df -h /`                                                                                |
| Prune unused layers            | `docker system prune -af`                                                                |

---

## 8. Backups

Critical volumes:

- `n8n_data` — workflows, credentials, executions
- `evolution_instances` — WhatsApp sessions (avoids re-scanning QR)
- `evolution_postgres_data` — Evolution database
- `supabase_db_data` — **all** Supabase Postgres data (auth, public schema, storage metadata)
- `supabase_storage_data` — actual uploaded files

### Daily backup script

`~/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F)
DEST=/home/deploy/backups/$STAMP
mkdir -p "$DEST"

cd /home/deploy/TrackTreck
export $(grep -v '^#' .env | xargs -d '\n')

# Supabase Postgres — logical dump (auth, storage, public, everything)
docker compose -f docker-compose.prod.yml exec -T supabase-db \
  pg_dumpall -U postgres | gzip > "$DEST/supabase-pgdumpall.sql.gz"

# Evolution Postgres — logical dump
docker compose -f docker-compose.prod.yml exec -T evolution-postgres \
  pg_dump -U "$EVOLUTION_DB_USER" "$EVOLUTION_DB_NAME" | gzip > "$DEST/evolution-db.sql.gz"

# Named volumes -> tarballs (n8n, evolution instances, supabase storage files)
for VOL in tracktreck_n8n_data tracktreck_evolution_instances tracktreck_supabase_storage_data; do
  docker run --rm -v "$VOL":/data -v "$DEST":/backup alpine \
    tar czf "/backup/$VOL.tgz" -C /data .
done

# Keep last 7 days locally
find /home/deploy/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

```bash
chmod +x ~/backup.sh
( crontab -l 2>/dev/null; echo "30 3 * * * /home/deploy/backup.sh >> /home/deploy/backups/cron.log 2>&1" ) | crontab -
```

> Copy backups off-server (rclone to S3 / Hetzner Storage Box) — a local
> backup on the same VPS does **not** survive a disk failure.

### Restore — Supabase Postgres

> Stop dependent services first so they don't reconnect mid-restore.

```bash
docker compose -f docker-compose.prod.yml stop supabase-auth supabase-rest supabase-storage supabase-meta supabase-studio supabase-kong
gunzip -c supabase-pgdumpall.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T supabase-db psql -U postgres -d postgres
docker compose -f docker-compose.prod.yml start supabase-auth supabase-rest supabase-storage supabase-meta supabase-studio supabase-kong
```

### Restore — Evolution Postgres

```bash
docker compose -f docker-compose.prod.yml stop evolution-api
gunzip -c evolution-db.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T evolution-postgres psql -U $EVOLUTION_DB_USER -d $EVOLUTION_DB_NAME
docker compose -f docker-compose.prod.yml start evolution-api
```

### Restore — Storage files (Supabase + Evolution + n8n volumes)

```bash
# Example: restore Supabase storage objects
docker compose -f docker-compose.prod.yml stop supabase-storage supabase-imgproxy
docker run --rm -v tracktreck_supabase_storage_data:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && cd /data && tar xzf /backup/tracktreck_supabase_storage_data.tgz"
docker compose -f docker-compose.prod.yml start supabase-storage supabase-imgproxy
```

> **Important**: keep `supabase_db_data` and `supabase_storage_data` in sync —
> they reference each other (DB has the metadata, volume has the bytes). Restore
> them from the **same** backup snapshot.

---

## 9. Monitoring (CX23 essentials)

```bash
# Live RAM / CPU per container
docker stats

# Top RAM consumers (sorted)
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}" | sort -k2 -h

# Disk space taken by Docker images, containers, volumes
docker system df -v

# OS-level: free RAM, swap usage, disk
free -h && echo && df -h / && echo && uptime
```

Set a simple OOM watcher if you stay on CX23:

```bash
( crontab -l 2>/dev/null; echo "*/5 * * * * dmesg -T | tail -20 | grep -iE 'oom|killed process' >> /home/deploy/oom.log" ) | crontab -
```

---

## 10. Security & secrets summary

- `.env` is gitignored and **must never** be committed. Verify: `git check-ignore -v .env`.
- `SUPABASE_SERVICE_ROLE_KEY` is **never** read by the frontend (search:
  `grep -R "service_role" app/src` — should find only a warning message).
- The frontend bundle only contains `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_STORAGE_BUCKET`, `N8N_INGESTION_WEBHOOK_URL`.
- Postgres / Redis / internal Supabase services do **not** have published
  ports — they're reachable only through Kong (Supabase) or directly via the
  Docker network (n8n → REST/Storage at `http://supabase-kong:8000`).
- Studio is gated behind Kong Basic Auth (`STUDIO_USERNAME` / `STUDIO_PASSWORD`).
- n8n editor is gated behind n8n Basic Auth.
- Evolution API requires the `apikey` header.

---

## 11. Hetzner CX23 vs CX33

### CX23 (2 vCPU / 4 GB / 40 GB) — **MVP / demo only**

The full self-hosted stack idles around **1.8–2.4 GB RAM** and routinely
peaks above **3.5 GB** during normal use (Studio open + an n8n run +
Storage upload + Evolution sync). On CX23 this means:

- The OOM killer will eventually drop a container (usually `supabase-db`
  or `evolution-postgres`) — silent data corruption is unlikely thanks to
  Postgres WAL but downtime is guaranteed.
- 40 GB SSD fills quickly: images (~4 GB) + two Postgres clusters +
  Supabase storage + n8n executions + WhatsApp media. Plan **<6 months**
  of retention.
- Concurrent uploads + image transforms (imgproxy) will spike CPU to 100%.

**Use CX23 only for: smoke tests, single-user demos, throwaway environments.**

### CX33 (4 vCPU / 8 GB / 80 GB) — **recommended minimum**

Headroom for normal production traffic, multiple WhatsApp instances, and a
year of Storage growth. This is the **minimum** you should run for real users.

### When to go further (CPX31 / CPX41 / CX42+)

- Many WhatsApp instances (≥ 5) — Evolution + Postgres get heavy.
- Heavy Storage workloads or large images that need transforms.
- Realtime / Edge Functions (add `supabase-realtime` and `supabase-edge`
  services — currently skipped to fit small VPS).

---

## 12. Pre-push checklist

- [ ] `.env` is **not** tracked (`git status` / `git check-ignore -v .env`)
- [ ] No real keys committed: `git grep -nE "eyJ|change_me|sb_secret_" -- :!.env.example :!README_DEPLOYMENT.md`
- [ ] `.env.example` only has `change_me` / placeholder values
- [ ] DNS A records point to the VPS for app / n8n / api / supabase hosts
- [ ] Strong values set for `SUPABASE_JWT_SECRET`, `SUPABASE_DB_PASSWORD`, `STUDIO_PASSWORD`, `N8N_ENCRYPTION_KEY`, `EVOLUTION_API_KEY`
- [ ] `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` regenerated **after** picking `SUPABASE_JWT_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` stored as n8n credential (not in build args)
- [ ] Hetzner firewall / `ufw` allows only 22 / 80 / 443
- [ ] 2 GB swap configured
- [ ] Daily backup cron installed and tested with a dry-run restore

---

## 13. Production validation checklist (run once after deploy)

```bash
# All containers up & healthy
docker compose -f docker-compose.prod.yml ps

# Only 80/443 listen publicly
sudo ss -tlnp | grep -E "LISTEN.*0\.0\.0\.0|LISTEN.*\[::\]"

# Certs issued
docker compose -f docker-compose.prod.yml logs caddy | grep -iE "certificate|error" | tail

# Each public host responds
for H in $APP_HOST $N8N_HOST $EVOLUTION_HOST $SUPABASE_HOST; do
  curl -sS -o /dev/null -w "$H -> %{http_code}\n" "https://$H"
done

# Supabase REST is wired
curl -sS "https://$SUPABASE_HOST/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY" | head

# Supabase Auth health
curl -sS "https://$SUPABASE_HOST/auth/v1/health" -H "apikey: $SUPABASE_ANON_KEY"

# Storage list (bucket must exist)
curl -sS "https://$SUPABASE_HOST/storage/v1/bucket" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"

# Frontend bundle does NOT leak the service-role key
docker compose -f docker-compose.prod.yml exec app sh -c \
  "grep -R 'service_role' /usr/share/nginx/html || echo OK_NO_SERVICE_ROLE"

# Frontend bundle has NO localhost references
docker compose -f docker-compose.prod.yml exec app sh -c \
  "grep -REo 'localhost|127\\.0\\.0\\.1' /usr/share/nginx/html || echo OK_NO_LOCALHOST"

# Resource budget
docker stats --no-stream
free -h
df -h /
```

Expected:

- [ ] every service `Up (healthy)` where healthchecks are defined
- [ ] only `:80` and `:443` listening on the public interface
- [ ] Caddy logs `certificate obtained successfully` for all four hostnames
- [ ] all four hosts return HTTP 200 / 401 (not 502)
- [ ] REST returns Swagger JSON, Auth returns `{"description":"GoTrue...","name":"GoTrue"...}`
- [ ] Storage `bucket` call returns an array with `travel-offer-assets`
- [ ] `OK_NO_SERVICE_ROLE` and `OK_NO_LOCALHOST` print
- [ ] `docker stats` total memory < 3 GB at idle (CX23) / < 5 GB (CX33)
- [ ] `df -h /` shows > 10 GB free
