<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import hljs from "highlight.js";
  import { onMount } from "svelte";
  import type { Message } from "../types";
  import Reasoning from "./Reasoning.svelte";
  import Tool from "./Tool.svelte";

  interface Props {
    message: Message;
  }

  const { message }: Props = $props();

  let messageEl: HTMLDivElement | undefined;

  const isReasoning = $derived(message.role === "assistant" && message.kind === "reasoning");
  const isTool = $derived(
    message.role === "tool" &&
    message.kind !== "terminal" &&
    message.kind !== "wait" &&
    message.kind !== "compaction"
  );
  const isTerminal = $derived(message.role === "tool" && message.kind === "terminal");
  const isWait = $derived(message.role === "tool" && message.kind === "wait");
  const isCompaction = $derived(message.role === "tool" && message.kind === "compaction");
  const isAssistant = $derived(message.role === "assistant" && !message.kind);

  const renderedHtml = $derived.by(() => {
    if (!isAssistant) return "";
    const html = marked.parse(message.text, { async: false }) as string;
    return DOMPurify.sanitize(html);
  });

  const prefixConfig = $derived.by(() => {
    if (message.role === "user") {
      return { prefix: ">", color: "var(--cli-prefix-agent)", bgClass: "user-bg" };
    }
    if (message.role === "assistant") {
      return { prefix: "•", color: "var(--cli-prefix-agent)", bgClass: "" };
    }
    if (message.role === "tool") {
      return { prefix: "•", color: "var(--cli-prefix-tool)", bgClass: "" };
    }
    return { prefix: "•", color: "var(--cli-text-dim)", bgClass: "" };
  });

  const terminalLines = $derived.by(() => {
    if (!isTerminal) return [];
    const lines = message.text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  });

  function highlightCode() {
    if (!messageEl) return;
    const blocks = messageEl.querySelectorAll("pre code:not(.hljs)");
    for (const block of blocks) {
      hljs.highlightElement(block as HTMLElement);
    }
  }

  function applyEnhancements() {
    if (!isAssistant || !messageEl) return;
    highlightCode();
  }

  onMount(() => {
    applyEnhancements();
  });

  $effect(() => {
    // Re-run when message text changes
    void message.text;
    // Use microtask to ensure DOM is updated
    queueMicrotask(applyEnhancements);
  });
</script>

<div class="message-block {prefixConfig.bgClass}" bind:this={messageEl}>
  {#if isReasoning}
    <Reasoning
      content={message.text}
      defaultOpen={false}
    />
  {:else if isTool}
    <Tool {message} />
  {:else if isWait}
    <div class="message-line wait row">
      <span class="prefix" style:color={"var(--cli-warning)"}>{prefixConfig.prefix}</span>
      <div class="wait-line row">
        <span class="text dim">{message.text}</span>
      </div>
    </div>
  {:else if isCompaction}
    <div class="message-line compaction row">
      <span class="compaction-icon">&#8597;</span>
      <span class="text dim">Context compacted</span>
    </div>
  {:else if isTerminal}
    <div class="message-line terminal row">
      <span class="prefix" style:color={prefixConfig.color}>{prefixConfig.prefix}</span>
      <div class="terminal-lines stack">
        {#each terminalLines as line}
          <div class="terminal-line row">
            <span class="text">{line}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else if isAssistant}
    <div class="message-line row">
      <span class="prefix" style:color={prefixConfig.color}>{prefixConfig.prefix}</span>
      <div class="markdown-content">{@html renderedHtml}</div>
    </div>
  {:else}
    <div class="message-line row">
      <span class="prefix" style:color={prefixConfig.color}>{prefixConfig.prefix}</span>
      <span class="text">{message.text}</span>
    </div>
  {/if}
</div>

<style>
  .message-block {
    padding: var(--space-xs) var(--space-md);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .message-block.user-bg {
    background: var(--cli-bg-user);
    border-left: 0;
    box-shadow: none;
    padding-left: var(--space-md);
  }


  .message-line {
    --row-gap: var(--space-sm);
    align-items: flex-start;
  }

  .message-line.terminal {
    align-items: flex-start;
  }

  .message-line.wait {
    align-items: center;
  }

  .terminal-lines {
    --stack-gap: 0.1rem;
  }

  .terminal-line {
    --row-gap: var(--space-sm);
  }

  .wait-line {
    --row-gap: var(--space-sm);
  }

  .message-line.compaction {
    --row-gap: var(--space-sm);
    justify-content: center;
  }

  .compaction-icon {
    color: var(--cli-text-muted);
    font-size: var(--text-xs);
  }

  .prefix {
    flex-shrink: 0;
    font-weight: 600;
  }

  .text {
    color: var(--cli-text);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .text.dim {
    color: var(--cli-text-dim);
    font-style: italic;
  }

  /* Markdown content styles */
  .markdown-content {
    color: var(--cli-text);
    word-break: break-word;
    min-width: 0;
    flex: 1;
  }

  .markdown-content :global(p) {
    margin: 0.4em 0;
  }

  .markdown-content :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4) {
    margin: 0.75em 0 0.25em;
    font-weight: 600;
    line-height: 1.4;
  }

  .markdown-content :global(h1) { font-size: var(--text-lg); }
  .markdown-content :global(h2) { font-size: var(--text-base); }
  .markdown-content :global(h3) { font-size: var(--text-sm); }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.4em 0;
    padding-left: 1.5em;
  }

  .markdown-content :global(li) {
    margin: 0.2em 0;
  }

  .markdown-content :global(code) {
    padding: 0.1em 0.3em;
    background: var(--cli-bg-elevated);
    border-radius: var(--radius-sm);
    font-size: 0.9em;
  }

  .markdown-content :global(pre) {
    margin: 0.5em 0;
    padding: var(--space-sm) var(--space-md);
    background: var(--cli-bg-elevated);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .markdown-content :global(pre code) {
    padding: 0;
    background: transparent;
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .markdown-content :global(blockquote) {
    margin: 0.5em 0;
    padding-left: var(--space-md);
    border-left: 2px solid var(--cli-border);
    color: var(--cli-text-dim);
  }

  .markdown-content :global(strong) {
    font-weight: 600;
  }

  .markdown-content :global(a) {
    color: var(--cli-prefix-agent);
    text-decoration: underline;
  }

  .markdown-content :global(hr) {
    margin: 0.75em 0;
    border: none;
    border-top: 1px solid var(--cli-border);
  }

  .markdown-content :global(table) {
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: var(--text-xs);
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--cli-border);
  }

  .markdown-content :global(th) {
    background: var(--cli-bg-elevated);
    font-weight: 600;
  }

</style>
