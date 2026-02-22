const STORE_KEY = "__zane_theme__";
const STORAGE_KEY = "zane-theme";

export type Theme = "system" | "light" | "dark";

class ThemeStore {
  #theme = $state<Theme>("system");
  #mediaQuery: MediaQueryList | null = null;
  #mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  constructor() {
    // Load from localStorage on init
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored && ["system", "light", "dark"].includes(stored)) {
        this.#theme = stored;
      }
      this.#applyTheme();
    }
  }

  get current(): Theme {
    return this.#theme;
  }

  set(theme: Theme) {
    this.#theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    this.#applyTheme();
  }

  cycle() {
    const themes: Theme[] = ["system", "light", "dark"];
    const currentIndex = themes.indexOf(this.#theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.set(themes[nextIndex]);
  }

  #applyTheme() {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    const root = document.documentElement;
    root.setAttribute("data-theme-mode", this.#theme);

    if (this.#theme === "system") {
      const mediaQuery = this.#getMediaQuery();
      root.setAttribute("data-theme", mediaQuery.matches ? "dark" : "light");
      this.#attachSystemListener();
    } else {
      this.#detachSystemListener();
      root.setAttribute("data-theme", this.#theme);
    }
  }

  #getMediaQuery(): MediaQueryList {
    if (!this.#mediaQuery) {
      this.#mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    }
    return this.#mediaQuery;
  }

  #attachSystemListener() {
    if (this.#mediaListener) return;
    const mediaQuery = this.#getMediaQuery();
    this.#mediaListener = (event) => {
      if (this.#theme !== "system") return;
      document.documentElement.setAttribute("data-theme", event.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", this.#mediaListener);
  }

  #detachSystemListener() {
    if (!this.#mediaQuery || !this.#mediaListener) return;
    this.#mediaQuery.removeEventListener("change", this.#mediaListener);
    this.#mediaListener = null;
  }
}

function getStore(): ThemeStore {
  const global = globalThis as Record<string, unknown>;
  if (!global[STORE_KEY]) {
    global[STORE_KEY] = new ThemeStore();
  }
  return global[STORE_KEY] as ThemeStore;
}

export const theme = getStore();
