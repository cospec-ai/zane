export interface Session {
  id: string;
  title?: string;
  parentID?: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
}

export interface Message {
  info: Record<string, any>;
  parts: Array<{
    state: Record<string, any>;
    type: string;
    content?: string;
    text?: string;
    tool?: string;
    sessionID?: string;
  }>;
}

export interface SpawnOptions {
  port?: number;
  startupTimeoutMs?: number;
}

export interface RunTaskJob {
  issueNodeId: string;
}
