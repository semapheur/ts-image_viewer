<script lang="ts">
  import Panel from "./Panel.svelte";
  import ParamSliders from "./ParamSliders.svelte";
  import { getParams } from "../contexts/params.svelte";
  import { getViewer } from "../contexts/viewer.svelte";
  import { BIT_DEPTH } from "../slider_specs";

  const viewer = getViewer();
  const { values: v } = getParams();

  // With float32 storage 16 bits is a real setting; with half-float it means "off".
  const offAt = $derived(viewer.deep ? 17 : 16);
  const levels = $derived(2 ** v.bitDepth);
</script>

<Panel title="Bit depth">
  {#if viewer.sourceInfo}
    <p class="hint">{viewer.sourceInfo}</p>
  {/if}
  <ParamSliders specs={BIT_DEPTH} />
  <p class="hint">
    {#if v.bitDepth >= offAt}
      Full precision
    {:else}
      {levels.toLocaleString()} levels per channel
    {/if}
    {#if v.bitDepth > 8}· the screen still displays 8 bits{/if}
  </p>
  <button onclick={() => viewer.exportPng()} disabled={!viewer.ready}
    >Export 16-bit PNG</button
  >
</Panel>
