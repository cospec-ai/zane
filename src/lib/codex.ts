import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
type ApprovalPolicy = "untrusted" | "on-failure" | "on-request" | "never";

interface CodexExecOptions {
  repoPath: string;
  promptPath: string;
  timeoutMs?: number;
  model?: string;
  profile?: string;
  sandbox?: SandboxMode;
  approvalPolicy?: ApprovalPolicy;
  sandboxPermissions?: string[] | string;
}

const SANDBOX_MODES: SandboxMode[] = ["read-only", "workspace-write", "danger-full-access"];
const APPROVAL_POLICIES: ApprovalPolicy[] = ["untrusted", "on-failure", "on-request", "never"];
const DEFAULT_SANDBOX_PERMISSIONS = ["disk-full-write-access"];

function normaliseSandbox(value?: string): SandboxMode {
  if (value && SANDBOX_MODES.includes(value as SandboxMode)) return value as SandboxMode;
  if (value) console.warn(`[codex] Unknown sandbox mode "${value}", falling back to workspace-write`);
  return "workspace-write";
}

function normaliseApprovalPolicy(value?: string): ApprovalPolicy {
  if (value && APPROVAL_POLICIES.includes(value as ApprovalPolicy)) return value as ApprovalPolicy;
  if (value) console.warn(`[codex] Unknown approval policy "${value}", falling back to never`);
  return "never";
}

function formatSandboxPermissions(value?: string[] | string): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return `[${value.map((entry) => JSON.stringify(entry)).join(",")}]`;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pipeWithPrefix(stream: NodeJS.ReadableStream | null, prefix: string, log: (message: string) => void): void {
  if (!stream) return;
  let buffer = "";
  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      log(`${prefix} ${line}`);
    }
  });
  stream.on("end", () => {
    const line = buffer.trim();
    if (line.length > 0) log(`${prefix} ${line}`);
  });
}

export async function runCodexTask(options: CodexExecOptions): Promise<void> {
  const prompt = await readFile(options.promptPath, "utf8");

  const model = options.model ?? process.env.CODEX_MODEL;
  const profile = options.profile ?? process.env.CODEX_PROFILE;
  const sandbox = options.sandbox ?? normaliseSandbox(process.env.CODEX_SANDBOX);
  const approvalPolicy = options.approvalPolicy ?? normaliseApprovalPolicy(process.env.CODEX_APPROVAL_POLICY);
  const hasSandboxPermissionsEnv = Object.prototype.hasOwnProperty.call(process.env, "CODEX_SANDBOX_PERMISSIONS");
  const sandboxPermissions = formatSandboxPermissions(
    options.sandboxPermissions ??
      (hasSandboxPermissionsEnv ? process.env.CODEX_SANDBOX_PERMISSIONS : DEFAULT_SANDBOX_PERMISSIONS),
  );
  const timeoutMs = options.timeoutMs ?? 600000;

  const args = [
    "--ask-for-approval",
    approvalPolicy,
    "exec",
    "--sandbox",
    sandbox,
    "--color",
    "never",
    "-C",
    options.repoPath,
    "-",
  ];

  if (sandboxPermissions) {
    args.push("-c", `sandbox_permissions=${sandboxPermissions}`);
  }

  if (model) {
    args.push("--model", model);
  }

  if (profile) {
    args.push("--profile", profile);
  }

  console.log(`[codex] exec (sandbox=${sandbox}, approval=${approvalPolicy})`);

  const child = spawn("codex", args, {
    cwd: options.repoPath,
    stdio: ["pipe", "pipe", "pipe"],
  });

  pipeWithPrefix(child.stdout, "[codex]", console.log);
  pipeWithPrefix(child.stderr, "[codex]", console.error);

  child.stdin?.write(prompt);
  child.stdin?.end();

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    console.error(`[codex] Timeout after ${timeoutMs}ms, terminating`);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5000);
  }, timeoutMs);

  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  clearTimeout(timeout);

  if (timedOut) {
    throw new Error(`Codex timed out after ${timeoutMs}ms`);
  }

  if (result.code !== 0) {
    throw new Error(`Codex exited with code ${result.code ?? "unknown"} (signal=${result.signal ?? "none"})`);
  }
}
