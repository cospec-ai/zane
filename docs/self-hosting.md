# Self-Hosting

Zane can be fully self-hosted on your own Cloudflare account. The `zane self-host` wizard automates the entire process, but this page explains what it does and what you need beforehand.

## Prerequisites

- **macOS** with [Bun](https://bun.sh) and [Codex CLI](https://github.com/openai/codex) installed
- **A Cloudflare account** (the [free tier](https://www.cloudflare.com/plans/) is sufficient)
- **Zane installed** via the [install script](installation.md)

The wizard will install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (the Cloudflare CLI) and prompt you to log in if needed.

## What gets deployed

The wizard deploys two services to your Cloudflare account:

| Service | Platform | Purpose |
|---------|----------|---------|
| **Orbit** | Cloudflare Worker + Durable Object | Passkey auth, JWT issuance, WebSocket relay between devices and Anchor |
| **Web** | Cloudflare Pages | Static Svelte frontend |

It also creates a shared **D1 database** (SQLite) for auth sessions and passkey credentials.

Orbit uses two generated JWT secrets (`ZANE_WEB_JWT_SECRET` and `ZANE_ANCHOR_JWT_SECRET`) that are set as Cloudflare secrets automatically.

## Running the wizard

```bash
zane self-host
```

You can run this either:

1. During `install.sh` when prompted, or
2. Later from your terminal with `zane self-host`.

The wizard walks through 10 steps:

1. Validates local project files and required tools
2. Checks for Wrangler and Cloudflare login
3. Creates (or reuses) the D1 database
4. Updates `wrangler.toml` files with the database ID
5. Generates JWT and VAPID secrets
6. Runs database migrations
7. Deploys the Orbit worker and sets secrets
8. Builds and deploys the web frontend to Pages
9. Sets `PASSKEY_ORIGIN` and VAPID secrets
10. Writes the Anchor `.env` with Orbit URLs and database ID

At the end, it prints your deployment URLs and next steps.

## Failure behavior

`zane self-host` now fails fast for critical deployment steps (migrations, worker deploy, Pages deploy, secret updates, final redeploy) and exits non-zero on failure.

If it fails, fix the reported issue and rerun `zane self-host`. The flow is designed to be safely rerunnable.

## After deployment

1. Open your Pages URL (printed by the wizard) and create your account
2. Run `zane start` to connect your local Anchor to your self-hosted Orbit

## Updating a self-hosted deployment

`zane update` now redeploys web + orbit automatically when self-host settings are present in `.env`.

If `zane update` fails on deploy, rerun the same command after fixing prerequisites (for example Wrangler auth), or redeploy manually:

```bash
# Redeploy orbit worker
(cd ~/.zane/services/orbit && wrangler deploy)

# Rebuild and redeploy web frontend
(cd ~/.zane && bun run build && wrangler pages deploy dist --project-name zane)
```

## Architecture

See [architecture.md](architecture.md) for details on how the components communicate.
