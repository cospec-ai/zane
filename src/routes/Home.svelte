<script lang="ts">
  import { socket } from "../lib/socket.svelte";
  import { threads } from "../lib/threads.svelte";
  import { config } from "../lib/config.svelte";
  import { theme } from "../lib/theme.svelte";
  import { auth } from "../lib/auth.svelte";
  import AppHeader from "../lib/components/AppHeader.svelte";
  import ShimmerDot from "../lib/components/ShimmerDot.svelte";

  const themeIcons = { system: "◐", light: "○", dark: "●" } as const;

  function handleConnect() {
    if (socket.status === "connected") {
      socket.disconnect();
      threads.list = [];
    } else {
      socket.connect(config.url, auth.token);
    }
  }

  function formatTime(ts?: number): string {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  $effect(() => {
    if (socket.status === "connected") {
      threads.fetch();
    }
  });
</script>

<div class="home stack">
  <AppHeader status={socket.status}>
    {#snippet actions()}
      <button type="button" onclick={() => theme.cycle()} title="Theme: {theme.current}">
        {themeIcons[theme.current]}
      </button>
      <button type="button" onclick={() => auth.signOut()} title="Sign out">⏻</button>
    {/snippet}
  </AppHeader>

  <div class="connection stack">
    <div class="field stack">
      <label for="url">url</label>
      <input
        id="url"
        type="text"
        bind:value={config.url}
        placeholder="ws://localhost:8788/ws"
        disabled={socket.status === "connected"}
      />
    </div>
    <button class="connect-btn" onclick={handleConnect}>
      {socket.status === "connected" ? "Disconnect" : "Connect"}
    </button>
  </div>

  {#if socket.error}
    <div class="error row">
      <span class="error-icon">✗</span>
      <span class="error-text">{socket.error}</span>
    </div>
  {/if}

  {#if socket.status === "connected"}
    <div class="threads-section stack">
      <div class="section-header split">
        <span class="section-title">Threads</span>
        <div class="section-actions row">
          <a class="new-task-link" href="/task">New task</a>
          <button class="refresh-btn" onclick={() => threads.fetch()} title="Refresh">↻</button>
        </div>
      </div>

      {#if threads.loading}
        <div class="loading row">
          <ShimmerDot /> Loading threads...
        </div>
      {:else if threads.list.length === 0}
        <div class="empty row">No threads yet. Create one above.</div>
      {:else}
        <ul class="thread-list">
          {#each threads.list as thread (thread.id)}
            <li class="thread-item row">
              <a class="thread-link row" href="/thread/{thread.id}">
                <span class="thread-icon">›</span>
                <span class="thread-preview">{thread.preview || "New thread"}</span>
                <span class="thread-meta">{formatTime(thread.createdAt)}</span>
              </a>
              <button
                class="archive-btn"
                onclick={() => threads.archive(thread.id)}
                title="Archive thread"
              >×</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .home {
    --stack-gap: 0;
    min-height: 100vh;
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  /* Connection */
  .connection {
    --stack-gap: var(--space-sm);
    padding: var(--space-md);
    border-bottom: 1px solid var(--cli-border);
  }

  .field {
    --stack-gap: var(--space-xs);
  }

  .field label {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
  }

  .field input {
    padding: var(--space-sm);
    background: var(--cli-bg);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-base);
  }

  .field input:focus {
    outline: none;
    border-color: var(--cli-prefix-agent);
  }

  .field input:disabled {
    opacity: 0.5;
    background: var(--cli-bg-elevated);
  }

  .field input::placeholder {
    color: var(--cli-text-muted);
  }

  .connect-btn {
    align-self: flex-start;
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-prefix-agent);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--cli-bg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .connect-btn:hover {
    opacity: 0.9;
  }

  /* Error */
  .error {
    --row-gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-error-bg);
    border-bottom: 1px solid var(--cli-border);
    color: var(--cli-error);
  }

  .error-icon {
    font-weight: 600;
  }

  /* Threads Section */
  .threads-section {
    flex: 1;
    --stack-gap: 0;
  }

  .section-header {
    --split-gap: var(--space-sm);
    padding: var(--space-sm) 0 var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--cli-border);
  }

  .section-title {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-actions {
    --row-gap: var(--space-sm);
  }

  .new-task-link {
    padding: var(--space-sm);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    color: var(--cli-text-dim);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-decoration: none;
    text-transform: lowercase;
    transition: all var(--transition-fast);
  }

  .new-task-link:hover {
    background: var(--cli-selection);
    color: var(--cli-text);
    border-color: var(--cli-text-muted);
  }

  .refresh-btn {
    padding: var(--space-sm);
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .refresh-btn:hover {
    color: var(--cli-text);
  }

  /* Loading / Empty */
  .loading,
  .empty {
    --row-gap: var(--space-sm);
    padding: var(--space-lg) var(--space-md);
    color: var(--cli-text-muted);
  }

  /* Thread List */
  .thread-list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow-y: auto;
  }

  .thread-item {
    --row-gap: 0;
    border-bottom: 1px solid var(--cli-border);
  }

  .thread-link {
    flex: 1;
    min-width: 0;
    --row-gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    text-decoration: none;
    color: inherit;
    transition: background var(--transition-fast);
  }

  .thread-link:hover {
    background: var(--cli-selection);
  }

  .thread-icon {
    color: var(--cli-prefix-agent);
    font-weight: 600;
  }

  .thread-preview {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--cli-text);
  }

  .thread-meta {
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--cli-text-muted);
  }

  .archive-btn {
    padding: var(--space-sm);
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .archive-btn:hover {
    color: var(--cli-error);
  }
</style>
