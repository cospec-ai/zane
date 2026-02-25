import {
  appServer,
  appServerStarting,
  appServerInitialized,
  warnedNoAppServer,
  setAppServer,
  setAppServerStarting,
  setAppServerInitialized,
  setWarnedNoAppServer,
  clients,
  orbitSocket,
  pendingApprovals,
  approvalRpcIds,
  APPROVAL_METHODS,
} from "./config";
import { parseJsonRpcMessage, extractThreadId } from "./utils";
import { subscribeToThread } from "./orbit";

export function sendToAppServer(payload: string): void {
  if (!appServer || appServer.stdin === undefined || typeof appServer.stdin === "number") {
    if (!warnedNoAppServer) {
      console.warn("[anchor] app-server not running; cannot forward payload");
      setWarnedNoAppServer(true);
    }
    return;
  }

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

export function ensureAppServer(): void {
  if (appServer || appServerStarting) return;
  setAppServerStarting(true);

  try {
    const proc = Bun.spawn({
      cmd: ["codex", "app-server"],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    setAppServer(proc);
    setWarnedNoAppServer(false);
    setAppServerInitialized(false);
    initializeAppServer();

    proc.exited.then((code) => {
      console.warn(`[anchor] app-server exited with code ${code}`);
      setAppServer(null);
      setAppServerInitialized(false);
      pendingApprovals.clear();
      approvalRpcIds.clear();
    });

    streamLines(proc.stdout, (line) => {
      const parsed = parseJsonRpcMessage(line);
      if (parsed) {
        const threadId = extractThreadId(parsed);
        if (threadId) {
          subscribeToThread(threadId);
        }

        const method = parsed.method as string | undefined;
        if (method && APPROVAL_METHODS.has(method) && threadId) {
          pendingApprovals.set(threadId, line);
          const rpcId = parsed.id as number | string | undefined;
          if (rpcId != null) approvalRpcIds.set(rpcId, threadId);
        } else if (method === "turn/completed" && threadId) {
          pendingApprovals.delete(threadId);
        }
      }

      for (const client of clients) {
        try {
          client.send(line);
        } catch (err) {
          console.warn("[anchor] failed to send to client", err);
        }
      }

      if (orbitSocket && orbitSocket.readyState === WebSocket.OPEN) {
        try {
          orbitSocket.send(line);
        } catch (err) {
          console.warn("[anchor] failed to send to orbit", err);
        }
      }
    });

    streamLines(proc.stderr, (line) => {
      console.error(`[app-server] ${line}`);
    });
  } catch (err) {
    console.error("[anchor] failed to start codex app-server", err);
    setAppServer(null);
  } finally {
    setAppServerStarting(false);
  }
}

function initializeAppServer(): void {
  if (appServerInitialized) return;
  const initPayload = JSON.stringify({
    method: "initialize",
    id: Date.now(),
    params: {
      clientInfo: {
        name: "zane-anchor",
        title: "Zane Anchor",
        version: "dev",
      },
      capabilities: {
        experimentalApi: true,
      },
    },
  });
  console.log("[anchor] app-server initialize");
  sendToAppServer(initPayload + "\n");
  setAppServerInitialized(true);
}

function isWritableStream(input: unknown): input is WritableStream<Uint8Array> {
  return typeof (input as WritableStream<Uint8Array>)?.getWriter === "function";
}

function isFileSink(input: unknown): input is { write: (data: string | Uint8Array) => void } {
  return typeof (input as { write?: unknown })?.write === "function";
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
