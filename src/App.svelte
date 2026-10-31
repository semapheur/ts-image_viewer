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
  <aside>
    <div class="actions">
      <button onclick={params.reset}>Reset all</button>
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

  <aside>
    <HistogramPanel />
    <PixelPanel />
  </aside>
</main>

<style>
  main {
    display: grid;
    grid-template-columns: auto 1fr auto;
    height: 100vh;
  }
  aside {
    display: grid;
    gap: 1.25rem;
    align-content: start;
    padding: 1rem;
    overflow-y: auto;
    background: var(--panel);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  @media (max-width: 800px) {
    main {
      grid-template-columns: 1fr;
      grid-template-rows: 50vh 1fr;
    }
  }
</style>
