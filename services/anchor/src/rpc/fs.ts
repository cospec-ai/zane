import { homedir } from "node:os";
import { readdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { JsonObject } from "../types";

export async function handleListDirs(
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
