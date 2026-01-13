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
  kind?: "reasoning" | "command" | "file" | "mcp" | "web";
  text: string;
  threadId: string;
}

// JSON-RPC style message envelope
export interface RpcMessage {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}
