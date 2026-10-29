<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section>
  <h2>{title}</h2>
  {@render children()}
</section>

<style>
  section {
    display: grid;
    gap: 0.5rem;
  }
  h2 {
    font-size: 1rem;
    margin: 0 0 0.25rem;
    font-weight: 600;
  }
</style>
