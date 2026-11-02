<script lang="ts">
  import Panel from "./Panel.svelte";
  import Slider from "./Slider.svelte";
  import ParamSliders from "./ParamSliders.svelte";
  import { getParams } from "../contexts/params.svelte";
  import { getViewer } from "../contexts/viewer.svelte";
  import { BAND_SPECS, CLIP, CURVES, MIDTONE, STRENGTH } from "../slider_specs";

  const params = getParams();
  const viewer = getViewer();
  const v = params.values;

  const BANDS = ["R", "G", "B"];

  function setLinked(linked: boolean) {
    v.linked = linked;
    if (linked) params.linkBands();
  }
</script>

<Panel title="Stretch">
  <label class="check">
    <input type="checkbox" bind:checked={v.auto} /> Auto range from image extent
  </label>
  {#if v.auto}
    <label class="check">
      <input type="checkbox" bind:checked={v.autoVisible} /> Visible area only (follows
      zoom and pan)
    </label>
    <ParamSliders specs={CLIP} />
  {/if}

  <label class="check">
    <input type="checkbox" bind:checked={() => v.linked, setLinked} /> Link bands
  </label>

  {#if v.linked}
    <Slider
      label="Black"
      disabled={v.auto}
      min={0}
      max={0.98}
      neutral={0}
      bind:value={() => v.blackR, (x) => params.setBoth("black", x)}
    />
    <Slider
      label="White"
      disabled={v.auto}
      min={0.02}
      max={1}
      neutral={1}
      bind:value={() => v.whiteR, (x) => params.setBoth("white", x)}
    />
  {:else}
    <ParamSliders specs={BAND_SPECS} disabled={v.auto} />
  {/if}

  <label class="select">
    Curve
    <select bind:value={v.stretchMode}>
      {#each CURVES as c (c.value)}
        <option value={c.value}>{c.label}</option>
      {/each}
    </select>
  </label>
  {#if v.stretchMode === 1}
    <ParamSliders specs={MIDTONE} />
  {:else if v.stretchMode === 2 || v.stretchMode === 3}
    <ParamSliders specs={STRENGTH} />
  {/if}

  {#if viewer.extent}
    {@const visible = v.auto && v.autoVisible && viewer.regionExtent}
    {@const e = visible ? viewer.regionExtent! : viewer.extent}
    <p class="hint">
      {visible ? "Visible extent:" : "Image extent:"}
      {#each BANDS as band, i}
        {i ? " · " : ""}{band} {e.black[i].toFixed(3)}–{e.white[i].toFixed(3)}
      {/each}
    </p>
  {/if}
</Panel>
