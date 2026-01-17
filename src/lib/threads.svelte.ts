import type { ThreadInfo, RpcMessage } from "./types";
import { socket } from "./socket.svelte";
import { messages } from "./messages.svelte";
import { navigate } from "../router";

const STORE_KEY = "__zane_threads_store__";

class ThreadsStore {
  list = $state<ThreadInfo[]>([]);
  currentId = $state<string | null>(null);
  loading = $state(false);

  #pendingRequests = new Map<number, string>();
  #pendingStartInput: string | null = null;

  get current(): ThreadInfo | undefined {
    return this.list.find((t) => t.id === this.currentId);
  }

  fetch() {
    const id = Date.now();
    this.loading = true;
    this.#pendingRequests.set(id, "list");
    socket.send({
      method: "thread/list",
      id,
      params: { cursor: null, limit: 50 },
    });
  }

  select(threadId: string | null) {
    this.currentId = threadId;
  }

  open(threadId: string) {
    const id = Date.now();
    this.loading = true;
    this.currentId = threadId;
    messages.clearThread(threadId);
    this.#pendingRequests.set(id, "resume");
    socket.send({
      method: "thread/resume",
      id,
      params: { threadId },
    });
  }

  start(cwd: string, input?: string, options?: { approvalPolicy?: string; sandbox?: string }) {
    const id = Date.now();
    this.#pendingRequests.set(id, "start");
    this.#pendingStartInput = input?.trim() ? input.trim() : null;
    socket.send({
      method: "thread/start",
      id,
      params: {
        cwd,
        ...(options?.approvalPolicy ? { approvalPolicy: options.approvalPolicy } : {}),
        ...(options?.sandbox ? { sandbox: options.sandbox } : {}),
      },
    });
  }

  archive(threadId: string) {
    const id = Date.now();
    this.#pendingRequests.set(id, "archive");
    socket.send({
      method: "thread/archive",
      id,
      params: { threadId },
    });
    this.list = this.list.filter((t) => t.id !== threadId);
    if (this.currentId === threadId) {
      this.currentId = null;
    }
  }

  handleMessage(msg: RpcMessage) {
    if (msg.method === "thread/started") {
      const params = msg.params as { thread: ThreadInfo };
      if (params?.thread) {
        this.list = [params.thread, ...this.list];
        this.currentId = params.thread.id;
        navigate(`/thread/${params.thread.id}`);
        if (this.#pendingStartInput) {
          socket.send({
            method: "turn/start",
            id: Date.now(),
            params: {
              threadId: params.thread.id,
              input: [{ type: "text", text: this.#pendingStartInput }],
            },
          });
          this.#pendingStartInput = null;
        }
      }
      return;
    }

    if (msg.id && this.#pendingRequests.has(msg.id as number)) {
      const type = this.#pendingRequests.get(msg.id as number);
      this.#pendingRequests.delete(msg.id as number);

      if (type === "list" && msg.result) {
        const result = msg.result as { data: ThreadInfo[] };
        this.list = result.data || [];
        this.loading = false;
      }

      if (type === "resume") {
        this.loading = false;
      }
    }
  }
}

function getStore(): ThreadsStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    const store = new ThreadsStore();
    global[STORE_KEY] = store;
    socket.onMessage((msg) => store.handleMessage(msg));
  }
  return global[STORE_KEY] as ThreadsStore;
}

export const threads = getStore();
