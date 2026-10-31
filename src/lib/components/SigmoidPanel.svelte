<script lang="ts">
  import { getParams } from "../contexts/params.svelte";
  import {
    AMOUNT_MAX,
    MID_MAX,
    MID_MIN,
    OFF_BELOW,
    sigmoidCurve,
  } from "../sigmoid";

  const { values: v } = getParams();

  // Wide landscape frame. The viewBox is in px-like units (not a unit square), so circles stay round and the plot area can have any aspect ratio.
  const VB_W = 264;
  const VB_H = 118;
  const L = 14; // plot area: left, top, width, height
  const T = 12;
  const W = 238;
  const H = 92;
  const STEPS = 80;
  const HIT = 16; // px radius within which a press grabs the handle itself

  // Plot coordinates: u = input / midpoint axis, v = output / contrast axis, both 0..1, v up.
  const X = (u: number) => L + u * W;
  const Y = (val: number) => T + (1 - val) * H;

  let svg: SVGSVGElement;
  let dragging = $state(false);
  let hovering = $state(false);
  // Where the handle sat relative to the pointer when grabbed, so grabbing it doesn't make it jump.
  let offset = { u: 0, v: 0 };

  const clamp = (x: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, x));

  const curvePath = $derived.by(() => {
    let d = "";
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      const y = Y(sigmoidCurve(u, v.sigmoidAmount, v.sigmoidMid));
      d += `${i ? "L" : "M"}${X(u).toFixed(2)},${y.toFixed(2)}`;
    }
    return d;
  });

  // The single drag point: x = midpoint, y = contrast (0 at the bottom, AMOUNT_MAX at the top).
  const handle = $derived({
    x: X(v.sigmoidMid),
    y: Y(v.sigmoidAmount / AMOUNT_MAX),
  });

  // Clamp tooltip position within viewBox bounds so it never triggers container size changes or clipping
  const tooltipX = $derived(clamp(handle.x, 85, VB_W - 85));
  const tooltipY = $derived(handle.y > 60 ? handle.y - 20 : handle.y + 24);

  function pointer(e: PointerEvent) {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { px: p.x, py: p.y, u: (p.x - L) / W, v: 1 - (p.y - T) / H };
  }

  function apply(u: number, val: number) {
    v.sigmoidMid = clamp(u, MID_MIN, MID_MAX);
    v.sigmoidAmount = clamp(val, 0, 1) * AMOUNT_MAX;
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    const p = pointer(e);
    if (!p) return;
    svg.setPointerCapture(e.pointerId);
    dragging = true;
    // Pressing the handle keeps it where it is; pressing elsewhere moves it to the pointer.
    const onHandle = Math.hypot(p.px - handle.x, p.py - handle.y) < HIT;
    offset = onHandle
      ? { u: v.sigmoidMid - p.u, v: v.sigmoidAmount / AMOUNT_MAX - p.v }
      : { u: 0, v: 0 };
    apply(p.u + offset.u, p.v + offset.v);
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const p = pointer(e);
    if (p) apply(p.u + offset.u, p.v + offset.v);
  }

  const end = () => (dragging = false);

  // Same mapping as the mouse: sideways = midpoint, up/down = contrast.
  function key(e: KeyboardEvent) {
    const midStep = e.shiftKey ? 0.05 : 0.01;
    const amountStep = e.shiftKey ? 2 : 0.5;
    if (e.key === "ArrowLeft")
      v.sigmoidMid = clamp(v.sigmoidMid - midStep, MID_MIN, MID_MAX);
    else if (e.key === "ArrowRight")
      v.sigmoidMid = clamp(v.sigmoidMid + midStep, MID_MIN, MID_MAX);
    else if (e.key === "ArrowUp")
      v.sigmoidAmount = clamp(v.sigmoidAmount + amountStep, 0, AMOUNT_MAX);
    else if (e.key === "ArrowDown")
      v.sigmoidAmount = clamp(v.sigmoidAmount - amountStep, 0, AMOUNT_MAX);
    else return;
    e.preventDefault();
  }

  function reset() {
    v.sigmoidAmount = 0;
    v.sigmoidMid = 0.5;
  }
</script>

<div>
  <div class="row">
    <span>Sigmoidal</span>
    <p class="hint">
      Contrast <span class="num contrast-num">{v.sigmoidAmount.toFixed(1)}</span
      >
      · Midpoint <span class="num mid-num">{v.sigmoidMid.toFixed(2)}</span>
      <span class="off-label" class:visible={v.sigmoidAmount < OFF_BELOW}
        >· off</span
      >
    </p>
    <button onclick={reset}>Reset</button>
  </div>
  <div class="label"></div>
  <svg
    bind:this={svg}
    class="plot"
    class:dragging
    viewBox="0 0 {VB_W} {VB_H}"
    role="slider"
    tabindex="0"
    aria-label="Sigmoidal contrast: left and right keys move the midpoint, up and down keys change the contrast"
    aria-valuemin={0}
    aria-valuemax={AMOUNT_MAX}
    aria-valuenow={v.sigmoidAmount}
    aria-valuetext="Contrast {v.sigmoidAmount.toFixed(
      1,
    )}, midpoint {v.sigmoidMid.toFixed(2)}"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
    onlostpointercapture={end}
    onkeydown={key}
  >
    <rect x={L} y={T} width={W} height={H} rx="3" class="well" />

    {#each [0.25, 0.5, 0.75] as t (t)}
      <line class="grid" x1={X(t)} x2={X(t)} y1={T} y2={T + H} />
      <line class="grid" x1={L} x2={L + W} y1={Y(t)} y2={Y(t)} />
    {/each}
    <line class="identity" x1={L} y1={T + H} x2={L + W} y2={T} />
    <path class="curve" d={curvePath} />

    <!-- guide through the midpoint -->
    <line class="guide" x1={handle.x} x2={handle.x} y1={T} y2={T + H} />

    <!-- interactive drag handle with hover tooltip -->
    <g
      class="handle-group"
      role="button"
      tabindex="0"
      onpointerenter={() => (hovering = true)}
      onpointerleave={() => (hovering = false)}
    >
      <circle class="hit" cx={handle.x} cy={handle.y} r={HIT} />
      <circle class="halo" cx={handle.x} cy={handle.y} r="10" />
      <circle class="handle" cx={handle.x} cy={handle.y} r="6" />

      {#if hovering && !dragging}
        <g class="tooltip" transform="translate({tooltipX}, {tooltipY})">
          <rect x="-82" y="-10" width="164" height="20" rx="3" />
          <text x="0" y="0">Sideways: Mid · Up/Down: Contrast</text>
        </g>
      {/if}
    </g>
  </svg>
</div>

<style>
  .plot {
    display: block;
    width: 100%;
    aspect-ratio: 264 / 118;
    color: var(--ink);
    touch-action: none;
    user-select: none;
    cursor: crosshair;
    outline: none;
    border-radius: 4px;
    overflow: hidden;
  }
  .plot:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .well {
    fill: var(--well);
    stroke: var(--edge);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  line,
  path {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .grid {
    stroke: var(--edge);
    stroke-width: 1;
    opacity: 0.6;
  }
  .identity {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 4 4;
    opacity: 0.7;
  }
  .curve {
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .guide {
    stroke: var(--muted);
    stroke-width: 1;
    opacity: 0.8;
  }
  .handle-group {
    cursor: grab;
  }
  .hit {
    fill: transparent;
  }
  .handle {
    fill: var(--ink);
    stroke: var(--well);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  /* soft ring that appears on hover, focus and drag */
  .halo {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
    opacity: 0;
    transition: opacity 0.12s;
    pointer-events: none;
  }
  .plot:hover .halo,
  .plot:focus-visible .halo,
  .dragging .halo,
  .handle-group:hover .halo {
    opacity: 0.45;
  }
  .dragging,
  .dragging .handle-group {
    cursor: grabbing;
  }
  .tooltip {
    pointer-events: none;
  }
  .tooltip rect {
    fill: var(--ink);
    stroke: var(--edge);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  .tooltip text {
    fill: var(--well);
    font-size: 8.5px;
    font-family: inherit;
    text-anchor: middle;
    dominant-baseline: central;
    user-select: none;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.85rem;
    gap: 0.5rem;
  }
  .hint {
    white-space: nowrap;
    margin: 0;
  }
  .num {
    display: inline-block;
    font-variant-numeric: tabular-nums;
  }
  .contrast-num {
    width: 5ch; /* Allocates exact horizontal space for up to 5 character widths (e.g., 100.0) */
  }
  .mid-num {
    width: 4ch; /* Allocates exact horizontal space for 4 character widths (e.g., 0.50) */
  }
  .off-label {
    visibility: hidden;
  }
  .off-label.visible {
    visibility: visible;
  }
</style>
