<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ThreadInfo } from "../types";
  import ShimmerDot from "./ShimmerDot.svelte";

  interface Props {
    loading: boolean;
    recentThreads: ThreadInfo[];
    hasMoreThreads: boolean;
  }

  const { loading, recentThreads, hasMoreThreads }: Props = $props();
  const dispatch = createEventDispatcher<{ refresh: void }>();

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
</script>

<section class="recent-sessions stack">
  <div class="header split">
    <div class="section-title-row row">
      <span class="section-title">Recent Sessions</span>
    </div>
    <div class="section-actions row">
      <button class="refresh-btn" onclick={() => dispatch("refresh")} title="Refresh">↻</button>
    </div>
  </div>

  <div class="content stack">
    {#if loading}
      <div class="loading row">
        <ShimmerDot /> Loading sessions...
      </div>
    {:else if recentThreads.length === 0}
      <div class="empty row">No sessions yet. Start a task above.</div>
    {:else}
      <div class="recent">
        <ul class="recent-list">
          {#each recentThreads as thread (thread.id)}
            <li>
              <a class="recent-item split" href="/thread/{thread.id}">
                <span class="recent-preview">{thread.preview || "New session"}</span>
                <span class="recent-time">{formatTime(thread.createdAt)}</span>
              </a>
            </li>
          {/each}
        </ul>
        {#if hasMoreThreads}
          <a class="view-all" href="/sessions">View all sessions</a>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .recent-sessions {
    --stack-gap: var(--space-sm);
  }

  .header {
    --split-gap: var(--space-sm);
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
  }

  .content {
    --stack-gap: var(--space-sm);
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
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    display: inline-grid;
    place-items: center;
    line-height: 1;
    border: none;
    background: transparent;
    color: var(--cli-text-muted);
    font-size: var(--text-base);
    cursor: pointer;
  }

  .refresh-btn:hover {
    color: var(--cli-text);
  }

  .recent {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .recent-item {
    --split-gap: var(--space-md);
    grid-template-columns: minmax(0, 1fr) auto;
    padding: var(--space-xs) 0;
    text-decoration: none;
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    transition: color var(--transition-fast);
  }

  .recent-item:hover {
    color: var(--cli-text);
  }

  .recent-preview {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .recent-time {
    color: var(--cli-text-muted);
    white-space: nowrap;
    font-size: var(--text-xs);
  }

  .view-all {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
    text-decoration: none;
  }

  .view-all:hover {
    color: var(--cli-text);
    text-decoration: underline;
  }

  .loading,
  .empty {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }
</style>
