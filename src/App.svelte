<script lang="ts">
  import "./app.css";
  import { Params, setParams } from "./lib/contexts/params.svelte";
  import { Viewer, setViewer } from "./lib/contexts/viewer.svelte";
  import { Convolution, setConv } from "./lib/contexts/convolution.svelte";
  import { DETAIL, TONE } from "./lib/slider_specs";
  import Viewport from "./lib/components/Viewport.svelte";
  import FilePicker from "./lib/components/FilePicker.svelte";
  import SliderPanel from "./lib/components/SliderPanel.svelte";
  import HistogramPanel from "./lib/components/HistogramPanel.svelte";
  import PixelPanel from "./lib/components/PixelPanel.svelte";
  import StretchPanel from "./lib/components/StretchPanel.svelte";
  import SigmoidPanel from "./lib/components/SigmoidPanel.svelte";
  import OutputPanel from "./lib/components/OutputPanel.svelte";
  import ConvolutionPanel from "./lib/components/ConvolutionPanel.svelte";

  const params = new Params();
  setParams(params);
  const conv = new Convolution();
  setConv(conv);
  const viewer = new Viewer(params, conv);
  setViewer(viewer);
</script>

<!-- Dropping an image anywhere on the page loads it. -->
<svelte:window
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    viewer.load(e.dataTransfer?.files[0]);
  }}
/>

<main>
  <aside class="left">
    <div class="actions">
      <button
        onclick={() => {
          params.reset();
          conv.reset();
        }}>Reset all</button
      >
      <FilePicker
        class="button"
        disabled={viewer.loading}
        onfile={(f) => viewer.load(f)}
      >
        Open another image
      </FilePicker>
    </div>
    <OutputPanel />
    <SliderPanel title="Tone" specs={TONE} />
    <SigmoidPanel />
    <StretchPanel />
    <SliderPanel title="Detail" specs={DETAIL} />
    <ConvolutionPanel />
  </aside>
  <Viewport />

  <aside class="right">
    <HistogramPanel />
    <PixelPanel />
  </aside>
</main>

<style>
  main {
    display: grid;
    grid-template-columns:
      22rem minmax(0, 1fr)
      22rem; /* fixed sidebars, flexible viewport */
    height: 100vh;
  }
  aside {
    display: grid;
    grid-template-columns: minmax(
      0,
      1fr
    ); /* items may shrink to the sidebar's width */
    gap: 0.75rem;
    align-content: start;
    min-width: 0;
    padding: 0.5rem 1rem;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    background: var(--panel);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  @media (max-width: 800px) {
    main {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 50vh auto auto;
      height: auto;
      min-height: 100vh;
    }
    main > :global(.stage) {
      order: -1; /* viewport first when the sidebars stack */
    }
  }
</style>
