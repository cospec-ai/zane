<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { navigate } from "../router";
  import AuthPageLayout from "../lib/components/AuthPageLayout.svelte";

  let username = $state("");
  const isSignedIn = $derived(auth.status === "signed_in");

  $effect(() => {
    if (isSignedIn) navigate("/app");
  });
</script>

<svelte:head>
  <title>Sign in — Zane</title>
</svelte:head>

<AuthPageLayout>
  <h1>Sign in</h1>
  <p class="subtitle">Use your passkey to access Zane.</p>

  {#if auth.error}
    <div class="auth-error">{auth.error}</div>
  {/if}

  <input
    type="text"
    class="auth-input"
    placeholder="Username"
    bind:value={username}
    onkeydown={(e) => {
      if (e.key === "Enter" && username.trim()) auth.signIn(username.trim());
    }}
  />
  <button
    class="primary-btn"
    type="button"
    onclick={() => auth.signIn(username.trim())}
    disabled={auth.busy || !username.trim()}
  >
    {auth.busy ? "Working..." : "Sign in with passkey"}
  </button>
  <a class="link-btn" href="/register">Create new account</a>
</AuthPageLayout>

<style>
  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 3vw, 2rem);
  }

  .subtitle {
    margin: 0;
    color: var(--cli-text-dim);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .auth-input {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    border: 1px solid var(--cli-border);
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    outline: none;
  }

  .auth-input:focus {
    border-color: var(--cli-text-dim);
  }

  .auth-error {
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    background: var(--cli-error-bg);
    color: var(--cli-error);
    font-size: var(--text-sm);
  }

  .primary-btn {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1;
    cursor: pointer;
    border: 1px solid var(--cli-border);
    background: var(--color-btn-primary-bg, var(--cli-prefix-agent));
    color: var(--color-btn-primary-text, var(--cli-bg));
  }

  .primary-btn:hover {
    opacity: 0.9;
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .link-btn {
    align-self: flex-start;
    color: var(--cli-text-dim);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    text-decoration: underline;
  }

  .link-btn:hover {
    color: var(--cli-text);
  }
</style>
