export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ThreadInfo {
  id: string;
  preview?: string;
  createdAt?: number;
  modelProvider?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  kind?:
    | "reasoning"
    | "command"
    | "file"
    | "mcp"
    | "diff"
    | "web"
    | "review"
    | "output";
  text: string;
  threadId: string;
  turnId?: string;
}

export interface ApprovalChange {
  path: string;
  kind?: string;
  diff?: string;
}

export interface ApprovalRequest {
  requestId: string | number;
  threadId: string;
  turnId: string;
  itemId: string;
  kind: "commandExecution" | "fileChange";
  reason?: string;
  command?: string;
  cwd?: string;
  changes?: ApprovalChange[];
}

// JSON-RPC style message envelope
export interface RpcMessage {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}
