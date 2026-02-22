#!/usr/bin/env bash
set -euo pipefail

# ── Zane Installer ──────────────────────────────
# Usage: curl -fsSL https://raw.githubusercontent.com/cospec-ai/zane/main/install.sh | bash

ZANE_HOME="${ZANE_HOME:-$HOME/.zane}"
ZANE_REPO="${ZANE_REPO:-https://github.com/cospec-ai/zane.git}"
ZANE_BRANCH="${ZANE_BRANCH:-}"

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

resolve_origin_branch() {
  local repo="$1"
  local remote_head
  remote_head=$(git -C "$repo" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
  if [[ -n "$remote_head" ]]; then
    printf "%s" "${remote_head#origin/}"
    return
  fi
  printf "main"
}

ensure_env_file() {
  if [[ -f "$ZANE_HOME/.env" ]]; then
    return 0
  fi
  if [[ -f "$ZANE_HOME/.env.example" ]]; then
    cp "$ZANE_HOME/.env.example" "$ZANE_HOME/.env"
    pass "Created .env from .env.example"
    return 0
  fi

  cat > "$ZANE_HOME/.env" <<ENVEOF
# Zane Anchor Configuration (self-host)
# Run 'zane self-host' to complete setup.
ANCHOR_PORT=8788
ANCHOR_ORBIT_URL=
AUTH_URL=
ANCHOR_JWT_TTL_SEC=300
ANCHOR_APP_CWD=
ENVEOF
  warn ".env.example not found; created a minimal .env file."
}

# ── Cleanup on failure ──────────────────────────
cleanup() {
  if [[ $? -ne 0 ]]; then
    echo ""
    warn "Installation failed. Partial files may exist at $ZANE_HOME"
  fi
}
trap cleanup EXIT

# ── Banner ──────────────────────────────────────
echo ""
printf "${BOLD}Zane Installer${RESET}\n"
echo ""

# ── Check OS ────────────────────────────────────
if [[ "$(uname -s)" != "Darwin" ]]; then
  abort "Zane currently only supports macOS. Linux and Windows support is coming soon."
fi
pass "macOS detected"

# ── Check git ───────────────────────────────────
step "Checking prerequisites..."

if command -v git &>/dev/null; then
  pass "git installed"
else
  warn "git not found. Installing Xcode Command Line Tools..."
  xcode-select --install 2>/dev/null || true
  echo "   Please complete the Xcode CLT installation and re-run this script."
  exit 1
fi

# ── Check/install Bun ───────────────────────────
if command -v bun &>/dev/null; then
  pass "bun $(bun --version)"
else
  warn "bun not found"
  if confirm "  Install bun?"; then
    curl -fsSL https://bun.sh/install | bash
    # Source bun into current shell
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
    if command -v bun &>/dev/null; then
      pass "bun installed ($(bun --version))"
    else
      abort "Failed to install bun. Install manually: https://bun.sh"
    fi
  else
    abort "bun is required. Install it from https://bun.sh"
  fi
fi

# ── Check/install codex CLI ─────────────────────
if command -v codex &>/dev/null; then
  pass "codex CLI installed"
else
  warn "codex CLI not found"
  echo ""
  echo "  The codex CLI is required to run Zane."
  echo ""
  if command -v brew &>/dev/null; then
    if confirm "  Install codex via Homebrew?"; then
      brew install codex
      if command -v codex &>/dev/null; then
        pass "codex installed"
      else
        abort "Failed to install codex."
      fi
    else
      abort "codex is required. Install it manually: https://github.com/openai/codex"
    fi
  else
    echo "  Install codex manually and re-run this script."
    echo "  See: https://github.com/openai/codex"
    exit 1
  fi
fi

# ── Check codex authentication ──────────────────
echo ""
echo "  Checking codex authentication..."
if codex login status &>/dev/null; then
  pass "codex authenticated"
else
  warn "codex is not authenticated"
  echo ""
  echo "  Please run 'codex login' to authenticate, then re-run this script."
  echo ""
  if confirm "  Run 'codex login' now?"; then
    codex login
    if codex login status &>/dev/null; then
      pass "codex authenticated"
    else
      warn "codex authentication may have failed. You can try again later."
    fi
  fi
fi

# ── Clone/update repo ──────────────────────────
step "Installing Zane to $ZANE_HOME..."

if [[ -d "$ZANE_HOME/.git" ]]; then
  echo "  Existing installation found. Updating..."
  if [[ -n "$(git -C "$ZANE_HOME" status --porcelain)" ]]; then
    warn "Local changes detected and will be overwritten."
  fi
  warn "Resetting local checkout to the remote branch state."

  retry 3 3 "git fetch" git -C "$ZANE_HOME" fetch --prune origin \
    || abort "Failed to fetch updates from origin."

  target_branch="$ZANE_BRANCH"
  if [[ -z "$target_branch" ]]; then
    target_branch=$(resolve_origin_branch "$ZANE_HOME")
  fi

  if ! git -C "$ZANE_HOME" show-ref --verify --quiet "refs/remotes/origin/$target_branch"; then
    abort "Remote branch origin/$target_branch not found."
  fi

  before=$(git -C "$ZANE_HOME" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  git -C "$ZANE_HOME" reset --hard --quiet "origin/$target_branch"
  git -C "$ZANE_HOME" clean -fd --quiet
  after=$(git -C "$ZANE_HOME" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  pass "Updated $before -> $after (origin/$target_branch)"
else
  if [[ -d "$ZANE_HOME" ]]; then
    warn "$ZANE_HOME exists but is not a git repo. Backing up..."
    mv "$ZANE_HOME" "$ZANE_HOME.bak.$(date +%s)"
  fi
  if [[ -n "$ZANE_BRANCH" ]]; then
    retry 3 3 "git clone" git clone --depth 1 --branch "$ZANE_BRANCH" "$ZANE_REPO" "$ZANE_HOME" \
      || abort "Failed to clone $ZANE_REPO ($ZANE_BRANCH)."
  else
    retry 3 3 "git clone" git clone --depth 1 "$ZANE_REPO" "$ZANE_HOME" \
      || abort "Failed to clone $ZANE_REPO."
  fi
  pass "Cloned repository"
fi

# ── Install anchor dependencies ─────────────────
echo "  Installing anchor dependencies..."
retry 3 3 "Anchor dependency install" bash -c 'cd "$1/services/anchor" && bun install --silent' _ "$ZANE_HOME" \
  || abort "Failed to install Anchor dependencies."
pass "Anchor dependencies installed"

# ── Install CLI ─────────────────────────────────
step "Installing CLI..."

mkdir -p "$ZANE_HOME/bin"

cli_src="$ZANE_HOME/bin/zane"
if [[ ! -f "$cli_src" ]]; then
  abort "CLI script not found at $cli_src"
fi

chmod +x "$cli_src"
pass "CLI installed at $ZANE_HOME/bin/zane"

# Add to PATH
path_line="export PATH=\"$ZANE_HOME/bin:\$PATH\""
added_to=""

for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [[ -f "$rc" ]]; then
    if ! grep -q 'zane/bin' "$rc"; then
      echo "" >> "$rc"
      echo "# Zane" >> "$rc"
      echo "$path_line" >> "$rc"
      added_to="${added_to} $(basename "$rc")"
    fi
  fi
done

# If neither rc file existed, create .zshrc (macOS default shell)
if [[ -z "$added_to" ]]; then
  echo "" >> "$HOME/.zshrc"
  echo "# Zane" >> "$HOME/.zshrc"
  echo "$path_line" >> "$HOME/.zshrc"
  added_to=" .zshrc"
fi

# Make it available in the current shell
export PATH="$ZANE_HOME/bin:$PATH"

pass "Added to PATH in$added_to"

# ── Self-host setup ────────────────────────────
step "Self-host setup"
local_wizard="$ZANE_HOME/bin/self-host.sh"
if [[ ! -f "$local_wizard" ]]; then
  warn "Self-host wizard not found at $local_wizard"
  ensure_env_file
  warn "Run 'zane self-host' after installation."
elif confirm "  Run self-host deployment now?"; then
  printf "  ${DIM}Deploying to your Cloudflare account...${RESET}\n"
  # shellcheck source=/dev/null
  source "$local_wizard"
else
  ensure_env_file
  echo "  Skipped cloud deployment. Run 'zane self-host' when you're ready."
fi

# ── Done ────────────────────────────────────────
echo ""
printf "${GREEN}${BOLD}Zane installed successfully!${RESET}\n"
echo ""
echo "  Get started:"
printf "    ${BOLD}zane start${RESET}    Start the anchor service\n"
printf "    ${BOLD}zane doctor${RESET}   Check your setup\n"
printf "    ${BOLD}zane config${RESET}   Edit configuration\n"
printf "    ${BOLD}zane help${RESET}     See all commands\n"
echo ""
echo "  You may need to restart your terminal or run:"
echo "    source ~/.zshrc"
echo ""
