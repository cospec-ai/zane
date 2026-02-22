import { hostname, homedir } from "node:os";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import type { WsClient } from "./types";

const PORT = Number(process.env.ANCHOR_PORT ?? 8788);
const ORBIT_URL = process.env.ANCHOR_ORBIT_URL ?? "";
const ANCHOR_JWT_TTL_SEC = Number(process.env.ANCHOR_JWT_TTL_SEC ?? 300);
const AUTH_URL = process.env.AUTH_URL ?? "";
const FORCE_LOGIN = process.env.ZANE_FORCE_LOGIN === "1";
const CREDENTIALS_FILE = process.env.ZANE_CREDENTIALS_FILE ?? "";
const startedAt = Date.now();

let ZANE_ANCHOR_JWT_SECRET = "";
let USER_ID: string | undefined;

const MAX_SUBSCRIBED_THREADS = 1000;
const clients = new Set<WsClient>();
const subscribedThreads = new Set<string>();
let appServer: Bun.Subprocess | null = null;
let appServerStarting = false;
let orbitSocket: WebSocket | null = null;
let orbitConnecting = false;
let orbitHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
let orbitHeartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
let warnedNoAppServer = false;
let appServerInitialized = false;

// Buffer pending approval requests from app-server so we can re-send them
// when a client (re)subscribes to a thread via orbit.
const APPROVAL_METHODS = new Set([
  "item/fileChange/requestApproval",
  "item/commandExecution/requestApproval",
  "item/tool/requestUserInput",
]);
const pendingApprovals = new Map<string, string>(); // threadId → raw JSON line
const approvalRpcIds = new Map<number | string, string>(); // rpcId → threadId (for cleanup on response)

async function handleListDirs(
  id: number | string,
  params: JsonObject | null,
): Promise<JsonObject> {
  const raw = params?.path;
  const targetPath = typeof raw === "string" && raw.trim() ? raw.trim() : homedir();
  try {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    return { id, result: { dirs, parent: dirname(targetPath), current: targetPath } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list directory";
    return { id, error: { code: -1, message } };
  }
}

interface GitCommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface GitWorktree {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
  locked: boolean;
  prunable: boolean;
}

function normalizeAbsolutePath(path: string): string {
  return resolve(path.trim());
}

function ensureAbsolutePath(path: string, field: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  if (!isAbsolute(trimmed)) {
    throw new Error(`${field} must be an absolute path`);
  }
  return normalizeAbsolutePath(trimmed);
}

function getParamString(params: JsonObject | null, key: string): string {
  const value = params?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

async function readProcessStream(stream: ReadableStream<Uint8Array> | number | null | undefined): Promise<string> {
  if (!stream || typeof stream === "number") return "";
  return new Response(stream).text();
}

async function runGitCommand(args: string[], cwd?: string): Promise<GitCommandResult> {
  const command = ["git", ...args];
  try {
    const proc = Bun.spawn({
      cmd: command,
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      readProcessStream(proc.stdout),
      readProcessStream(proc.stderr),
      proc.exited,
    ]);
    return {
      ok: code === 0,
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run git command";
    return { ok: false, code: -1, stdout: "", stderr: message };
  }
}

async function resolveRepoRoot(path: string): Promise<string | null> {
  const result = await runGitCommand(["-C", path, "rev-parse", "--show-toplevel"]);
  if (!result.ok || !result.stdout) return null;
  return normalizeAbsolutePath(result.stdout.split("\n")[0] ?? result.stdout);
}

async function readCurrentBranch(repoRoot: string): Promise<string | null> {
  const result = await runGitCommand(["-C", repoRoot, "symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!result.ok || !result.stdout) return null;
  return result.stdout.split("\n")[0] ?? null;
}

function parseBranchRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("refs/heads/")) return trimmed.slice("refs/heads/".length);
  return trimmed;
}

function parseWorktreeList(porcelain: string, mainPath: string): GitWorktree[] {
  const blocks = porcelain
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const parsed: GitWorktree[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    let path = "";
    let branch: string | null = null;
    let head = "";
    let locked = false;
    let prunable = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch ")) {
        branch = parseBranchRef(line.slice("branch ".length));
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("locked")) {
        locked = true;
      } else if (line.startsWith("prunable")) {
        prunable = true;
      }
    }

    if (!path) continue;
    const normalizedPath = normalizeAbsolutePath(path);
    parsed.push({
      path: normalizedPath,
      branch,
      head,
      isMain: normalizedPath === mainPath,
      locked,
      prunable,
    });
  }

  return parsed;
}

function makeTimestampSuffix(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${yy}${mm}${dd}-${hh}${min}`;
}

function makeShortUid(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 6).toLowerCase();
  }
  return Math.random().toString(36).slice(2, 8);
}

async function handleGitInspect(id: number | string, params: JsonObject | null): Promise<JsonObject> {
  try {
    const path = ensureAbsolutePath(getParamString(params, "path"), "path");
    const repoRoot = await resolveRepoRoot(path);
    if (!repoRoot) return { id, result: { isGitRepo: false } };
    const currentBranch = await readCurrentBranch(repoRoot);
    return {
      id,
      result: {
        isGitRepo: true,
        repoRoot,
        currentBranch,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to inspect git repository";
    return { id, error: { code: -1, message } };
  }
}

async function handleGitWorktreeList(id: number | string, params: JsonObject | null): Promise<JsonObject> {
  try {
    const repoRoot = ensureAbsolutePath(getParamString(params, "repoRoot"), "repoRoot");
    const resolvedRepoRoot = await resolveRepoRoot(repoRoot);
    if (!resolvedRepoRoot) {
      return { id, error: { code: -1, message: "repoRoot is not a git repository" } };
    }

    const listResult = await runGitCommand(["-C", resolvedRepoRoot, "worktree", "list", "--porcelain"]);
    if (!listResult.ok) {
      return {
        id,
        error: { code: listResult.code || -1, message: listResult.stderr || "Failed to list git worktrees" },
      };
    }

    const worktrees = parseWorktreeList(listResult.stdout, resolvedRepoRoot);
    return {
      id,
      result: {
        repoRoot: resolvedRepoRoot,
        mainPath: resolvedRepoRoot,
        worktrees,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list git worktrees";
    return { id, error: { code: -1, message } };
  }
}

async function handleGitWorktreeCreate(id: number | string, params: JsonObject | null): Promise<JsonObject> {
  try {
    const repoRoot = ensureAbsolutePath(getParamString(params, "repoRoot"), "repoRoot");
    const resolvedRepoRoot = await resolveRepoRoot(repoRoot);
    if (!resolvedRepoRoot) {
      return { id, error: { code: -1, message: "repoRoot is not a git repository" } };
    }

    const providedBranch = typeof params?.branchName === "string" ? params.branchName.trim() : "";
    const branch = providedBranch || `wt-${makeTimestampSuffix()}-${makeShortUid()}`;
    const baseRef = typeof params?.baseRef === "string" && params.baseRef.trim()
      ? params.baseRef.trim()
      : "HEAD";

    const rawPath = typeof params?.path === "string" ? params.path.trim() : "";
    const repoName = basename(resolvedRepoRoot);
    const worktreePath = rawPath
      ? ensureAbsolutePath(rawPath, "path")
      : normalizeAbsolutePath(`${homedir()}/.zane/worktrees/${repoName}/${branch}`);

    await mkdir(dirname(worktreePath), { recursive: true });

    const createResult = await runGitCommand([
      "-C",
      resolvedRepoRoot,
      "worktree",
      "add",
      "-b",
      branch,
      worktreePath,
      baseRef,
    ]);
    if (!createResult.ok) {
      return {
        id,
        error: { code: createResult.code || -1, message: createResult.stderr || "Failed to create worktree" },
      };
    }

    const headResult = await runGitCommand(["-C", worktreePath, "rev-parse", "HEAD"]);
    const head = headResult.ok && headResult.stdout ? headResult.stdout.split("\n")[0] : "";
    return {
      id,
      result: {
        repoRoot: resolvedRepoRoot,
        path: worktreePath,
        branch,
        head,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create git worktree";
    return { id, error: { code: -1, message } };
  }
}

async function handleGitWorktreeRemove(id: number | string, params: JsonObject | null): Promise<JsonObject> {
  try {
    const repoRoot = ensureAbsolutePath(getParamString(params, "repoRoot"), "repoRoot");
    const resolvedRepoRoot = await resolveRepoRoot(repoRoot);
    if (!resolvedRepoRoot) {
      return { id, error: { code: -1, message: "repoRoot is not a git repository" } };
    }
    const path = ensureAbsolutePath(getParamString(params, "path"), "path");
    const force = Boolean(params?.force);

    const args = ["-C", resolvedRepoRoot, "worktree", "remove"];
    if (force) args.push("--force");
    args.push(path);
    const removeResult = await runGitCommand(args);
    if (!removeResult.ok) {
      return {
        id,
        error: { code: removeResult.code || -1, message: removeResult.stderr || "Failed to remove worktree" },
      };
    }

    return { id, result: { removed: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove git worktree";
    return { id, error: { code: -1, message } };
  }
}

async function handleGitWorktreePrune(id: number | string, params: JsonObject | null): Promise<JsonObject> {
  try {
    const repoRoot = ensureAbsolutePath(getParamString(params, "repoRoot"), "repoRoot");
    const resolvedRepoRoot = await resolveRepoRoot(repoRoot);
    if (!resolvedRepoRoot) {
      return { id, error: { code: -1, message: "repoRoot is not a git repository" } };
    }
    const pruneResult = await runGitCommand(["-C", resolvedRepoRoot, "worktree", "prune", "--verbose"]);
    if (!pruneResult.ok) {
      return {
        id,
        error: { code: pruneResult.code || -1, message: pruneResult.stderr || "Failed to prune worktrees" },
      };
    }
    const prunedCount = pruneResult.stdout
      ? pruneResult.stdout.split("\n").map((line) => line.trim()).filter(Boolean).length
      : 0;
    return { id, result: { prunedCount } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to prune git worktrees";
    return { id, error: { code: -1, message } };
  }
}

async function maybeHandleAnchorLocalRpc(message: JsonObject): Promise<JsonObject | null> {
  if (message.id == null || typeof message.method !== "string") return null;
  const id = message.id as number | string;
  const params = asRecord(message.params);

  if (message.method === "anchor.listDirs") {
    return handleListDirs(id, params);
  }
  if (message.method === "anchor.git.inspect") {
    return handleGitInspect(id, params);
  }
  if (message.method === "anchor.git.worktree.list") {
    return handleGitWorktreeList(id, params);
  }
  if (message.method === "anchor.git.worktree.create") {
    return handleGitWorktreeCreate(id, params);
  }
  if (message.method === "anchor.git.worktree.remove") {
    return handleGitWorktreeRemove(id, params);
  }
  if (message.method === "anchor.git.worktree.prune") {
    return handleGitWorktreePrune(id, params);
  }

  return null;
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
    warnedNoAppServer = false;
    appServerInitialized = false;
    initializeAppServer();

    appServer.exited.then((code) => {
      console.warn(`[anchor] app-server exited with code ${code}`);
      appServer = null;
      appServerInitialized = false;
      pendingApprovals.clear();
      approvalRpcIds.clear();
    });

    streamLines(appServer.stdout, (line) => {
      // Auto-subscribe to threads from app-server messages
      const parsed = parseJsonRpcMessage(line);
      if (parsed) {
        const threadId = extractThreadId(parsed);
        if (threadId) {
          subscribeToThread(threadId);
        }

        // Buffer pending approval requests; clear on turn/completed or response
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
  appServerInitialized = true;
}

function isWritableStream(input: unknown): input is WritableStream<Uint8Array> {
  return typeof (input as WritableStream<Uint8Array>)?.getWriter === "function";
}

function isFileSink(input: unknown): input is { write: (data: string | Uint8Array) => void } {
  return typeof (input as { write?: unknown })?.write === "function";
}

function sendToAppServer(payload: string): void {
  if (!appServer || appServer.stdin === undefined || typeof appServer.stdin === "number") {
    if (!warnedNoAppServer) {
      console.warn("[anchor] app-server not running; cannot forward payload");
      warnedNoAppServer = true;
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

type JsonObject = Record<string, unknown>;

function parseJsonRpcMessage(payload: string): JsonObject | null {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as JsonObject;
    if ("method" in parsed || "id" in parsed) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function asRecord(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function extractThreadId(message: JsonObject): string | null {
  const params = asRecord(message.params);
  const result = asRecord(message.result);
  const threadFromParams = asRecord(params?.thread);
  const threadFromResult = asRecord(result?.thread);

  const candidates = [
    params?.threadId,
    params?.thread_id,
    result?.threadId,
    result?.thread_id,
    threadFromParams?.id,
    threadFromResult?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "number") return String(candidate);
  }

  return null;
}

function subscribeToThread(threadId: string): void {
  if (subscribedThreads.has(threadId)) return;
  if (!orbitSocket || orbitSocket.readyState !== WebSocket.OPEN) return;

  subscribedThreads.add(threadId);
  if (subscribedThreads.size > MAX_SUBSCRIBED_THREADS) {
    const oldest = subscribedThreads.values().next().value;
    if (oldest) subscribedThreads.delete(oldest);
  }
  try {
    orbitSocket.send(JSON.stringify({ type: "orbit.subscribe", threadId }));
    console.log(`[anchor] subscribed to thread ${threadId}`);
  } catch (err) {
    console.warn("[anchor] failed to subscribe to thread", err);
    subscribedThreads.delete(threadId);
  }
}

function resubscribeAllThreads(): void {
  if (!orbitSocket || orbitSocket.readyState !== WebSocket.OPEN) return;

  for (const threadId of subscribedThreads) {
    try {
      orbitSocket.send(JSON.stringify({ type: "orbit.subscribe", threadId }));
    } catch (err) {
      console.warn("[anchor] failed to resubscribe to thread", err);
    }
  }

  if (subscribedThreads.size > 0) {
    console.log(`[anchor] resubscribed to ${subscribedThreads.size} thread(s)`);
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwtHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encoder = new TextEncoder();
  const headerPart = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const data = encoder.encode(`${headerPart}.${payloadPart}`);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const signaturePart = base64UrlEncode(signature);
  return `${headerPart}.${payloadPart}.${signaturePart}`;
}

async function buildOrbitUrl(): Promise<string | null> {
  if (!ORBIT_URL) return null;
  try {
    const url = new URL(ORBIT_URL);
    if (ZANE_ANCHOR_JWT_SECRET) {
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwtHs256(
        {
          iss: "zane-anchor",
          aud: "zane-orbit-anchor",
          sub: USER_ID,
          iat: now,
          exp: now + ANCHOR_JWT_TTL_SEC,
        },
        ZANE_ANCHOR_JWT_SECRET
      );
      url.searchParams.set("token", token);
    }
    return url.toString();
  } catch (err) {
    console.error("[anchor] invalid ANCHOR_ORBIT_URL", err);
    return null;
  }
}

type OrbitPreflightResult =
  | { ok: true }
  | { ok: false; kind: "auth"; detail: string }
  | { ok: false; kind: "config"; detail: string }
  | { ok: false; kind: "network"; detail: string };

async function preflightOrbitConnection(): Promise<OrbitPreflightResult> {
  if (!ORBIT_URL) return { ok: true };

  const orbitUrl = await buildOrbitUrl();
  if (!orbitUrl) {
    return { ok: false, kind: "config", detail: "invalid ANCHOR_ORBIT_URL" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(orbitUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);

    // Gateway auth passes first, then Upgrade is checked. 426 means auth accepted.
    if (res.status === 426) return { ok: true };

    const body = (await res.text().catch(() => "")).trim();
    const detail = body || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, kind: "auth", detail };
    }
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, kind: "config", detail };
    }
    return { ok: false, kind: "network", detail };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, kind: "network", detail };
  }
}

function stopOrbitHeartbeat(): void {
  if (orbitHeartbeatInterval) {
    clearInterval(orbitHeartbeatInterval);
    orbitHeartbeatInterval = null;
  }
  if (orbitHeartbeatTimeout) {
    clearTimeout(orbitHeartbeatTimeout);
    orbitHeartbeatTimeout = null;
  }
}

function startOrbitHeartbeat(ws: WebSocket): void {
  stopOrbitHeartbeat();
  orbitHeartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping" }));
        orbitHeartbeatTimeout = setTimeout(() => {
          console.warn("[anchor] heartbeat timeout");
          ws.close();
        }, 10_000);
      } catch {
        ws.close();
      }
    }
  }, 30_000);
}

async function connectOrbit(): Promise<void> {
  let url: string | null = null;
  try {
    url = await buildOrbitUrl();
  } catch (err) {
    console.error("[anchor] failed to build orbit url", err);
  }
  if (!url) return;
  if (orbitSocket && orbitSocket.readyState !== WebSocket.CLOSED) return;
  if (orbitConnecting) return;

  orbitConnecting = true;
  const ws = new WebSocket(url);
  orbitSocket = ws;
  let opened = false;

  ws.addEventListener("open", () => {
    opened = true;
    orbitConnecting = false;
    ws.send(JSON.stringify({
      type: "anchor.hello",
      ts: new Date().toISOString(),
      hostname: hostname(),
      platform: process.platform,
    }));
    console.log("[anchor] connected to orbit");
    startOrbitHeartbeat(ws);
    resubscribeAllThreads();
  });

  ws.addEventListener("message", (event) => {
    const text =
      typeof event.data === "string"
        ? event.data
        : event.data instanceof ArrayBuffer
          ? new TextDecoder().decode(event.data)
          : new TextDecoder().decode(event.data as ArrayBuffer);

    if (text === '{"type":"pong"}') {
      if (orbitHeartbeatTimeout) {
        clearTimeout(orbitHeartbeatTimeout);
        orbitHeartbeatTimeout = null;
      }
      return;
    }

    // Handle orbit protocol messages
    try {
      const parsed = JSON.parse(text) as JsonObject;
      if (typeof parsed.type === "string" && (parsed.type as string).startsWith("orbit.")) {
        // Client (re)subscribed — re-send any pending approval for this thread
        if (parsed.type === "orbit.client-subscribed" && typeof parsed.threadId === "string") {
          const buffered = pendingApprovals.get(parsed.threadId);
          if (buffered && orbitSocket && orbitSocket.readyState === WebSocket.OPEN) {
            // Tag as replay so orbit relays but doesn't double-store
            try {
              const bufferedMsg = JSON.parse(buffered);
              bufferedMsg._replay = true;
              orbitSocket.send(JSON.stringify(bufferedMsg));
            } catch {
              orbitSocket.send(buffered);
            }
            console.log(`[anchor] re-sent pending approval for thread ${parsed.threadId}`);
          }
        }
        return;
      }
    } catch {
      // Not JSON, continue
    }

    // Handle anchor-local RPC methods from orbit-relayed messages
    const message = parseJsonRpcMessage(text);
    if (message) {
      void maybeHandleAnchorLocalRpc(message).then((resp) => {
        if (!resp) return;
        if (orbitSocket && orbitSocket.readyState === WebSocket.OPEN) {
          try { orbitSocket.send(JSON.stringify(resp)); } catch { /* ignore */ }
        }
      });
      if (typeof message.method === "string" && message.method.startsWith("anchor.")) return;
    }

    ensureAppServer();
    if (message && ("method" in message || "id" in message)) {
      // Auto-subscribe to threads from orbit messages
      const threadId = extractThreadId(message);
      if (threadId) {
        subscribeToThread(threadId);
      }

      // Clear pending approval when the client's response arrives
      const rpcId = message.id as number | string | undefined;
      if (rpcId != null && "result" in message && approvalRpcIds.has(rpcId)) {
        const approvalThread = approvalRpcIds.get(rpcId)!;
        pendingApprovals.delete(approvalThread);
        approvalRpcIds.delete(rpcId);
      }

      sendToAppServer(text.trim() + "\n");
    }
  });

  ws.addEventListener("close", () => {
    stopOrbitHeartbeat();
    if (!opened) {
      console.warn("[anchor] orbit socket closed before handshake completed");
    }
    orbitSocket = null;
    orbitConnecting = false;
    setTimeout(() => void connectOrbit(), 2_000);
  });

  ws.addEventListener("error", () => {
    stopOrbitHeartbeat();
    if (!opened) {
      console.warn("[anchor] orbit socket error during handshake");
    }
    orbitSocket = null;
    orbitConnecting = false;
  });
}

async function streamLines(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  onLine: (line: string) => void
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

interface Credentials {
  anchorJwtSecret: string;
  userId: string;
}

async function loadCredentials(): Promise<Credentials | null> {
  if (!CREDENTIALS_FILE) return null;
  try {
    const text = await Bun.file(CREDENTIALS_FILE).text();
    const data = JSON.parse(text) as Partial<Credentials>;
    if (data.anchorJwtSecret && data.userId) {
      return { anchorJwtSecret: data.anchorJwtSecret, userId: data.userId };
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return null;
}

async function saveCredentials(creds: Credentials): Promise<void> {
  if (!CREDENTIALS_FILE) return;
  try {
    await Bun.write(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + "\n");
    const { chmod } = await import("node:fs/promises");
    await chmod(CREDENTIALS_FILE, 0o600);
  } catch (err) {
    console.warn("[anchor] could not save credentials", err);
  }
}

async function deviceLogin(): Promise<boolean> {
  if (!AUTH_URL) {
    console.error("[anchor] AUTH_URL is required for device login");
    return false;
  }

  console.log("\n  Sign in to connect to Orbit:\n");

  try {
    const codeRes = await fetch(`${AUTH_URL}/auth/device/code`, { method: "POST" });
    if (!codeRes.ok) {
      console.error("[anchor] failed to request device code");
      return false;
    }

    const codeData = (await codeRes.json()) as {
      deviceCode: string;
      userCode: string;
      verificationUrl: string;
      expiresIn: number;
      interval: number;
    };

    console.log(`    ${codeData.verificationUrl}\n`);
    console.log(`  Enter code: \x1b[1m${codeData.userCode}\x1b[0m\n`);

    // Try to open browser
    try {
      Bun.spawn(["open", codeData.verificationUrl]);
    } catch {
      // Ignore — user can open manually
    }

    console.log("  Waiting for authorisation...");

    const deadline = Date.now() + codeData.expiresIn * 1000;
    const interval = codeData.interval * 1000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));

      const tokenRes = await fetch(`${AUTH_URL}/auth/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: codeData.deviceCode }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => "");
        console.error(`  [anchor] poll error (${tokenRes.status}): ${errBody}`);
        continue;
      }

      const tokenData = (await tokenRes.json()) as {
        status: "pending" | "authorised" | "expired";
        userId?: string;
        anchorJwtSecret?: string;
      };

      if (tokenData.status === "pending") continue;

      if (tokenData.status === "authorised" && tokenData.userId && tokenData.anchorJwtSecret) {
        ZANE_ANCHOR_JWT_SECRET = tokenData.anchorJwtSecret;
        USER_ID = tokenData.userId;

        await saveCredentials({ anchorJwtSecret: ZANE_ANCHOR_JWT_SECRET, userId: USER_ID });

        console.log("  \x1b[32mAuthorised!\x1b[0m Credentials saved.\n");
        return true;
      }

      // expired
      console.error("  Code expired. Run 'zane login' to try again.");
      return false;
    }

    console.error("  Timed out. Run 'zane login' to try again.");
    return false;
  } catch (err) {
    console.error("[anchor] device login failed", err);
    return false;
  }
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      const orbitStatus = !ORBIT_URL
        ? "disabled"
        : orbitSocket && orbitSocket.readyState === WebSocket.OPEN
          ? "connected"
          : "disconnected";
      return Response.json({
        status: "ok",
        appServer: appServer !== null,
        orbit: orbitStatus,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        port: PORT,
      });
    }

    if (url.pathname === "/ws/anchor" || url.pathname === "/ws") {
      if (server.upgrade(req)) return new Response(null, { status: 101 });
      return new Response("Upgrade required", { status: 426 });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws as WsClient);
      ensureAppServer();
      ws.send(JSON.stringify({
        type: "anchor.hello",
        ts: new Date().toISOString(),
        hostname: hostname(),
        platform: process.platform,
      }));
    },
    message(ws, message) {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);

      // Forward orbit protocol messages (push-subscribe, push-test, etc.) to orbit
      try {
        const obj = JSON.parse(text) as JsonObject;
        if (typeof obj.type === "string" && (obj.type as string).startsWith("orbit.")) {
          if (orbitSocket && orbitSocket.readyState === WebSocket.OPEN) {
            orbitSocket.send(text);
          }
          return;
        }
      } catch {
        // not JSON — fall through to app-server path
      }

      // Handle anchor-local RPC methods
      const parsed = parseJsonRpcMessage(text);
      if (parsed) {
        void maybeHandleAnchorLocalRpc(parsed).then((resp) => {
          if (!resp) return;
          try { (ws as WsClient).send(JSON.stringify(resp)); } catch { /* ignore */ }
        });
        if (typeof parsed.method === "string" && parsed.method.startsWith("anchor.")) return;
      }

      ensureAppServer();
      if (!appServer) return;
      if (parsed && ("method" in parsed || "id" in parsed)) {
        sendToAppServer(text.trim() + "\n");
      }
    },
    close(ws) {
      clients.delete(ws as WsClient);
    },
  },
});

ensureAppServer();

async function startup() {
  const saved = await loadCredentials();
  if (saved) {
    ZANE_ANCHOR_JWT_SECRET = saved.anchorJwtSecret;
    USER_ID = saved.userId;
  }

  const needsLogin = ORBIT_URL && (!ZANE_ANCHOR_JWT_SECRET || !USER_ID || FORCE_LOGIN);

  console.log(`\nZane Anchor`);
  console.log(`  Local:     http://localhost:${server.port}`);
  console.log(`  WebSocket: ws://localhost:${server.port}/ws`);

  if (needsLogin) {
    const ok = await deviceLogin();
    if (!ok) {
      console.log(`  Orbit:     not connected (login required)`);
      console.log();
      return;
    }
  }

  if (ORBIT_URL) {
    const preflight = await preflightOrbitConnection();
    if (!preflight.ok) {
      if (preflight.kind === "auth") {
        console.error(`[anchor] Orbit authentication failed: ${preflight.detail}`);
        console.error("[anchor] Run 'zane login' and then retry 'zane start'.");
        process.exit(1);
      }
      if (preflight.kind === "config") {
        console.error(`[anchor] Orbit configuration failed: ${preflight.detail}`);
        console.error("[anchor] Check ANCHOR_ORBIT_URL/AUTH_URL in your .env.");
        process.exit(1);
      }
      console.warn(`[anchor] Orbit preflight warning: ${preflight.detail}`);
      console.warn("[anchor] Continuing startup; Orbit may reconnect automatically.");
    }

    console.log(`  Orbit:     ${ORBIT_URL}`);
  } else {
    console.log(`  Orbit:     disabled (local-only mode)`);
  }
  console.log();

  void connectOrbit();
}

void startup();
