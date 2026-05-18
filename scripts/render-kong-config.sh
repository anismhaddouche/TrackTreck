#!/usr/bin/env bash
# Renders supabase/kong.yml -> .runtime/kong.yml by substituting secrets
# from .env. Run this BEFORE `docker compose ... up`.
#
# Required vars in .env:
#   SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   DASHBOARD_USERNAME   (falls back to STUDIO_USERNAME)
#   DASHBOARD_PASSWORD   (falls back to STUDIO_PASSWORD)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT_DIR/supabase/kong.yml"
OUT_DIR="$ROOT_DIR/.runtime"
OUT_FILE="$OUT_DIR/kong.yml"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

[[ -f "$TEMPLATE" ]] || { echo "ERROR: template not found: $TEMPLATE" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "ERROR: env file not found: $ENV_FILE" >&2; exit 1; }

# Read a single value from .env without sourcing it (values may contain
# characters that break shell parsing).
get_env() {
  local key="$1"
  awk -v K="$key" '
    /^[[:space:]]*#/ || NF == 0 { next }
    {
      sub(/^[[:space:]]*export[[:space:]]+/, "")
      n = index($0, "=")
      if (n == 0) next
      k = substr($0, 1, n-1)
      v = substr($0, n+1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
      if (v ~ /^".*"$/)       v = substr(v, 2, length(v)-2)
      else if (v ~ /^'\''.*'\''$/) v = substr(v, 2, length(v)-2)
      if (k == K) { print v; exit }
    }
  ' "$ENV_FILE"
}

SUPABASE_ANON_KEY="$(get_env SUPABASE_ANON_KEY)"
SUPABASE_SERVICE_ROLE_KEY="$(get_env SUPABASE_SERVICE_ROLE_KEY)"
DASHBOARD_USERNAME="$(get_env DASHBOARD_USERNAME)"
DASHBOARD_PASSWORD="$(get_env DASHBOARD_PASSWORD)"
[[ -z "$DASHBOARD_USERNAME" ]] && DASHBOARD_USERNAME="$(get_env STUDIO_USERNAME)"
[[ -z "$DASHBOARD_PASSWORD" ]] && DASHBOARD_PASSWORD="$(get_env STUDIO_PASSWORD)"

missing=()
[[ -z "$SUPABASE_ANON_KEY"         ]] && missing+=(SUPABASE_ANON_KEY)
[[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]] && missing+=(SUPABASE_SERVICE_ROLE_KEY)
[[ -z "$DASHBOARD_USERNAME"        ]] && missing+=("DASHBOARD_USERNAME or STUDIO_USERNAME")
[[ -z "$DASHBOARD_PASSWORD"        ]] && missing+=("DASHBOARD_PASSWORD or STUDIO_PASSWORD")

if (( ${#missing[@]} > 0 )); then
  echo "ERROR: missing required variables in $ENV_FILE:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
export SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DASHBOARD_USERNAME DASHBOARD_PASSWORD

if command -v python3 >/dev/null 2>&1; then
  python3 - "$TEMPLATE" "$OUT_FILE" <<'PY'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
keys = ("SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
        "DASHBOARD_USERNAME", "DASHBOARD_PASSWORD")
with open(src, "r", encoding="utf-8") as f:
    text = f.read()
for k in keys:
    text = text.replace("${" + k + "}", os.environ.get(k, ""))
with open(dst, "w", encoding="utf-8") as f:
    f.write(text)
PY
else
  esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }
  sed \
    -e "s|\${SUPABASE_ANON_KEY}|$(esc "$SUPABASE_ANON_KEY")|g" \
    -e "s|\${SUPABASE_SERVICE_ROLE_KEY}|$(esc "$SUPABASE_SERVICE_ROLE_KEY")|g" \
    -e "s|\${DASHBOARD_USERNAME}|$(esc "$DASHBOARD_USERNAME")|g" \
    -e "s|\${DASHBOARD_PASSWORD}|$(esc "$DASHBOARD_PASSWORD")|g" \
    "$TEMPLATE" > "$OUT_FILE"
fi

chmod 644 "$OUT_FILE"

# Sanity check: no unresolved ${VAR} placeholders should remain.
if grep -qE '\$\{[A-Z_]+\}' "$OUT_FILE"; then
  echo "ERROR: unresolved placeholders remain in $OUT_FILE:" >&2
  grep -nE '\$\{[A-Z_]+\}' "$OUT_FILE" >&2
  exit 1
fi

echo "Rendered $OUT_FILE"
