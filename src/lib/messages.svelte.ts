import type { Message, RpcMessage } from "./types";
import { socket } from "./socket.svelte";
import { threads } from "./threads.svelte";

const STORE_KEY = "__zane_messages_store__";

class MessagesStore {
  #byThread = $state<Map<string, Message[]>>(new Map());
  #streamingText = $state<Map<string, string>>(new Map());
  #loadedThreads = new Set<string>();

  clearThread(threadId: string) {
    this.#byThread.delete(threadId);
    this.#loadedThreads.delete(threadId);
    for (const key of this.#streamingText.keys()) {
      if (key.startsWith(`${threadId}:`)) {
        this.#streamingText.delete(key);
      }
    }
  }

  get current(): Message[] {
    const threadId = threads.currentId;
    if (!threadId) return [];
    return this.#byThread.get(threadId) ?? [];
  }

  #add(threadId: string, message: Message) {
    const existing = this.#byThread.get(threadId) ?? [];
    if (existing.some((m) => m.id === message.id)) {
      return;
    }
    this.#byThread.set(threadId, [...existing, message]);
    this.#byThread = new Map(this.#byThread);
  }

  #updateStreaming(threadId: string, itemId: string, delta: string) {
    const key = `${threadId}:${itemId}`;
    const current = this.#streamingText.get(key) ?? "";
    this.#streamingText.set(key, current + delta);
    this.#streamingText = new Map(this.#streamingText);

    // Update or add the message
    const messages = this.#byThread.get(threadId) ?? [];
    const idx = messages.findIndex((m) => m.id === itemId);

    if (idx >= 0) {
      const updated = [...messages];
      updated[idx] = { ...messages[idx], text: this.#streamingText.get(key)! };
      this.#byThread = new Map(this.#byThread).set(threadId, updated);
    } else {
      this.#add(threadId, {
        id: itemId,
        role: "assistant",
        text: this.#streamingText.get(key)!,
        threadId,
      });
    }
  }

  handleMessage(msg: RpcMessage) {
    if (msg.result && !msg.method) {
      const result = msg.result as { thread?: { id: string; turns?: Array<{ items?: unknown[] }> } };
      if (result.thread?.turns) {
        const threadId = result.thread.id;
        if (!this.#loadedThreads.has(threadId)) {
          this.#loadedThreads.add(threadId);
          this.#loadThread(threadId, result.thread.turns);
        }
      }
      return;
    }

    const method = msg.method;
    const params = msg.params as Record<string, unknown> | undefined;
    if (!params) return;

    const threadId = this.#extractThreadId(params);
    if (!threadId) return;

    // Item started - handle user messages
    if (method === "item/started") {
      const item = params.item as Record<string, unknown>;
      if (!item) return;

      const type = item.type as string;
      if (type === "userMessage") {
        const itemId = item.id as string;
        const content = item.content as Array<{ type: string; text?: string }>;
        const text = content?.find((c) => c.type === "text")?.text || "";

        this.#add(threadId, {
          id: itemId,
          role: "user",
          text,
          threadId,
        });
      }
      return;
    }

    // Agent message delta (streaming)
    if (method === "item/agentMessage/delta") {
      const delta = (params.delta as string) || "";
      const itemId = (params.itemId as string) || `agent-${threadId}`;
      this.#updateStreaming(threadId, itemId, delta);
      return;
    }

    // Reasoning delta
    if (method === "item/reasoning/textDelta") {
      const delta = (params.delta as string) || "";
      const itemId = (params.itemId as string) || `reasoning-${threadId}`;

      const messages = this.#byThread.get(threadId) ?? [];
      const existing = messages.find((m) => m.id === itemId);

      if (existing) {
        this.#updateStreaming(threadId, itemId, delta);
      } else {
        const key = `${threadId}:${itemId}`;
        this.#streamingText.set(key, delta);
        this.#add(threadId, {
          id: itemId,
          role: "assistant",
          kind: "reasoning",
          text: delta,
          threadId,
        });
      }
      return;
    }

    // Item completed (tool outputs, file changes, commands)
    if (method === "item/completed") {
      const item = params.item as Record<string, unknown>;
      if (!item) return;

      const itemId = item.id as string;
      const type = item.type as string;

      let role: Message["role"] = "tool";
      let kind: Message["kind"];
      let text = "";

      switch (type) {
        case "commandExecution":
          kind = "command";
          text = `$ ${item.command}\n${item.aggregatedOutput || ""}`;
          break;
        case "fileChange": {
          kind = "file";
          const changes = item.changes as Array<{ path: string; diff?: string }>;
          text = changes?.map((c) => `${c.path}\n${c.diff || ""}`).join("\n\n") || "";
          break;
        }
        case "mcpToolCall":
          kind = "mcp";
          text = `Tool: ${item.tool}\n${JSON.stringify(item.result, null, 2)}`;
          break;
        case "webSearch":
          kind = "web";
          text = `Search: ${item.query}`;
          break;
        default:
          return;
      }

      this.#add(threadId, { id: itemId, role, kind, text, threadId });
    }
  }

  #extractThreadId(params: Record<string, unknown>): string | null {
    return (params.threadId as string) || null;
  }

  #loadThread(threadId: string, turns: Array<{ items?: unknown[] }>) {
    const messages: Message[] = [];

    for (const turn of turns) {
      if (!turn.items) continue;

      for (const item of turn.items as Array<Record<string, unknown>>) {
        const id = (item.id as string) || `item-${Date.now()}-${Math.random()}`;
        const type = item.type as string;

        switch (type) {
          case "userMessage": {
            const content = item.content as Array<{ type: string; text?: string }>;
            const text = content?.find((c) => c.type === "text")?.text || "";
            messages.push({ id, role: "user", text, threadId });
            break;
          }

          case "agentMessage":
            messages.push({
              id,
              role: "assistant",
              text: (item.text as string) || "",
              threadId,
            });
            break;

          case "reasoning": {
            const summary = item.summary as string[];
            const text = summary?.[0] || "";
            if (text) {
              messages.push({ id, role: "assistant", kind: "reasoning", text, threadId });
            }
            break;
          }

          case "commandExecution":
            messages.push({
              id,
              role: "tool",
              kind: "command",
              text: `$ ${item.command}\n${item.aggregatedOutput || ""}`,
              threadId,
            });
            break;

          case "fileChange": {
            const changes = item.changes as Array<{ path: string; diff?: string }>;
            messages.push({
              id,
              role: "tool",
              kind: "file",
              text: changes?.map((c) => `${c.path}\n${c.diff || ""}`).join("\n\n") || "",
              threadId,
            });
            break;
          }

          case "mcpToolCall":
            messages.push({
              id,
              role: "tool",
              kind: "mcp",
              text: `Tool: ${item.tool}\n${JSON.stringify(item.result, null, 2)}`,
              threadId,
            });
            break;
        }
      }
    }

    this.#byThread.set(threadId, messages);
    this.#byThread = new Map(this.#byThread);
  }
}

function getStore(): MessagesStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    const store = new MessagesStore();
    global[STORE_KEY] = store;
    socket.onMessage((msg) => store.handleMessage(msg));
  }
  return global[STORE_KEY] as MessagesStore;
}

export const messages = getStore();
