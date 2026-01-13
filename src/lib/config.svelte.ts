const STORE_KEY = "__zane_config_store__";
const STORAGE_KEY = "zane_config";

interface SavedConfig {
  url: string;
  token: string;
}

class ConfigStore {
  #url = $state("wss://orbit.yrvgilpord.workers.dev/ws/client");
  #token = $state("");

  constructor() {
    this.#load();
  }

  get url() {
    return this.#url;
  }
  set url(value: string) {
    this.#url = value;
    this.#save();
  }

  get token() {
    return this.#token;
  }
  set token(value: string) {
    this.#token = value;
    this.#save();
  }

  #load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as SavedConfig;
        this.#url = data.url || this.#url;
        this.#token = data.token || "";
      }
    } catch {
      // ignore
    }
  }

  #save() {
    try {
      const data: SavedConfig = {
        url: this.#url,
        token: this.#token,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }
}

function getStore(): ConfigStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    global[STORE_KEY] = new ConfigStore();
  }
  return global[STORE_KEY] as ConfigStore;
}

export const config = getStore();
