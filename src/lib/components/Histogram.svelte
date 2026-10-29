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
  }

  let { data, channel, label, color, log, lo, hi, total }: Props = $props();

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
    <span class="stat"
      >mean {stats.mean.toFixed(3)} · {stats.inRange.toFixed(1)}% in range</span
    >
  </figcaption>
  <canvas bind:this={canvas} width={W} height={H}></canvas>
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
    font-size: 0.8rem;
    margin-bottom: 0.2rem;
  }
  .stat,
  .axis {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  canvas {
    width: 100%;
    height: 5.5rem;
    display: block;
    background: var(--well);
    border-radius: 3px;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
  }
</style>
