<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import ProjectPicker from "./ProjectPicker.svelte";

  interface SubmitDetail {
    task: string;
    project: string;
  }

  interface Props {
    busy?: boolean;
    submitLabel?: string;
    showTitle?: boolean;
  }

  const {
    busy = false,
    submitLabel = "Start task",
    showTitle = true,
  }: Props = $props();

  const dispatch = createEventDispatcher<{ submit: SubmitDetail }>();

  let task = $state("");
  let project = $state("");

  const canSubmit = $derived(task.trim().length > 0 && project.trim().length > 0 && !busy);

  function handleSubmit(e?: Event) {
    e?.preventDefault();
    const taskValue = task.trim();
    const projectValue = project.trim();
    if (!taskValue || !projectValue || busy) return;
    dispatch("submit", { task: taskValue, project: projectValue });
  }
</script>

<form class="task-composer stack" onsubmit={handleSubmit}>
  {#if showTitle}
    <div class="composer-title">New task</div>
  {/if}

  <div class="field stack">
    <label for="task-composer-input">Prompt</label>
    <textarea
      id="task-composer-input"
      rows="3"
      bind:value={task}
      placeholder="What do you want done?"
    ></textarea>
  </div>

  <div class="field stack">
    <label for="task-composer-project">Directory</label>
    <ProjectPicker bind:value={project} placeholder="Working directory path..." />
  </div>

  <div class="actions row">
    <button type="submit" class="primary-btn" disabled={!canSubmit}>
      {busy ? "Starting..." : submitLabel}
    </button>
  </div>
</form>

<style>
  .task-composer {
    --stack-gap: var(--space-sm);
  }

  .composer-title {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .field {
    --stack-gap: var(--space-xs);
  }

  .field label {
    color: var(--cli-text-dim);
    font-size: var(--text-xs);
  }

  .field textarea {
    width: 100%;
    padding: var(--space-sm);
    background: var(--cli-bg);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-sm);
    color: var(--cli-text);
    font-family: var(--font-mono);
    resize: vertical;
    min-height: 5.5rem;
  }

  .field textarea::placeholder {
    color: var(--cli-text-muted);
  }

  .field textarea:focus {
    outline: none;
    border-color: var(--cli-prefix-agent);
  }

  .actions {
    justify-content: flex-end;
  }

  .primary-btn {
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    border: none;
    background: var(--cli-prefix-agent);
    color: var(--cli-bg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
