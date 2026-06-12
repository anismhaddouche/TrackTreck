#!/usr/bin/env bash
# Apply idempotent repairs to the self-hosted Supabase database.
#
# Use this if, after `docker compose up`, supabase-auth or supabase-storage
# crash with one of:
#   - password authentication failed for user "supabase_auth_admin"
#   - schema "auth" does not exist
#   - type "auth.factor_type" does not exist
#
# Safe to re-run. Requires .env to be populated.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.prod.yml}"
SQL_FILE="$ROOT_DIR/supabase/init/99-bootstrap-fixes.sql"

[[ -f "$ENV_FILE" ]] || { echo "ERROR: $ENV_FILE not found" >&2; exit 1; }
[[ -f "$SQL_FILE" ]] || { echo "ERROR: $SQL_FILE not found" >&2; exit 1; }

# Pull SUPABASE_DB_PASSWORD without sourcing the whole env file.
DB_PW="$(awk -F= '/^[[:space:]]*SUPABASE_DB_PASSWORD=/ {sub(/^[^=]+=/,""); print; exit}' "$ENV_FILE")"
# Strip surrounding quotes if any.
DB_PW="${DB_PW%\"}"; DB_PW="${DB_PW#\"}"
DB_PW="${DB_PW%\'}"; DB_PW="${DB_PW#\'}"

if [[ -z "$DB_PW" ]]; then
  echo "ERROR: SUPABASE_DB_PASSWORD missing from $ENV_FILE" >&2
  exit 1
fi

echo "==> Applying $SQL_FILE"
docker compose -f "$COMPOSE_FILE" exec -T supabase-db \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$SQL_FILE"

echo "==> Aligning admin role passwords with SUPABASE_DB_PASSWORD"
# These ALTERs are intentionally not in the SQL file (which is meant to be
# checked into git) — passwords must come from .env.
docker compose -f "$COMPOSE_FILE" exec -T \
  -e PGPASSWORD="$DB_PW" supabase-db \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
       -v pw="$DB_PW" <<'SQL'
\set ON_ERROR_STOP on
ALTER ROLE supabase_admin         WITH LOGIN PASSWORD :'pw';
ALTER ROLE supabase_auth_admin    WITH LOGIN PASSWORD :'pw';
ALTER ROLE supabase_storage_admin WITH LOGIN PASSWORD :'pw';
ALTER ROLE authenticator          WITH LOGIN PASSWORD :'pw';
SQL

echo "==> Restarting Supabase services that depend on these roles"
docker compose -f "$COMPOSE_FILE" restart \
  supabase-auth supabase-storage supabase-rest supabase-meta

echo "Done."
