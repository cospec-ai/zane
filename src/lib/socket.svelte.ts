import type { ConnectionStatus, RpcMessage } from "./types";

const CLIENT_INFO = {
  name: "zane_web",
  title: "Zane Web Client",
  version: "0.1.0",
};

class SocketStore {
  status = $state<ConnectionStatus>("disconnected");
  error = $state<string | null>(null);

  #socket: WebSocket | null = null;
  #url = $state("");
  #token = $state("");
  #messageHandlers = new Set<(msg: RpcMessage) => void>();

  get url() {
    return this.#url;
  }

  get token() {
    return this.#token;
  }

  connect(url: string, token: string) {
    if (this.#socket) {
      this.disconnect();
    }

    this.#url = url;
    this.#token = token;
    this.status = "connecting";
    this.error = null;

    const wsUrl = new URL(url);
    if (token) {
      wsUrl.searchParams.set("token", token);
    }

    this.#socket = new WebSocket(wsUrl);

    this.#socket.onopen = () => {
      this.status = "connected";
      this.#sendInitialize();
    };

    this.#socket.onclose = () => {
      this.status = "disconnected";
      this.#socket = null;
    };

    this.#socket.onerror = () => {
      this.status = "error";
      this.error = "Connection failed";
    };

    this.#socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RpcMessage;
        this.#notifyHandlers(msg);
      } catch {
        console.error("Failed to parse message:", event.data);
      }
    };
  }

  disconnect() {
    if (this.#socket) {
      this.#socket.close();
      this.#socket = null;
    }
    this.status = "disconnected";
  }

  send(message: RpcMessage) {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  onMessage(handler: (msg: RpcMessage) => void) {
    this.#messageHandlers.add(handler);
    return () => this.#messageHandlers.delete(handler);
  }

  #sendInitialize() {
    this.send({
      method: "initialize",
      id: 1,
      params: { clientInfo: CLIENT_INFO },
    });
    this.send({ method: "initialized", id: 2 });
  }

  #notifyHandlers(msg: RpcMessage) {
    for (const handler of this.#messageHandlers) {
      handler(msg);
    }
  }
}

export const socket = new SocketStore();
