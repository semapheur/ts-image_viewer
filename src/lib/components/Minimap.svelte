<script lang="ts">
  interface Props {
    bitmap: ImageBitmap;
    imgW: number;
    imgH: number; // image size in pixels
    cx: number;
    cy: number; // image pixel shown at the viewport centre
    zoom: number; // CSS px per image px
    viewW: number;
    viewH: number; // viewport size in CSS px
    onpan: (ix: number, iy: number) => void;
  }

  let { bitmap, imgW, imgH, cx, cy, zoom, viewW, viewH, onpan }: Props =
    $props();

  const MAX_W = 176,
    MAX_H = 132;
  const scale = $derived(Math.min(MAX_W / imgW, MAX_H / imgH));
  const w = $derived(Math.round(imgW * scale));
  const h = $derived(Math.round(imgH * scale));

  let el: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let dragging = false;

  // Thumbnail (the original, unedited image). Redrawn only when the image or size changes.
  $effect(() => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  });

  // Visible region as percentages of the image, clamped to the image bounds.
  const rect = $derived.by(() => {
    const vw = viewW / zoom,
      vh = viewH / zoom;
    const x0 = Math.max(0, cx - vw / 2),
      x1 = Math.min(imgW, cx + vw / 2);
    const y0 = Math.max(0, cy - vh / 2),
      y1 = Math.min(imgH, cy + vh / 2);
    return {
      left: (x0 / imgW) * 100,
      top: (y0 / imgH) * 100,
      width: ((x1 - x0) / imgW) * 100,
      height: ((y1 - y0) / imgH) * 100,
    };
  });
  // Nothing to show while the whole image is visible.
  const partial = $derived(rect.width < 99.5 || rect.height < 99.5);

  function pan(e: PointerEvent) {
    const r = el.getBoundingClientRect();
    onpan(
      ((e.clientX - r.left) / r.width) * imgW,
      ((e.clientY - r.top) / r.height) * imgH,
    );
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation(); // don't start a drag-pan on the main stage
    el.setPointerCapture(e.pointerId);
    dragging = true;
    pan(e);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    e.stopPropagation();
    pan(e);
  }
  const up = () => (dragging = false);
</script>

<div
  class="minimap"
  class:off={!partial}
  bind:this={el}
  role="application"
  aria-label="Image overview. Click or drag to pan."
  style:width="{w}px"
  style:height="{h}px"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={(e) => e.stopPropagation()}
>
  <canvas bind:this={canvas} style:width="{w}px" style:height="{h}px"></canvas>
  <div
    class="viewport"
    style:left="{rect.left}%"
    style:top="{rect.top}%"
    style:width="{rect.width}%"
    style:height="{rect.height}%"
  ></div>
</div>

<style>
  .minimap {
    position: absolute;
    right: 0.75rem;
    bottom: 0.75rem;
    overflow: hidden;
    border-radius: 3px;
    cursor: crosshair;
    background: var(--well);
    box-shadow:
      0 0 0 1px #4a4f56,
      0 4px 14px rgb(0 0 0 / 0.35);
    touch-action: none;
  }
  .minimap.off {
    display: none;
  }
  canvas {
    display: block;
  }
  .viewport {
    position: absolute;
    box-sizing: border-box;
    border: 1.5px solid var(--ink);
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.5); /* dims everything outside the visible region */
    pointer-events: none;
  }
</style>
