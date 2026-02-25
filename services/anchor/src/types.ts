export interface WsClient {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

export type JsonObject = Record<string, unknown>;

export interface GitCommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export interface GitWorktree {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
  locked: boolean;
  prunable: boolean;
}

export interface Credentials {
  anchorJwtSecret: string;
  userId: string;
}

export type OrbitPreflightResult =
  | { ok: true }
  | { ok: false; kind: "auth"; detail: string }
  | { ok: false; kind: "config"; detail: string }
  | { ok: false; kind: "network"; detail: string };
