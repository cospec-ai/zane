<script lang="ts">
  import { socket } from "../lib/socket.svelte";
  import { threads } from "../lib/threads.svelte";
  import { config } from "../lib/config.svelte";

  let newThreadDir = $state("");

  function handleConnect() {
    if (socket.status === "connected") {
      socket.disconnect();
      threads.list = [];
    } else {
      socket.connect(config.url, config.token);
    }
  }

  function handleNewThread() {
    if (newThreadDir.trim()) {
      threads.start(newThreadDir.trim());
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

<div class="home">
  <header class="header">
    <h1>Zane</h1>
    <span class="status" class:connected={socket.status === "connected"}>
      {socket.status}
    </span>
  </header>

  <div class="connection">
    <input
      type="text"
      bind:value={config.url}
      placeholder="WebSocket URL"
      disabled={socket.status === "connected"}
    />
    <input
      type="password"
      bind:value={config.token}
      placeholder="Token (optional)"
      disabled={socket.status === "connected"}
    />
    <button onclick={handleConnect}>
      {socket.status === "connected" ? "Disconnect" : "Connect"}
    </button>
  </div>

  {#if socket.error}
    <p class="error">{socket.error}</p>
  {/if}

  {#if socket.status === "connected"}
    <div class="threads">
      <div class="new-thread">
        <input
          type="text"
          bind:value={newThreadDir}
          placeholder="Working directory (e.g. /home/user/project)"
        />
        <button onclick={handleNewThread} disabled={!newThreadDir.trim()}>+</button>
        <button class="refresh" onclick={() => threads.fetch()}>[r]</button>
      </div>

      {#if threads.loading}
        <p class="loading">Loading...</p>
      {:else if threads.list.length === 0}
        <p class="empty">No threads yet</p>
      {:else}
        <ul>
          {#each threads.list as thread (thread.id)}
            <li>
              <a class="thread-item" href="/thread/{thread.id}">
                <span class="preview">{thread.preview || "New thread"}</span>
                <span class="meta">{formatTime(thread.createdAt)}</span>
              </a>
              <button
                class="archive"
                onclick={() => threads.archive(thread.id)}
                title="Archive"
              >[bin]</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .status {
    font-size: 0.875rem;
    color: #666;
  }

  .status.connected {
    color: #16a34a;
  }

  .connection {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  input {
    padding: 0.5rem;
    font-size: 0.875rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  input:disabled {
    background: #f5f5f5;
  }

  button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover {
    background: #333;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    color: #dc2626;
  }

  .threads {
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    padding: 0.5rem;
  }

  .new-thread {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .new-thread input {
    flex: 1;
  }

  .refresh {
    font-family: monospace;
    font-size: 0.75rem;
    background: #f5f5f5;
    color: #666;
    border: 1px solid #ddd;
  }

  .refresh:hover {
    background: #eee;
    color: #111;
  }

  .loading, .empty {
    color: #666;
    text-align: center;
    padding: 1rem;
    margin: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 400px;
    overflow-y: auto;
  }

  li {
    display: flex;
    align-items: center;
  }

  .thread-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    text-decoration: none;
    color: inherit;
  }

  .thread-item:hover {
    background: #f5f5f5;
  }

  .preview {
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 0.75rem;
    color: #888;
  }

  .archive {
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    color: #999;
    font-family: monospace;
    font-size: 0.75rem;
  }

  .archive:hover {
    color: #dc2626;
  }
</style>
