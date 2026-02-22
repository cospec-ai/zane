<script lang="ts">
    import type { Snippet } from "svelte";
    import { auth } from "../auth.svelte";
    import { route } from "../../router";
    import { navigate } from "../../router";

    const { children }: { children: Snippet } = $props();

    const isPublic = $derived(route.pathname === "/" || route.pathname === "/login" || route.pathname === "/register");

    $effect(() => {
        if (auth.status !== "loading" && auth.status !== "signed_in" && !isPublic) {
            navigate("/login");
        }
    });
</script>

{#if auth.status === "loading"}
    <div class="auth-shell">
        <div class="auth-status">Checking session...</div>
    </div>
{:else if auth.status === "signed_in" || isPublic}
    {@render children()}
{:else}
    <div class="auth-shell">
        <div class="auth-status">Redirecting...</div>
    </div>
{/if}

<style>
    .auth-shell {
        min-height: 100vh;
        background: var(--cli-bg);
        color: var(--cli-text);
        font-family: var(--font-mono);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .auth-status {
        color: var(--cli-text-dim);
        font-size: var(--text-sm);
    }
</style>
