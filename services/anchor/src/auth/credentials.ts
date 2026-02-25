import type { Credentials } from "../types";
import { CREDENTIALS_FILE } from "../config";

export async function loadCredentials(): Promise<Credentials | null> {
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

export async function saveCredentials(creds: Credentials): Promise<void> {
  if (!CREDENTIALS_FILE) return;
  try {
    await Bun.write(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + "\n");
    const { chmod } = await import("node:fs/promises");
    await chmod(CREDENTIALS_FILE, 0o600);
  } catch (err) {
    console.warn("[anchor] could not save credentials", err);
  }
}
