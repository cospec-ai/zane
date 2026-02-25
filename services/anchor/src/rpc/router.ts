import type { JsonObject } from "../types";
import { asRecord } from "../utils";
import { handleListDirs } from "./fs";
import {
  handleGitInspect,
  handleGitWorktreeList,
  handleGitWorktreeCreate,
  handleGitWorktreeRemove,
  handleGitWorktreePrune,
} from "./git";

export async function maybeHandleAnchorLocalRpc(message: JsonObject): Promise<JsonObject | null> {
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
