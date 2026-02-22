<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { config } from "../lib/config.svelte";
  import { theme } from "../lib/theme.svelte";
  import { pwa } from "../lib/pwa.svelte";

  const themeIcons = { system: "◐", light: "○", dark: "●" } as const;

  const isSignedIn = $derived(auth.status === "signed_in");
  const isLocalMode = $derived(auth.isLocalMode);
  const hasConfiguredUrl = $derived(Boolean(config.url?.trim()));
</script>

<svelte:head>
  <title>Zane</title>
</svelte:head>

<div class="landing stack">
  <header class="landing-header">
    <div class="brand">zane</div>
    <div class="header-actions">
      {#if pwa.canInstall && !pwa.isStandalone}
        <button class="ghost-btn" type="button" onclick={() => pwa.install()}>Install app</button>
      {/if}
      {#if isSignedIn && isLocalMode && !hasConfiguredUrl}
        <a class="primary-btn" href="/settings">Configure connection</a>
      {:else if isSignedIn}
        <a class="primary-btn" href="/app">Go to app</a>
      {:else}
        <a class="primary-btn" href="/login">Sign in</a>
      {/if}
      <button type="button" class="icon-btn" onclick={() => theme.cycle()} title="Theme: {theme.current}">
        <span class="icon-glyph">{themeIcons[theme.current]}</span>
      </button>
    </div>
  </header>

  <main class="hero stack">
    <div class="hero-copy stack">
      <h1>Remote control for your local Codex.</h1>
      <p>
        Zane lets you start and supervise Codex CLI sessions running on your Mac from a handheld web client.
      </p>
      {#if isLocalMode && !hasConfiguredUrl}
        <div class="hero-actions row">
          <a class="primary-btn" href="/settings">Configure Anchor URL</a>
        </div>
        <p class="local-mode-hint">Local mode active — no sign-in required</p>
      {:else if isLocalMode && hasConfiguredUrl}
        <div class="hero-actions row">
          <a class="primary-btn" href="/app">Go to app</a>
          <a class="ghost-btn" href="/settings">Settings</a>
        </div>
        <p class="local-mode-hint">Local mode active — no sign-in required</p>
      {:else if !isSignedIn}
        <div class="hero-actions row">
          <a class="primary-btn" href="/login">Sign in</a>
          <a class="ghost-btn" href="/register">Create account</a>
        </div>
      {/if}
    </div>
  </main>

  <section class="features">
    <div class="feature">
      <span class="feature-label">Anchor</span>
      <p>A lightweight daemon on your Mac that spawns and manages Codex CLI sessions. Your code never leaves the machine.</p>
    </div>
    <div class="feature">
      <span class="feature-label">Orbit</span>
      <p>A Cloudflare relay that connects your devices to Anchor over a secure tunnel. No port-forwarding, no VPN.</p>
    </div>
    <div class="feature">
      <span class="feature-label">Handheld</span>
      <p>Approve file writes, review diffs, and steer tasks from your phone or any browser — wherever you are.</p>
    </div>
  </section>

  <footer class="landing-footer">
    <a class="footer-link" href="https://github.com/cospec-ai/zane" target="_blank" rel="noopener">GitHub</a>
  </footer>
</div>

<style>
  .landing {
    min-height: 100vh;
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    padding: var(--space-lg) var(--space-md);
  }

  .landing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .brand {
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cli-prefix-agent);
  }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--cli-border);
    color: var(--cli-text);
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-glyph {
    display: block;
    font-size: var(--text-sm);
    line-height: 1;
    font-family: var(--font-mono);
  }

  .hero {
    align-items: center;
    text-align: center;
    padding-top: clamp(2rem, 8vh, 5rem);
  }

  .hero-copy {
    max-width: 720px;
    --stack-gap: var(--space-lg);
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.5rem);
  }

  .hero p {
    margin: 0;
    color: var(--cli-text-dim);
    line-height: 1.6;
  }

  .hero-actions {
    justify-content: center;
    flex-wrap: wrap;
  }

  .local-mode-hint {
    font-size: var(--text-xs);
    color: var(--cli-success, #4ade80);
    margin: 0;
  }

  .primary-btn,
  .ghost-btn {
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1;
    cursor: pointer;
    text-decoration: none;
  }

  .primary-btn {
    border: 1px solid var(--cli-border);
    background: var(--color-btn-primary-bg, var(--cli-prefix-agent));
    color: var(--color-btn-primary-text, var(--cli-bg));
  }

  .ghost-btn {
    background: transparent;
    border: 1px solid var(--cli-border);
    color: var(--cli-text-dim);
  }

  .primary-btn:hover {
    opacity: 0.9;
  }

  .ghost-btn:hover {
    background: var(--cli-selection);
    color: var(--cli-text);
    border-color: var(--cli-text-muted);
  }

  /* Features */
  .features {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-lg);
    max-width: 720px;
    margin: 0 auto;
    padding-top: clamp(2rem, 6vh, 4rem);
  }

  @media (min-width: 640px) {
    .features {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .feature {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .feature-label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--cli-prefix-agent);
    font-weight: 600;
  }

  .feature p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--cli-text-dim);
    line-height: 1.5;
  }

  /* Footer */
  .landing-footer {
    margin-top: auto;
    padding-top: clamp(2rem, 6vh, 4rem);
    padding-bottom: var(--space-lg);
    text-align: center;
  }

  .footer-link {
    font-size: var(--text-xs);
    color: var(--cli-text-muted);
    text-decoration: none;
    letter-spacing: 0.04em;
  }

  .footer-link:hover {
    color: var(--cli-text-dim);
  }
</style>
