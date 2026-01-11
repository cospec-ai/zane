import type { WsClient } from "./types.ts";

const PORT = Number(process.env.ANCHOR_PORT ?? 8788);
const AUTH_TOKEN = process.env.ANCHOR_TOKEN ?? "";
const AUTOSTART = (process.env.ANCHOR_AUTOSTART ?? "true").toLowerCase() === "true";

const clients = new Set<WsClient>();
let appServer: Bun.Subprocess | null = null;
let appServerStarting = false;

function isAuthorised(req: Request): boolean {
  if (!AUTH_TOKEN) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${AUTH_TOKEN}`;
}

function ensureAppServer(): void {
  if (appServer || appServerStarting) return;
  appServerStarting = true;

  try {
    appServer = Bun.spawn({
      cmd: ["codex", "app-server"],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    appServer.exited.then((code) => {
      console.warn(`[anchor] app-server exited with code ${code}`);
      appServer = null;
    });

    streamLines(appServer.stdout, (line) => {
      for (const client of clients) {
        try {
          client.send(line);
        } catch (err) {
          console.warn("[anchor] failed to send to client", err);
        }
      }
    });

    streamLines(appServer.stderr, (line) => {
      console.error(`[app-server] ${line}`);
    });
  } catch (err) {
    console.error("[anchor] failed to start codex app-server", err);
    appServer = null;
  } finally {
    appServerStarting = false;
  }
}

function isWritableStream(input: unknown): input is WritableStream<Uint8Array> {
  return typeof (input as WritableStream<Uint8Array>)?.getWriter === "function";
}

function isFileSink(input: unknown): input is { write: (data: string | Uint8Array) => void } {
  return typeof (input as { write?: unknown })?.write === "function";
}

function sendToAppServer(payload: string): void {
  if (!appServer || appServer.stdin === undefined || typeof appServer.stdin === "number") return;

  const stdin = appServer.stdin;
  if (isWritableStream(stdin)) {
    const writer = stdin.getWriter();
    writer.write(new TextEncoder().encode(payload));
    writer.releaseLock();
    return;
  }
  if (isFileSink(stdin)) {
    stdin.write(payload);
  }
}

function normalizeLine(input: string): string {
  const trimmed = input.replace(/\r?\n$/, "");
  return `${trimmed}\n`;
}

async function streamLines(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  if (!stream || typeof stream === "number") return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.length === 0) continue;
      onLine(part);
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) onLine(tail);
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return new Response(null, { status: 200 });
    }

    if (url.pathname === "/ws/anchor" || url.pathname === "/ws") {
      if (!isAuthorised(req)) {
        return new Response("Unauthorised", { status: 401 });
      }

      if (server.upgrade(req)) return new Response(null, { status: 101 });
      return new Response("Upgrade required", { status: 426 });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws as WsClient);
      ensureAppServer();
      ws.send(
        JSON.stringify({
          type: "anchor.hello",
          ts: new Date().toISOString(),
        }),
      );
    },
    message(_ws, message) {
      ensureAppServer();
      if (!appServer) return;
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      sendToAppServer(normalizeLine(text));
    },
    close(ws) {
      clients.delete(ws as WsClient);
    },
  },
});

if (AUTOSTART) {
  ensureAppServer();
}

console.log(`[anchor] listening on http://localhost:${server.port}`);
console.log(`[anchor] websocket: ws://localhost:${server.port}/ws`);
