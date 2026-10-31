<script lang="ts">
  import Panel from "./Panel.svelte";
  import RangeSlider from "./RangeSlider.svelte";
  import Histogram from "./Histogram.svelte";
  import { getParams } from "../contexts/params.svelte";
  import { getViewer } from "../contexts/viewer.svelte";

  const viewer = getViewer();
  const { values: v } = getParams();

  const CHANNELS = [
    { channel: 0, label: "Red", color: "#e8665c" },
    { channel: 1, label: "Green", color: "#5dba70" },
    { channel: 2, label: "Blue", color: "#5f98e8" },
    { channel: 3, label: "Luma", color: "#c8c6c0" },
  ];

  let logScale = $state(false);
  const total = $derived(viewer.img.w * viewer.img.h);
</script>

<Panel title="Histograms">
  <div class="grid">
    {#each CHANNELS as c (c.channel)}
      <Histogram
        {...c}
        data={viewer.hist}
        log={logScale}
        lo={v.histLo}
        hi={v.histHi}
        {total}
      />
    {/each}
  </div>
  <RangeSlider label="Range" bind:lo={v.histLo} bind:hi={v.histHi} />
  <label class="check">
    <input type="checkbox" bind:checked={logScale} /> Logarithmic counts
  </label>
</Panel>

<style>
  .grid {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
</style>
