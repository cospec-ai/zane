<script lang="ts">
  import { Router } from "sv-router";
  import AuthGate from "./lib/components/AuthGate.svelte";
  import "./router";
</script>

<AuthGate>
  <div class="app stack">
    <Router />
  </div>
</AuthGate>

<style>
  .app {
    --stack-gap: 0;
    height: 100%;
    width: 100%;
    max-width: var(--app-max-width);
    margin: 0 auto;
  }
</style>
