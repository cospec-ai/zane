<script lang="ts">
    import { socket } from "../lib/socket.svelte";
    import { threads } from "../lib/threads.svelte";
    import ShimmerDot from "../lib/components/ShimmerDot.svelte";
    import "../lib/styles/tokens.css";

    const statusConfig = {
        connected: { icon: "●", color: "var(--cli-success)", label: "connected" },
        connecting: { icon: "○", color: "var(--cli-text-dim)", label: "connecting" },
        disconnected: { icon: "○", color: "var(--cli-text-dim)", label: "disconnected" },
        error: { icon: "✗", color: "var(--cli-error)", label: "error" },
    } as const;

    const permissionPresets = {
        cautious: {
            label: "Cautious",
            detail: "Read-only, always ask",
            approvalPolicy: "on-request",
            sandbox: "read-only",
        },
        standard: {
            label: "Standard",
            detail: "Workspace write, ask",
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
        },
        autonomous: {
            label: "Autonomous",
            detail: "Full access, no prompts",
            approvalPolicy: "never",
            sandbox: "danger-full-access",
        },
    } as const;

    const statusMeta = $derived(statusConfig[socket.status]);

    let taskDir = $state("");
    let taskSummary = $state("");
    let taskInstructions = $state("");
    let permissionLevel = $state<keyof typeof permissionPresets>("standard");

    function handleStart(e?: Event) {
        e?.preventDefault();
        if (socket.status !== "connected") return;
        const dir = taskDir.trim();
        const summary = taskSummary.trim();
        if (!dir || !summary) return;
        const instructions = taskInstructions.trim();
        const input = instructions ? `${summary}\n\nInstructions:\n${instructions}` : summary;
        const preset = permissionPresets[permissionLevel];
        threads.start(dir, input, {
            approvalPolicy: preset.approvalPolicy,
            sandbox: preset.sandbox,
        });
        taskSummary = "";
        taskInstructions = "";
    }
</script>

<div class="task-page">
    <header class="task-header">
        <div class="task-header-inner">
            <a class="brand" href="/">zane</a>
            <span class="separator">·</span>
            {#if socket.status === "connecting"}
                <ShimmerDot color={statusMeta.color} />
            {:else}
                <span
                    class="status-icon"
                    style:color={statusMeta.color}
                    title={statusMeta.label}
                    aria-label={statusMeta.label}
                >
                    {statusMeta.icon}
                </span>
            {/if}
            <div class="spacer"></div>
            <a class="back-link" href="/">back</a>
        </div>
    </header>

    <main class="task-body">
        <div class="task-body-inner">
            {#if socket.status !== "connected"}
                <div class="state">Connect on the home screen before starting a task.</div>
            {:else}
                <form class="task-form" onsubmit={handleStart}>
                    <div class="form-title">New task</div>
                    <div class="task-field">
                        <label for="task-dir">directory</label>
                        <input id="task-dir" type="text" bind:value={taskDir} placeholder="Working directory path..." />
                    </div>
                    <div class="task-field">
                        <label for="task-summary">task</label>
                        <textarea
                            id="task-summary"
                            bind:value={taskSummary}
                            placeholder="What do you want done?"
                            rows="2"
                        ></textarea>
                    </div>
                    <div class="task-field">
                        <label for="task-instructions">instructions</label>
                        <textarea
                            id="task-instructions"
                            bind:value={taskInstructions}
                            placeholder="Constraints, preferences, or context..."
                            rows="3"
                        ></textarea>
                    </div>
                    <div class="task-field">
                        <label for="task-permissions">permissions</label>
                        <select id="task-permissions" bind:value={permissionLevel}>
                            {#each Object.entries(permissionPresets) as [key, preset]}
                                <option value={key}>{preset.label} — {preset.detail}</option>
                            {/each}
                        </select>
                    </div>
                    <button class="start-btn" type="submit" disabled={!taskDir.trim() || !taskSummary.trim()}>
                        Start
                    </button>
                </form>
            {/if}
        </div>
    </main>
</div>

<style>
    .task-page {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--cli-bg);
        color: var(--cli-text);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
    }

    .task-header {
        background: var(--cli-bg-elevated);
        width: 100vw;
        margin-left: calc(50% - 50vw);
        border-bottom: 1px solid var(--cli-border);
    }


    .task-header-inner {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm) var(--space-md);
        max-width: var(--app-max-width);
        margin: 0 auto;
    }

    .brand {
        font-weight: 600;
        color: var(--cli-prefix-agent);
        text-decoration: none;
    }

    .separator {
        color: var(--cli-text-muted);
    }

    .status-icon {
        line-height: 1;
    }

    .spacer {
        flex: 1;
    }

    .back-link {
        font-size: var(--text-xs);
        color: var(--cli-text-dim);
        text-decoration: none;
        border: 1px solid var(--cli-border);
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
    }

    .back-link:hover {
        color: var(--cli-text);
        border-color: var(--cli-text-muted);
    }

    .task-body {
        flex: 1;
        padding: 0;
    }

    .task-body-inner {
        width: 100%;
        max-width: var(--app-max-width);
        margin: 0 auto;
        padding: var(--space-lg) var(--space-md);
    }

    .state {
        color: var(--cli-text-muted);
        padding: var(--space-md);
    }

    .task-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    .form-title {
        color: var(--cli-text-muted);
        font-size: var(--text-xs);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .task-field {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
    }

    .task-field label {
        color: var(--cli-text-dim);
        font-size: var(--text-xs);
    }

    .task-field input,
    .task-field textarea,
    .task-field select {
        padding: var(--space-sm);
        background: var(--cli-bg);
        border: 1px solid var(--cli-border);
        border-radius: var(--radius-sm);
        color: var(--cli-text);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        resize: vertical;
    }

    .task-field input:focus,
    .task-field textarea:focus,
    .task-field select:focus {
        outline: none;
        border-color: var(--cli-prefix-agent);
    }

    .task-field input::placeholder,
    .task-field textarea::placeholder {
        color: var(--cli-text-muted);
    }

    .task-field select {
        appearance: none;
        background-image:
            linear-gradient(45deg, transparent 50%, var(--cli-text-muted) 50%),
            linear-gradient(135deg, var(--cli-text-muted) 50%, transparent 50%);
        background-position:
            calc(100% - 16px) calc(1em + 2px),
            calc(100% - 11px) calc(1em + 2px);
        background-size:
            5px 5px,
            5px 5px;
        background-repeat: no-repeat;
    }

    .start-btn {
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

    .start-btn:hover:not(:disabled) {
        opacity: 0.9;
    }

    .start-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
</style>
