# Anchor

Local bridge that runs `codex app-server` and relays JSON-RPC over WebSocket.

## Run

```bash
cd services/anchor
bun install
bun run dev
```

Requirements:
- Codex CLI installed and authenticated (`codex login`)
- `codex app-server` available on PATH

WebSocket endpoint:
- `ws://localhost:8788/ws/anchor`
