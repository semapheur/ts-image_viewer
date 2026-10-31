<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { getViewer } from "../contexts/viewer.svelte";
  import FilePicker from "./FilePicker.svelte";
  import Minimap from "./Minimap.svelte";
  import { INTERPOLATIONS, type Interpolation } from "../interpolation";

  const viewer = getViewer();

  const PAN_STEP = 40; // px per arrow-key press
  const CLICK_SLOP = 4; // px of movement that turns a click into a drag
  const MARKER_MIN = 10; // px: smallest outline drawn, so the pick stays visible when zoomed out

  interface Drag {
    startX: number;
    startY: number;
    x: number;
    y: number;
    panning: boolean;
  }
  let drag: Drag | null = null;

  // ───────────── attachments ─────────────

  // Start the GPU once the canvas exists.
  const gpu: Attachment<HTMLCanvasElement> = (canvas) => {
    // untrack: attachments re-run when state they read changes, and init must run once
    untrack(() => {
      void viewer.init(canvas);
    });
  };

  // Keep the viewer informed of the viewport size.
  const observeSize: Attachment<HTMLElement> = (node) => {
    const ro = new ResizeObserver(() =>
      viewer.resize(node.clientWidth, node.clientHeight),
    );
    ro.observe(node);
    return () => ro.disconnect();
  };

  // Non-passive wheel listener (so preventDefault works).
  const wheel =
    (handler: (e: WheelEvent) => void): Attachment<HTMLElement> =>
    (node) => {
      node.addEventListener("wheel", handler, { passive: false });
      return () => node.removeEventListener("wheel", handler);
    };

  // ───────────── input handling ─────────────

  // The handlers below are all attached to the stage, so `currentTarget` is the stage.
  // It has the same box as the canvas, so no element references are needed.
  const local = (e: MouseEvent): [number, number] => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onControl = (e: Event) =>
    !!(e.target as Element).closest("button, select");

  function onWheel(e: WheelEvent) {
    if (!viewer.ready) return;
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 16 : 1;
    const k = e.ctrlKey ? 0.01 : 0.0015; // ctrlKey = trackpad pinch
    viewer.zoomAt(...local(e), Math.exp(-e.deltaY * lines * k));
  }

  function onDown(e: PointerEvent) {
    if (!viewer.ready || e.button !== 0 || onControl(e)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      panning: false,
    };
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    if (!drag.panning) {
      // Ignore jitter so a click never nudges the view before it picks a pixel.
      if (
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <
        CLICK_SLOP
      )
        return;
      drag.panning = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    viewer.panBy(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
  }

  function onUp(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (d && !d.panning && e.type === "pointerup")
      void viewer.pickAt(...local(e));
  }

  function onDbl(e: MouseEvent) {
    if (!onControl(e)) viewer.toggleActualSize(...local(e));
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as Element).closest("select, input, textarea")) return; // let controls keep their keys
    const cx = viewer.view.viewW / 2;
    const cy = viewer.view.viewH / 2;
    switch (e.key) {
      case "0":
        viewer.fit();
        break;
      case "1":
        viewer.zoomTo(cx, cy, 1);
        break;
      case "+":
      case "=":
        viewer.zoomAt(cx, cy, 1.25);
        break;
      case "-":
        viewer.zoomAt(cx, cy, 0.8);
        break;
      case "ArrowLeft":
        viewer.panBy(PAN_STEP, 0);
        break;
      case "ArrowRight":
        viewer.panBy(-PAN_STEP, 0);
        break;
      case "ArrowUp":
        viewer.panBy(0, PAN_STEP);
        break;
      case "ArrowDown":
        viewer.panBy(0, -PAN_STEP);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<!-- The stage is a custom pan/zoom widget: it is focusable and handles pointer and key input by design. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="stage"
  role="application"
  aria-label="Image viewer"
  tabindex="0"
  {@attach observeSize}
  {@attach wheel(onWheel)}
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
  ondblclick={onDbl}
  onkeydown={onKey}
>
  <canvas class:hidden={!viewer.imageReady} {@attach gpu}></canvas>

  {#if !viewer.imageReady}
    <FilePicker
      class="drop"
      disabled={!viewer.gpuReady || viewer.loading}
      onfile={(f) => viewer.load(f)}
    >
      {viewer.loading
        ? "Loading…"
        : viewer.gpuReady
          ? "Drop an image here, or choose a file"
          : "Starting GPU…"}
    </FilePicker>
  {/if}

  {#if viewer.error}
    <p class="error" role="alert">{viewer.error}</p>
  {/if}

  {#if viewer.imageReady}
    <div class="toolbar">
      <button onclick={() => viewer.fit()}>Fit</button>
      <button onclick={() => viewer.actualSize()}>100%</button>
      <select
        class="select"
        title="Interpolation"
        value={viewer.interpolation}
        onchange={(e) =>
          viewer.setInterpolation(e.currentTarget.value as Interpolation)}
      >
        {#each INTERPOLATIONS as m (m.id)}
          <option value={m.id} title={m.hint}>{m.label}</option>
        {/each}
      </select>
      <output>{viewer.zoomPct}%</output>
    </div>
  {/if}

  {#if viewer.imageReady && viewer.bitmap}
    <Minimap
      bitmap={viewer.bitmap}
      imgW={viewer.img.w}
      imgH={viewer.img.h}
      cx={viewer.vs.cx}
      cy={viewer.vs.cy}
      zoom={viewer.vs.zoom}
      viewW={viewer.vs.w}
      viewH={viewer.vs.h}
      onpan={(x, y) => viewer.centerOn(x, y)}
    />
  {/if}

  {#if viewer.picked}
    {@const p = viewer.picked}
    {@const s = viewer.vs}
    <!-- Outline of the picked pixel: exactly one image pixel at high zoom, a small box when zoomed out -->
    {@const side = Math.max(s.zoom, MARKER_MIN)}
    {@const midX = (p.x + 0.5 - s.cx) * s.zoom + s.w / 2}
    {@const midY = (p.y + 0.5 - s.cy) * s.zoom + s.h / 2}
    {@const stroke = side >= 72 ? 3 : side >= 24 ? 2 : 1}
    <div
      class="marker"
      style:left="{midX - side / 2}px"
      style:top="{midY - side / 2}px"
      style:width="{side}px"
      style:height="{side}px"
      style:border-width="{stroke}px"
    ></div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  canvas.hidden {
    display: none;
  }
  .error {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    right: 1rem;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 4px;
    background: #5b2a2a;
  }
  .toolbar {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.85rem;
  }
  .marker {
    position: absolute;
    box-sizing: border-box; /* the white stroke sits inside the pixel's own footprint */
    border: 1px solid #fff;
    outline: 1px solid #000; /* dark outer edge keeps it visible on light areas */
    pointer-events: none;
  }
  .select {
    flex: 1;
    min-width: 0; /* a select's intrinsic width would otherwise stop it shrinking */
    background: var(--well);
    color: var(--ink);
    border: 1px solid var(--edge);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    font: inherit;
  }
</style>
