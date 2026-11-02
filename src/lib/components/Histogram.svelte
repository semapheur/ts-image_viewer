<script lang="ts">
  import { BINS } from "../pipeline";

  interface Props {
    data: Uint32Array | null;
    channel: number;
    label: string;
    color: string;
    log: boolean;
    lo: number;
    hi: number;
    total: number;
    // Value (0..1, same space as the histogram) to mark with a dashed line, e.g. the picked pixel.
    marker?: number | null;
  }

  let {
    data,
    channel,
    label,
    color,
    log,
    lo,
    hi,
    total,
    marker = null,
  }: Props = $props();

  let canvas: HTMLCanvasElement;
  const W = 512,
    H = 90;

  const slice = $derived(
    data ? data.subarray(channel * BINS, (channel + 1) * BINS) : null,
  );

  const stats = $derived.by(() => {
    if (!slice) return { mean: 0, inRange: 0 };
    let n = 0,
      sum = 0;
    for (let i = 0; i < BINS; i++) {
      n += slice[i];
      sum += slice[i] * (i + 0.5);
    }
    const mean = n ? lo + (sum / n / BINS) * (hi - lo) : 0;
    return { mean, inRange: total ? (100 * n) / total : 0 };
  });

  // Where the marker falls inside the current range window, as a percentage of the plot width.
  const markerPct = $derived(
    marker === null || hi <= lo ? null : ((marker - lo) / (hi - lo)) * 100,
  );
  const markerVisible = $derived(
    markerPct !== null && markerPct >= 0 && markerPct <= 100,
  );

  $effect(() => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    if (!slice) return;
    const f = (v: number) => (log ? Math.log1p(v) : v);
    let peak = 0;
    for (let i = 0; i < BINS; i++) peak = Math.max(peak, slice[i]);
    if (!peak) return;
    ctx.fillStyle = color;
    const bw = W / BINS;
    for (let i = 0; i < BINS; i++) {
      const h = (f(slice[i]) / f(peak)) * (H - 2);
      ctx.fillRect(i * bw, H - h, Math.ceil(bw), h);
    }
  });
</script>

<figure>
  <figcaption>
    <span>{label}</span>
    <span class="stat">
      {#if marker !== null}
        pixel {marker.toFixed(3)}{markerVisible ? "" : " (outside range)"} ·
      {/if}
      mean {stats.mean.toFixed(3)} · {stats.inRange.toFixed(1)}% in range
    </span>
  </figcaption>

  <div class="plot">
    <canvas bind:this={canvas} width={W} height={H}></canvas>
    {#if markerVisible}
      <div class="marker" style:left="{markerPct}%"></div>
    {/if}
  </div>

  <div class="axis">
    <span>{lo.toFixed(2)}</span><span>{hi.toFixed(2)}</span>
  </div>
</figure>

<style>
  figure {
    margin: 0;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.8rem;
    margin-bottom: 0.2rem;
  }
  .stat,
  .axis {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .plot {
    position: relative;
    overflow: hidden;
    border-radius: 3px;
    background: var(--well);
  }
  canvas {
    width: 100%;
    height: 5.5rem;
    display: block;
  }
  /* Dashed vertical line; the dark halo keeps it readable over any bar colour. */
  .marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    transform: translateX(-50%);
    background: repeating-linear-gradient(
      to bottom,
      var(--ink) 0 5px,
      transparent 5px 9px
    );
    filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000);
    pointer-events: none;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
  }
</style>
