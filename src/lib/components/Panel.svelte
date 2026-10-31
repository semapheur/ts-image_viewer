<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<section>
  <h2>{title}</h2>
  {@render children()}
</section>

<style>
  section {
    display: grid;
    grid-template-columns: minmax(
      0,
      1fr
    ); /* children may shrink to the panel's width */
    gap: 0.5rem;
    min-width: 0;
  }
  h2 {
    font-size: 1rem;
    margin: 0 0 0.125rem;
    font-weight: 600;
  }
</style>
