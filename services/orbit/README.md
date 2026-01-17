# Orbit

Cloudflare Worker + Durable Object relay between Anchor and the web client.

## Run (local)

```bash
cd services/orbit
bun install
bun run dev
```

## Endpoints

- `GET /health`
- `GET /ws/client`
- `GET /ws/anchor`
- `GET /threads/:id/events` (NDJSON, requires D1)

## Auth

If `ORBIT_TOKEN` is set, provide it as:
- `Authorization: Bearer <token>` header, or
- `?token=<token>` query param (for browsers)

## D1 events storage

Orbit can persist JSON-RPC events to D1 and serves them via
`GET /threads/:id/events`.

Setup:
1. Create a D1 database (example name `zane-orbit`).
2. Update `wrangler.toml` with the real `database_id`.
3. Apply migrations:

```bash
bunx wrangler d1 migrations apply zane-orbit --remote
```
