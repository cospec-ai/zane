<script lang="ts">
  import { route } from "../router";
  import { socket } from "../lib/socket.svelte";
  import { threads } from "../lib/threads.svelte";
  import { messages } from "../lib/messages.svelte";

  let input = $state("");
  let container: HTMLDivElement | undefined;

  const threadId = $derived(route.params.id);

  $effect(() => {
    if (threadId && socket.status === "connected" && threads.currentId !== threadId) {
      threads.open(threadId);
    }
  });

  $effect(() => {
    if (messages.current.length && container) {
      container.scrollTop = container.scrollHeight;
    }
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!input.trim() || !threadId) return;

    socket.send({
      method: "turn/start",
      id: Date.now(),
      params: {
        threadId,
        input: [{ type: "text", text: input.trim() }],
      },
    });

    input = "";
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }
</script>

<div class="thread-page">
  <header class="header">
    <a href="/" class="back">[back]</a>
    <h1>{threads.current?.preview || "Thread"}</h1>
  </header>

  <div class="transcript" bind:this={container}>
    {#if messages.current.length === 0}
      <p class="empty">No messages yet</p>
    {:else}
      {#each messages.current as message (message.id)}
        <div class="message {message.role}" class:reasoning={message.kind === "reasoning"}>
          <span class="label">
            {#if message.role === "user"}
              [you]
            {:else if message.role === "assistant"}
              {#if message.kind === "reasoning"}
                [thinking]
              {:else}
                [agent]
              {/if}
            {:else}
              [{message.kind || "tool"}]
            {/if}
          </span>
          <pre class="text">{message.text}</pre>
        </div>
      {/each}
    {/if}
  </div>

  <form class="input" onsubmit={handleSubmit}>
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="Send a message..."
      rows="2"
    ></textarea>
    <button type="submit" disabled={!input.trim()}>[send]</button>
  </form>
</div>

<style>
  .thread-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .header h1 {
    margin: 0;
    font-size: 1.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .back {
    font-family: monospace;
    color: #666;
    text-decoration: none;
  }

  .back:hover {
    color: #111;
  }

  .transcript {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.875rem;
    background: #fafafa;
  }

  .empty {
    color: #888;
    text-align: center;
    padding: 2rem;
    margin: 0;
  }

  .message {
    margin-bottom: 0.75rem;
  }

  .message:last-child {
    margin-bottom: 0;
  }

  .label {
    font-size: 0.75rem;
    color: #666;
  }

  .message.user .label { color: #2563eb; }
  .message.assistant .label { color: #16a34a; }
  .message.reasoning .label { color: #9333ea; }
  .message.tool .label { color: #d97706; }

  .text {
    margin: 0.25rem 0 0 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.reasoning .text {
    color: #666;
    font-style: italic;
  }

  .message.tool .text {
    padding: 0.5rem;
    background: #f0f0f0;
    border-radius: 4px;
    overflow-x: auto;
  }

  .input {
    display: flex;
    gap: 0.5rem;
  }

  textarea {
    flex: 1;
    padding: 0.5rem;
    font-family: monospace;
    font-size: 0.875rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    resize: none;
  }

  button {
    padding: 0.5rem 1rem;
    font-family: monospace;
    font-size: 0.875rem;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #333;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
