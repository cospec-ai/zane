<script lang="ts">
  import { socket } from "../lib/socket.svelte";
  import { threads } from "../lib/threads.svelte";
  import { theme } from "../lib/theme.svelte";
  import AppHeader from "../lib/components/AppHeader.svelte";
  import ShimmerDot from "../lib/components/ShimmerDot.svelte";
  import TaskComposer from "../lib/components/TaskComposer.svelte";

  const themeIcons = { system: "◐", light: "○", dark: "●" } as const;
  const RECENT_LIMIT = 5;

  let isCreating = $state(false);

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

  const recentThreads = $derived(threads.list.slice(0, RECENT_LIMIT));
  const hasMoreThreads = $derived(threads.list.length > RECENT_LIMIT);

  async function handleCreateTask(
    e: CustomEvent<{
      task: string;
      project: string;
    }>
  ) {
    const { task, project } = e.detail;
    if (isCreating) return;
    isCreating = true;
    try {
      threads.start(project, task);
    } catch (err) {
      console.error("Failed to create task:", err);
    } finally {
      isCreating = false;
    }
  }

  $effect(() => {
    if (socket.status === "connected") {
      threads.fetch();
    }
  });
</script>

<svelte:head>
  <title>Zane</title>
</svelte:head>

<div class="home stack">
  <AppHeader status={socket.status}>
    {#snippet actions()}
      <a href="/settings">Settings</a>
      <button type="button" onclick={() => theme.cycle()} title="Theme: {theme.current}">
        {themeIcons[theme.current]}
      </button>
    {/snippet}
  </AppHeader>

  {#if socket.error}
    <div class="error row">
      <span class="error-icon">✗</span>
      <span class="error-text">{socket.error}</span>
    </div>
  {/if}

  {#if socket.status === "connected"}
    <main class="home-content stack">
      <section class="section stack">
        <div class="section-header">
          <span class="section-title">New Task</span>
        </div>
        <div class="section-body stack">
          <TaskComposer busy={isCreating} showTitle={false} on:submit={handleCreateTask} />
        </div>
      </section>

      <section class="section stack">
        <div class="section-header split">
          <div class="section-title-row row">
            <span class="section-title">Recent Sessions</span>
          </div>
          <div class="section-actions row">
            <button class="refresh-btn" onclick={() => threads.fetch()} title="Refresh">↻</button>
          </div>
        </div>

        <div class="section-body stack">
          {#if threads.loading}
            <div class="loading row">
              <ShimmerDot /> Loading sessions...
            </div>
          {:else if recentThreads.length === 0}
            <div class="empty row">No sessions yet. Start a task above.</div>
          {:else}
            <ul class="recent-list">
              {#each recentThreads as thread (thread.id)}
                <li class="recent-item">
                  <div class="recent-row row">
                    <a class="recent-link stack" href="/thread/{thread.id}">
                      <span class="recent-preview">{thread.preview || "New session"}</span>
                      <span class="recent-meta">{formatTime(thread.createdAt)}</span>
                    </a>
                    <button
                      class="archive-btn"
                      onclick={() => threads.archive(thread.id)}
                      title="Archive session"
                    >×</button>
                  </div>
                </li>
              {/each}
            </ul>
            {#if hasMoreThreads}
              <div class="hint">
                Showing {RECENT_LIMIT} of {threads.list.length}. <a class="view-all-inline" href="/sessions">View all.</a>
              </div>
            {/if}
          {/if}
        </div>
      </section>
    </main>
  {/if}
</div>

<style>
  .home {
    min-height: 100vh;
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    --stack-gap: 0;
  }

  .home-content {
    width: 100%;
    max-width: var(--app-max-width);
    margin: 0 auto;
    padding: var(--space-lg) var(--space-md) var(--space-xl);
    --stack-gap: var(--space-md);
  }

  .section {
    --stack-gap: 0;
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .section-header {
    --split-gap: var(--space-sm);
    grid-template-columns: minmax(0, 1fr) auto;
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-bg-elevated);
    border-bottom: 1px solid var(--cli-border);
    min-width: 0;
  }

  .section-body {
    --stack-gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--cli-bg);
  }

  .section-title-row {
    --row-gap: var(--space-xs);
    align-items: center;
  }

  .section-title {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .section-actions {
    --row-gap: var(--space-sm);
  }

  .refresh-btn {
    padding: var(--space-xs);
    border: none;
    background: transparent;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
  }

  .refresh-btn:hover {
    color: var(--cli-text);
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-sm);
  }

  .recent-item {
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    background: var(--cli-bg);
    overflow: hidden;
  }

  .recent-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    gap: 0;
    min-width: 0;
  }

  .recent-link {
    width: 100%;
    min-width: 0;
    text-decoration: none;
    color: inherit;
    padding: var(--space-sm);
    --stack-gap: 2px;
    overflow: hidden;
  }

  .recent-link:hover {
    background: var(--cli-selection);
  }

  .recent-preview {
    color: var(--cli-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-meta {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .archive-btn {
    border: none;
    border-left: 1px solid var(--cli-border);
    background: transparent;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    min-width: 2.2rem;
    cursor: pointer;
  }

  .archive-btn:hover {
    color: var(--cli-error);
    background: var(--cli-selection);
  }

  .loading,
  .empty,
  .hint {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }

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

  .view-all-inline {
    color: var(--cli-prefix-agent);
    text-decoration: none;
  }

  .view-all-inline:hover {
    text-decoration: underline;
  }
</style>
