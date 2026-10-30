<script lang="ts">
  import Panel from "./Panel.svelte";
  import PixelInfo from "./PixelInfo.svelte";
  import { getViewer } from "../contexts/viewer.svelte";

  const viewer = getViewer();
</script>

<Panel title="Pixel">
  {#if viewer.picked}
    <PixelInfo {...viewer.picked} maxValue={viewer.deep ? 65535 : 255} />
  {:else}
    <p class="hint">Click the image to inspect a pixel.</p>
  {/if}
</Panel>
