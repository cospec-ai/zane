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
  [[ -r /dev/tty ]] || abort "Interactive setup requires a TTY."
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

RETRY_LAST_OUTPUT=""
retry_capture() {
  local attempts="$1" delay="$2" desc="$3"
  shift 3
  local i out status
  RETRY_LAST_OUTPUT=""
  for ((i = 1; i <= attempts; i++)); do
    out=$("$@" 2>&1) && {
      RETRY_LAST_OUTPUT="$out"
      return 0
    }
    status=$?
    RETRY_LAST_OUTPUT="$out"
    if ((i < attempts)); then
      warn "$desc failed (attempt $i/$attempts) — retrying in ${delay}s..."
      sleep "$delay"
    fi
  done
  return "${status:-1}"
}

wrangler_tty() {
  # Installer is often run via curl|bash (stdin is a pipe). Force tty stdin for wrangler auth flows.
  if [[ -r /dev/tty ]]; then
    wrangler "$@" < /dev/tty
  else
    wrangler "$@"
  fi
}

is_https_url() {
  local value="$1"
  [[ "$value" =~ ^https://[^[:space:]]+$ ]]
}

prompt_for_required_url() {
  local variable_name="$1"
  local prompt="$2"
  local value=""
  while true; do
    printf "%s" "$prompt"
    read -r value < /dev/tty
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if is_https_url "$value"; then
      printf -v "$variable_name" "%s" "$value"
      return 0
    fi
    warn "Please enter a valid https:// URL."
  done
}

put_orbit_secret() {
  local name="$1"
  local value="$2"

  # Wrangler v4 versioned workflow
  if printf "%s" "$value" | (cd "$ZANE_HOME/services/orbit" && wrangler versions secret put "$name"); then
    return 0
  fi

  # Fallback for older Wrangler behavior
  printf "%s" "$value" | (cd "$ZANE_HOME/services/orbit" && wrangler secret put "$name")
}

deploy_orbit() {
  (cd "$ZANE_HOME/services/orbit" && wrangler_tty deploy)
}

set_orbit_secret() {
  local name="$1"
  local value="$2"

  if retry 2 2 "Setting secret $name" put_orbit_secret "$name" "$value" >/dev/null 2>&1; then
    pass "$name set"
    return
  fi

  warn "Secret update failed for $name on first attempt; redeploying orbit and retrying..."
  if ! retry_capture 2 3 "Orbit redeploy for $name" deploy_orbit; then
    echo "$RETRY_LAST_OUTPUT"
    abort "Failed to redeploy orbit while setting secret: $name"
  fi

  if ! retry_capture 2 2 "Setting secret $name after redeploy" put_orbit_secret "$name" "$value"; then
    echo "$RETRY_LAST_OUTPUT"
    abort "Failed to set orbit secret after retry: $name"
  fi

  pass "$name set"
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

generate_vapid_keys() {
  bun --silent -e '
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    const toBase64Url = (bytes) => Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    console.log(`VAPID_PUBLIC_KEY=${toBase64Url(rawPublic)}`);
    console.log(`VAPID_PRIVATE_KEY=${privateJwk.d ?? ""}`);
  '
}

list_d1_databases() {
  wrangler_tty d1 list --json
}

create_d1_database() {
  wrangler_tty d1 create zane
}

run_migrations() {
  (cd "$ZANE_HOME" && wrangler_tty d1 migrations apply zane --remote)
}

install_orbit_deps() {
  (cd "$ZANE_HOME/services/orbit" && bun install --silent)
}

install_web_deps() {
  (cd "$ZANE_HOME" && bun install --silent)
}

build_web() {
  local auth_url="$1"
  local public_key="$2"
  (cd "$ZANE_HOME" && AUTH_URL="$auth_url" VAPID_PUBLIC_KEY="$public_key" bun run build)
}

create_pages_project() {
  (cd "$ZANE_HOME" && CI=true wrangler_tty pages project create zane --production-branch main)
}

deploy_pages() {
  (cd "$ZANE_HOME" && CI=true wrangler_tty pages deploy dist --project-name zane --commit-dirty=true)
}

# ── Preflight ────────────────────────────────────
step "0. Validating local setup"

[[ -r /dev/tty ]] || abort "This wizard requires an interactive terminal."
[[ -d "$ZANE_HOME" ]] || abort "ZANE_HOME not found: $ZANE_HOME"
[[ -d "$ZANE_HOME/services/orbit" ]] || abort "Orbit service not found at $ZANE_HOME/services/orbit"
[[ -f "$ZANE_HOME/wrangler.toml" ]] || abort "Missing $ZANE_HOME/wrangler.toml"
[[ -f "$ZANE_HOME/services/orbit/wrangler.toml" ]] || abort "Missing $ZANE_HOME/services/orbit/wrangler.toml"
[[ -d "$ZANE_HOME/migrations" ]] || abort "Missing migrations directory at $ZANE_HOME/migrations"
command -v bun &>/dev/null || abort "bun is required. Install bun and re-run this wizard."
command -v openssl &>/dev/null || abort "openssl is required to generate secrets."
pass "Local files verified"

# ── Prerequisites ───────────────────────────────
step "1. Checking prerequisites"

if command -v wrangler &>/dev/null; then
  pass "wrangler installed"
else
  warn "wrangler not found"
  if confirm "  Install wrangler globally via bun?"; then
    retry 3 3 "wrangler install" bun add -g wrangler \
      || abort "Failed to install wrangler."
    command -v wrangler &>/dev/null || abort "Failed to install wrangler."
    pass "wrangler installed"
  else
    abort "wrangler is required. Run: bun add -g wrangler"
  fi
fi

if retry_capture 2 2 "Cloudflare whoami" wrangler_tty whoami; then
  pass "Cloudflare authenticated"
else
  warn "Not logged in to Cloudflare"
  echo "$RETRY_LAST_OUTPUT"
  if confirm "  Run 'wrangler login' now?"; then
    wrangler_tty login
    retry_capture 2 2 "Cloudflare whoami" wrangler_tty whoami || {
      echo "$RETRY_LAST_OUTPUT"
      abort "Cloudflare authentication failed."
    }
    pass "Cloudflare authenticated"
  else
    abort "Cloudflare login required. Run: wrangler login"
  fi
fi

# ── Create D1 Database ──────────────────────────
step "2. Creating D1 database"

database_id=""
db_list=""

echo "  Checking for existing database..."
if ! retry_capture 3 3 "Listing D1 databases" list_d1_databases; then
  warn "Failed to list D1 databases."
  echo "$RETRY_LAST_OUTPUT"
  if confirm "  Run 'wrangler login' now?"; then
    wrangler_tty login
    retry_capture 3 3 "Listing D1 databases" list_d1_databases || {
      echo "$RETRY_LAST_OUTPUT"
      abort "Could not list D1 databases."
    }
  else
    abort "Cloudflare login required to list D1 databases."
  fi
fi
db_list="$RETRY_LAST_OUTPUT"

database_id=$(extract_zane_db_uuid_from_list "$db_list")
if [[ -n "$database_id" ]]; then
  pass "Found existing database: $database_id"
else
  echo "  Creating database 'zane'..."
  if ! retry_capture 3 3 "Creating D1 database" create_d1_database; then
    warn "Failed to create D1 database 'zane'."
    echo "$RETRY_LAST_OUTPUT"
    if confirm "  Run 'wrangler login' now?"; then
      wrangler_tty login
      retry_capture 3 3 "Creating D1 database" create_d1_database || {
        echo "$RETRY_LAST_OUTPUT"
        abort "Could not create D1 database 'zane'."
      }
    else
      abort "Could not create D1 database 'zane'."
    fi
  fi

  db_output="$RETRY_LAST_OUTPUT"
  echo "$db_output"
  database_id=$(echo "$db_output" | extract_uuid)

  if [[ -z "$database_id" ]] && retry_capture 3 3 "Listing D1 databases" list_d1_databases; then
    database_id=$(extract_zane_db_uuid_from_list "$RETRY_LAST_OUTPUT")
  fi

  if [[ -z "$database_id" ]]; then
    warn "Could not auto-detect the D1 database UUID."
    echo "  Run 'wrangler d1 list --json' to find your database ID."
    while true; do
      printf "  Enter your D1 database ID: "
      read -r database_id < /dev/tty
      if [[ "$database_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
        break
      fi
      warn "Please enter a valid UUID."
    done
  fi
fi

pass "Database ID: $database_id"

# ── Update wrangler.toml files ──────────────────
step "3. Updating wrangler.toml configurations"

for toml_path in \
  "$ZANE_HOME/wrangler.toml" \
  "$ZANE_HOME/services/orbit/wrangler.toml"; do
  sed -i '' "s/database_id = \"[^\"]*\"/database_id = \"$database_id\"/" "$toml_path"
  pass "Updated $(basename "$(dirname "$toml_path")")/wrangler.toml"
done

# ── Generate secrets ────────────────────────────
step "4. Generating secrets"

web_jwt_secret=$(openssl rand -base64 32)
anchor_jwt_secret=$(openssl rand -base64 32)

if ! vapid_output="$(generate_vapid_keys 2>/dev/null)"; then
  abort "Failed to generate VAPID keys."
fi

vapid_public_key=$(echo "$vapid_output" | grep '^VAPID_PUBLIC_KEY=' | cut -d= -f2- || true)
vapid_private_key=$(echo "$vapid_output" | grep '^VAPID_PRIVATE_KEY=' | cut -d= -f2- || true)
[[ -n "$vapid_public_key" && -n "$vapid_private_key" ]] || abort "Failed to parse generated VAPID keys."
vapid_subject="mailto:admin@zane.invalid"

pass "ZANE_WEB_JWT_SECRET generated"
pass "ZANE_ANCHOR_JWT_SECRET generated"
pass "VAPID keypair generated"

# ── Run database migrations ─────────────────────
step "5. Running database migrations"
if ! retry_capture 3 5 "Migrations" run_migrations; then
  echo "$RETRY_LAST_OUTPUT"
  abort "Database migrations failed after 3 attempts."
fi
pass "Migrations applied"

# ── Deploy orbit worker ─────────────────────────
step "6. Deploying orbit worker"

retry 3 3 "Orbit dependency install" install_orbit_deps \
  || abort "Failed to install Orbit dependencies."

if ! retry_capture 3 5 "Orbit deploy" deploy_orbit; then
  echo "$RETRY_LAST_OUTPUT"
  abort "Failed to deploy orbit worker."
fi
orbit_output="$RETRY_LAST_OUTPUT"
echo "$orbit_output"

set_orbit_secret "ZANE_WEB_JWT_SECRET" "$web_jwt_secret"
set_orbit_secret "ZANE_ANCHOR_JWT_SECRET" "$anchor_jwt_secret"

orbit_url=$(echo "$orbit_output" | grep -oE 'https://[^ ]+\.workers\.dev' | head -1 || true)
if ! is_https_url "$orbit_url"; then
  warn "Could not detect orbit URL from deploy output."
  prompt_for_required_url orbit_url "  Enter your orbit worker URL (e.g. https://orbit.your-subdomain.workers.dev): "
fi
pass "Orbit worker deployed: $orbit_url"

orbit_ws_url=$(echo "$orbit_url" | sed 's|^https://|wss://|')/ws/anchor

# ── Build and deploy web ────────────────────────
step "7. Building and deploying web frontend"

retry 3 3 "Web dependency install" install_web_deps \
  || abort "Failed to install web dependencies."

echo "  Building with AUTH_URL=$orbit_url and VAPID_PUBLIC_KEY configured ..."
if ! retry_capture 2 3 "Web build" build_web "$orbit_url" "$vapid_public_key"; then
  warn "Build failed — retrying after reinstalling esbuild..."
  (cd "$ZANE_HOME" && rm -rf node_modules/esbuild node_modules/.cache)
  retry 3 3 "Web dependency reinstall" install_web_deps \
    || abort "Failed to reinstall web dependencies."
  if ! retry_capture 2 3 "Web build after reinstall" build_web "$orbit_url" "$vapid_public_key"; then
    echo "$RETRY_LAST_OUTPUT"
    abort "Failed to build web frontend."
  fi
fi

echo "  Ensuring Pages project exists..."
if retry_capture 2 3 "Pages project create" create_pages_project; then
  pass "Pages project ready"
elif echo "$RETRY_LAST_OUTPUT" | grep -qi "already exists"; then
  pass "Pages project already exists"
else
  warn "Could not verify Pages project creation automatically. Continuing to deploy."
  echo "$RETRY_LAST_OUTPUT"
fi

if ! retry_capture 3 5 "Pages deploy" deploy_pages; then
  echo "$RETRY_LAST_OUTPUT"
  abort "Failed to deploy web frontend to Pages."
fi
pages_output="$RETRY_LAST_OUTPUT"
echo "$pages_output"

pages_url=$(echo "$pages_output" | grep -oE 'https://[^ ]+\.pages\.dev' | awk '!seen[$0]++' | grep -E '^https://[^.]+\.pages\.dev$' | head -1 || true)
if [[ -z "$pages_url" ]]; then
  pages_url=$(echo "$pages_output" | grep -oE 'https://[^ ]+\.pages\.dev' | head -1 || true)
fi
if [[ -n "$pages_url" ]]; then
  pages_url=$(normalize_pages_url "$pages_url")
fi
if ! is_https_url "$pages_url"; then
  warn "Could not detect a valid web URL from deploy output."
  prompt_for_required_url pages_url "  Enter your Pages URL (e.g. https://zane-xxx.pages.dev): "
fi

pass "Web deployed: $pages_url"

# ── Set PASSKEY_ORIGIN and redeploy orbit ───────
step "8. Setting PASSKEY_ORIGIN and push secrets"

pages_host=$(echo "$pages_url" | sed -E 's#^https?://([^/]+).*$#\1#')
if [[ -n "$pages_host" ]]; then
  vapid_subject="mailto:admin@${pages_host}"
fi

set_orbit_secret "PASSKEY_ORIGIN" "$pages_url"
set_orbit_secret "VAPID_PUBLIC_KEY" "$vapid_public_key"
set_orbit_secret "VAPID_PRIVATE_KEY" "$vapid_private_key"
set_orbit_secret "VAPID_SUBJECT" "$vapid_subject"

echo "  Redeploying orbit so the secrets take effect..."
if ! retry_capture 3 5 "Orbit redeploy" deploy_orbit; then
  echo "$RETRY_LAST_OUTPUT"
  abort "Orbit redeploy failed after secret updates."
fi
pass "Orbit redeployed"

# ── Generate .env for anchor ────────────────────
step "9. Configuring anchor"

tmp_env_file=$(mktemp "$ZANE_HOME/.env.tmp.XXXXXX") || abort "Failed to prepare temporary .env file."
cat > "$tmp_env_file" <<ENVEOF
# Zane Anchor Configuration (self-host)
ANCHOR_PORT=8788
ANCHOR_ORBIT_URL=${orbit_ws_url}
AUTH_URL=${orbit_url}
VAPID_PUBLIC_KEY=${vapid_public_key}
ANCHOR_JWT_TTL_SEC=300
ANCHOR_APP_CWD=
D1_DATABASE_ID=${database_id}
ENVEOF
mv "$tmp_env_file" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

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
