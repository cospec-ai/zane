#!/usr/bin/env bash
# ── Zane Self-Host Wizard ───────────────────────
# Deploys Orbit (auth + relay) and Web to your Cloudflare account.
# Sourced by `zane self-host` or the install script.

set -euo pipefail

ZANE_HOME="${ZANE_HOME:-$HOME/.zane}"
ENV_FILE="$ZANE_HOME/.env"

# ── Colors ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

pass()  { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail()  { printf "  ${RED}✗${RESET} %s\n" "$1"; }
warn()  { printf "  ${YELLOW}⚠${RESET} %s\n" "$1"; }
step()  { printf "\n${BOLD}%s${RESET}\n" "$1"; }

abort() {
  printf "\n${RED}Error: %s${RESET}\n" "$1"
  exit 1
}

confirm() {
  local prompt="$1"
  printf "%s [Y/n] " "$prompt"
  read -r answer < /dev/tty
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

# Retry a command up to N times with a delay
retry() {
  local attempts="$1" delay="$2" desc="$3"
  shift 3
  local i
  for ((i = 1; i <= attempts; i++)); do
    if "$@"; then
      return 0
    fi
    if ((i < attempts)); then
      warn "$desc failed (attempt $i/$attempts) — retrying in ${delay}s..."
      sleep "$delay"
    fi
  done
  return 1
}

wrangler_tty() {
  # Installer is often run via curl|bash (stdin is a pipe). Force tty stdin for wrangler auth flows.
  if [[ -r /dev/tty ]]; then
    wrangler "$@" < /dev/tty
  else
    wrangler "$@"
  fi
}

extract_uuid() {
  grep -oE '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' | head -1 || true
}

extract_zane_db_uuid_from_list() {
  local raw="$1"
  local flat object uuid

  flat=$(echo "$raw" | tr -d '\n')
  object=$(echo "$flat" | grep -oE '\{[^{}]*"name"[[:space:]]*:[[:space:]]*"zane"[^{}]*\}' | head -1 || true)
  uuid=$(echo "$object" | grep -oE '"uuid"[[:space:]]*:[[:space:]]*"[0-9a-fA-F-]{36}"' | head -1 | cut -d'"' -f4 || true)

  if [[ -z "$uuid" ]]; then
    uuid=$(echo "$raw" | grep -i "zane" | extract_uuid || true)
  fi

  printf "%s" "$uuid"
}

normalize_pages_url() {
  local url="$1"
  local host

  host=$(echo "$url" | sed -E 's#^https?://([^/]+).*$#\1#')
  if [[ "$host" =~ ^[^.]+\.[^.]+\.pages\.dev$ ]]; then
    printf "https://%s" "${host#*.}"
    return
  fi

  printf "%s" "$url"
}

# ── Prerequisites ───────────────────────────────
step "1. Checking prerequisites"

# Check wrangler
if command -v wrangler &>/dev/null; then
  pass "wrangler installed"
else
  warn "wrangler not found"
  if confirm "  Install wrangler globally via bun?"; then
    bun add -g wrangler
    if command -v wrangler &>/dev/null; then
      pass "wrangler installed"
    else
      abort "Failed to install wrangler."
    fi
  else
    abort "wrangler is required. Run: bun add -g wrangler"
  fi
fi

# Check Cloudflare login
if whoami_output=$(wrangler_tty whoami 2>&1); then
  pass "Cloudflare authenticated"
else
  warn "Not logged in to Cloudflare"
  echo "$whoami_output"
  if confirm "  Run 'wrangler login' now?"; then
    wrangler_tty login
    if whoami_output=$(wrangler_tty whoami 2>&1); then
      pass "Cloudflare authenticated"
    else
      echo "$whoami_output"
      abort "Cloudflare authentication failed."
    fi
  else
    abort "Cloudflare login required. Run: wrangler login"
  fi
fi

# ── Create D1 Database ──────────────────────────
step "2. Creating D1 database"

database_id=""

# Check if a 'zane' database already exists
echo "  Checking for existing database..."
if ! db_list=$(wrangler_tty d1 list --json 2>&1); then
  warn "Failed to list D1 databases."
  echo "$db_list"
  if confirm "  Run 'wrangler login' now?"; then
    wrangler_tty login
    db_list=$(wrangler_tty d1 list --json 2>&1) || {
      echo "$db_list"
      abort "Could not list D1 databases."
    }
  else
    abort "Cloudflare login required to list D1 databases."
  fi
fi

database_id=$(extract_zane_db_uuid_from_list "$db_list")

if [[ -n "$database_id" ]]; then
  pass "Found existing database: $database_id"
else
  echo "  Creating database 'zane'..."
  if ! db_output=$(wrangler_tty d1 create zane 2>&1); then
    warn "Failed to create D1 database 'zane'."
    echo "$db_output"
    if confirm "  Run 'wrangler login' now?"; then
      wrangler_tty login
      db_output=$(wrangler_tty d1 create zane 2>&1) || {
        echo "$db_output"
        abort "Could not create D1 database 'zane'."
      }
    else
      abort "Could not create D1 database 'zane'."
    fi
  fi

  echo "$db_output"
  database_id=$(echo "$db_output" | extract_uuid)

  if [[ -z "$database_id" ]]; then
    db_list=$(wrangler_tty d1 list --json 2>&1) || true
    database_id=$(extract_zane_db_uuid_from_list "$db_list")
  fi

  if [[ -z "$database_id" ]]; then
    warn "Could not auto-detect the D1 database UUID."
    echo ""
    echo "  Run 'wrangler d1 list --json' to find your database ID."
    printf "  Enter your D1 database ID: "
    read -r database_id < /dev/tty
    if [[ -z "$database_id" ]]; then
      abort "Database ID is required."
    fi
  fi
fi

pass "Database ID: $database_id"

# ── Update wrangler.toml files ──────────────────
step "3. Updating wrangler.toml configurations"

for toml_path in \
  "$ZANE_HOME/wrangler.toml" \
  "$ZANE_HOME/services/orbit/wrangler.toml"; do

  if [[ -f "$toml_path" ]]; then
    sed -i '' "s/database_id = \"[^\"]*\"/database_id = \"$database_id\"/" "$toml_path"
    pass "Updated $(basename "$(dirname "$toml_path")")/wrangler.toml"
  fi
done

# ── Generate secrets ────────────────────────────
step "4. Generating secrets"

web_jwt_secret=$(openssl rand -base64 32)
anchor_jwt_secret=$(openssl rand -base64 32)

pass "ZANE_WEB_JWT_SECRET generated"
pass "ZANE_ANCHOR_JWT_SECRET generated"

# ── Run database migrations ─────────────────────
step "5. Running database migrations"

run_migrations() {
  (cd "$ZANE_HOME" && wrangler_tty d1 migrations apply zane --remote)
}

retry 3 5 "Migrations" run_migrations \
  || abort "Database migrations failed after 3 attempts."
pass "Migrations applied"

# ── Deploy orbit worker ─────────────────────────
step "6. Deploying orbit worker"

(cd "$ZANE_HOME/services/orbit" && bun install --silent)

echo "$web_jwt_secret" | (cd "$ZANE_HOME/services/orbit" && wrangler secret put ZANE_WEB_JWT_SECRET) 2>/dev/null || true
echo "$anchor_jwt_secret" | (cd "$ZANE_HOME/services/orbit" && wrangler secret put ZANE_ANCHOR_JWT_SECRET) 2>/dev/null || true

orbit_output=$(cd "$ZANE_HOME/services/orbit" && wrangler_tty deploy 2>&1) || true
echo "$orbit_output"

orbit_url=$(echo "$orbit_output" | grep -oE 'https://[^ ]+\.workers\.dev' | head -1 || true)
if [[ -z "$orbit_url" ]]; then
  warn "Could not detect orbit URL from deploy output."
  printf "  Enter your orbit worker URL (e.g. https://orbit.your-subdomain.workers.dev): "
  read -r orbit_url < /dev/tty
fi

pass "Orbit worker deployed: $orbit_url"

# Derive WebSocket URL from HTTPS URL
orbit_ws_url=$(echo "$orbit_url" | sed 's|^https://|wss://|')/ws/anchor

# ── Build and deploy web ────────────────────────
step "7. Building and deploying web frontend"

(cd "$ZANE_HOME" && bun install --silent)

echo "  Building with AUTH_URL=$orbit_url ..."
if ! (cd "$ZANE_HOME" && AUTH_URL="$orbit_url" bun run build); then
  warn "Build failed — retrying after reinstalling esbuild..."
  (cd "$ZANE_HOME" && rm -rf node_modules/esbuild node_modules/.cache && bun install --silent)
  (cd "$ZANE_HOME" && AUTH_URL="$orbit_url" bun run build)
fi

# Create Pages project if it doesn't exist
echo "  Ensuring Pages project exists..."
CI=true wrangler_tty pages project create zane --production-branch main 2>/dev/null || true

pages_output=$(cd "$ZANE_HOME" && CI=true wrangler_tty pages deploy dist --project-name zane --commit-dirty=true 2>&1) || true
echo "$pages_output"

pages_url=$(echo "$pages_output" | grep -oE 'https://[^ ]+\.pages\.dev' | awk '!seen[$0]++' | grep -E '^https://[^.]+\.pages\.dev$' | head -1 || true)
if [[ -z "$pages_url" ]]; then
  pages_url=$(echo "$pages_output" | grep -oE 'https://[^ ]+\.pages\.dev' | head -1 || true)
fi
if [[ -n "$pages_url" ]]; then
  pages_url=$(normalize_pages_url "$pages_url")
fi
if [[ -z "$pages_url" ]]; then
  warn "Could not detect Pages URL from deploy output."
  printf "  Enter your Pages URL (e.g. https://zane-xxx.pages.dev): "
  read -r pages_url < /dev/tty
fi

pass "Web deployed: $pages_url"

# ── Set PASSKEY_ORIGIN and redeploy orbit ───────
step "8. Setting PASSKEY_ORIGIN"

echo "$pages_url" | (cd "$ZANE_HOME/services/orbit" && wrangler secret put PASSKEY_ORIGIN) 2>/dev/null || true
pass "PASSKEY_ORIGIN set to $pages_url"

echo "  Redeploying orbit so the secret takes effect..."
(cd "$ZANE_HOME/services/orbit" && wrangler_tty deploy) 2>/dev/null || warn "Orbit redeploy failed — run: cd services/orbit && wrangler deploy"
pass "Orbit redeployed"

# ── Generate .env for anchor ────────────────────
step "9. Configuring anchor"

cat > "$ENV_FILE" <<ENVEOF
# Zane Anchor Configuration (self-host)
ANCHOR_PORT=8788
ANCHOR_ORBIT_URL=${orbit_ws_url}
AUTH_URL=${orbit_url}
ANCHOR_JWT_TTL_SEC=300
ANCHOR_APP_CWD=
ENVEOF

pass "Anchor configuration saved to $ENV_FILE"

# ── Summary ─────────────────────────────────────
echo ""
printf "${GREEN}${BOLD}Self-host deployment complete!${RESET}\n"
echo ""
printf "  ${BOLD}Web:${RESET}    %s\n" "$pages_url"
printf "  ${BOLD}Orbit:${RESET}  %s\n" "$orbit_url"
echo ""
echo "  Next steps:"
printf "    1. Open ${BOLD}%s${RESET} and create your account\n" "$pages_url"
printf "    2. Run ${BOLD}zane start${RESET} to sign in and launch the anchor\n"
echo ""
