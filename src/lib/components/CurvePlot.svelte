<script lang="ts">
  interface Props {
    fn: (x: number) => number;
    size?: number;
  }

  let { fn, size = 160 }: Props = $props();

  const N = 64;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const path = $derived.by(() => {
    let d = "";
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      d += `${i ? "L" : "M"}${(x * 100).toFixed(2)} ${((1 - clamp01(fn(x))) * 100).toFixed(2)}`;
    }
    return d;
  });

  // Where mid-grey lands: a quick read of whether the curve brightens or darkens.
  const mid = $derived(clamp01(fn(0.5)));
</script>

<svg
  viewBox="-10 -6 118 122"
  width={size}
  height={size}
  role="img"
  aria-label="Transfer curve"
>
  {#each [0, 25, 50, 75, 100] as t}
    <line class="grid" x1={t} y1="0" x2={t} y2="100" />
    <line class="grid" x1="0" y1={t} x2="100" y2={t} />
  {/each}
  <line class="ref" x1="0" y1="100" x2="100" y2="0" />
  <path class="curve" d={path} />
  <circle class="dot" cx="50" cy={(1 - mid) * 100} r="2.8" />
  <text x="50" y="112" text-anchor="middle">input</text>
  <text x="-5" y="50" text-anchor="middle" transform="rotate(-90 -5 50)"
    >output</text
  >
</svg>

<style>
  svg {
    display: block;
  }
  .grid {
    stroke: var(--edge);
    stroke-width: 0.5;
  }
  .ref {
    stroke: var(--muted);
    stroke-width: 0.8;
    stroke-dasharray: 3 3;
  }
  .curve {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .dot {
    fill: var(--ink);
    stroke: var(--well);
    stroke-width: 1.2;
  }
  text {
    fill: var(--muted);
    font-size: 7px;
  }
</style>
