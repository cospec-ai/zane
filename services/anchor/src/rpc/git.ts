import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import type { JsonObject, GitCommandResult, GitWorktree } from "../types";

export function normalizeAbsolutePath(path: string): string {
  return resolve(path.trim());
}

export function ensureAbsolutePath(path: string, field: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  if (!isAbsolute(trimmed)) {
    throw new Error(`${field} must be an absolute path`);
  }
  return normalizeAbsolutePath(trimmed);
}

export function getParamString(params: JsonObject | null, key: string): string {
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

export async function runGitCommand(args: string[], cwd?: string): Promise<GitCommandResult> {
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

export async function resolveRepoRoot(path: string): Promise<string | null> {
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

// --- RPC handlers ---

export async function handleGitInspect(id: number | string, params: JsonObject | null): Promise<JsonObject> {
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

export async function handleGitWorktreeList(id: number | string, params: JsonObject | null): Promise<JsonObject> {
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

export async function handleGitWorktreeCreate(id: number | string, params: JsonObject | null): Promise<JsonObject> {
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

export async function handleGitWorktreeRemove(id: number | string, params: JsonObject | null): Promise<JsonObject> {
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

export async function handleGitWorktreePrune(id: number | string, params: JsonObject | null): Promise<JsonObject> {
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
