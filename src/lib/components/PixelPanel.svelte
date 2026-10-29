<script lang="ts">
  import Panel from "./Panel.svelte";
  import Pixelinfo from "./Pixelinfo.svelte";
  import { getViewer } from "../contexts/viewer.svelte";

  const viewer = getViewer();
</script>

<Panel title="Pixel">
  {#if viewer.picked}
    <Pixelinfo {...viewer.picked} />
  {:else}
    <p class="hint">Click the image to inspect a pixel.</p>
  {/if}
</Panel>
