<script lang="ts">
  import CurvePlot from "./CurvePlot.svelte";

  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    neutral?: number;
    disabled?: boolean;
    /** If given, a plot of this transfer curve appears while the slider is being adjusted. */
    curve?: (x: number, value: number) => number;
  }

  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 0.01,
    neutral = 0,
    disabled = false,
    curve,
  }: Props = $props();

  const TIP_W = 176; // px
  const GAP = 20; // px between the slider row and the tooltip (clears the sidebar's padding)
  const MARGIN = 8; // px kept clear of the window edges

  /**
   * Put a w x h tooltip beside `r` without covering it and without leaving the window.
   * Tries left, right, above, then below, and takes the first that fits completely.
   */
  function place(r: DOMRect, w: number, h: number) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, lo), Math.max(lo, hi));
    const x = clamp(r.left + r.width / 2 - w / 2, MARGIN, vw - w - MARGIN); // centred on the row
    const y = clamp(r.top + r.height / 2 - h / 2, MARGIN, vh - h - MARGIN); // level with the row

    const candidates = [
      { x: r.left - w - GAP, y }, // left of the row
      { x: r.right + GAP, y }, // right of the row
      { x, y: r.top - h - GAP }, // above
      { x, y: r.bottom + GAP }, // below
    ];
    const fits = (c: { x: number; y: number }) =>
      c.x >= MARGIN &&
      c.y >= MARGIN &&
      c.x + w <= vw - MARGIN &&
      c.y + h <= vh - MARGIN;

    const found = candidates.find(fits);
    if (found) return found;

    // Window too small for any clean placement: use whichever side of the row has more room.
    return r.top > vh - r.bottom
      ? { x, y: Math.max(MARGIN, r.top - h - GAP) }
      : { x, y: Math.min(vh - h - MARGIN, r.bottom + GAP) };
  }

  let row: HTMLLabelElement;
  let dragging = $state(false);
  let focused = $state(false); // keyboard focus / arrow keys
  let tipH = $state(230); // estimate, replaced by the measured height once the tooltip is shown
  let pos = $state({ x: 0, y: 0 });

  const visible = $derived(!!curve && !disabled && (dragging || focused));

  // Placed once when it appears (and again if its measured height changes), then it stays put
  // while you drag instead of following the thumb.
  $effect(() => {
    if (!visible) return;
    pos = place(row.getBoundingClientRect(), TIP_W, tipH);
  });
</script>

<!-- A drag can end anywhere on the page. -->
<svelte:window
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
/>

<label class="row" bind:this={row}>
  <span>{label}</span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {disabled}
    bind:value
    onpointerdown={() => (dragging = true)}
    onfocus={(e) => (focused = e.currentTarget.matches(":focus-visible"))}
    onkeydown={() => (focused = true)}
    onblur={() => (focused = false)}
    ondblclick={() => (value = neutral)}
  />
  <output>{value.toFixed(Number.isInteger(step) ? 0 : 2)}</output>
</label>

{#if visible && curve}
  <div
    class="tip"
    role="tooltip"
    bind:offsetHeight={tipH}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    style:width="{TIP_W}px"
  >
    <CurvePlot fn={(x) => curve(x, value)} size={TIP_W - 16} />
    <p>
      {label}
      {value.toFixed(2)} · mid-grey 0.50 → {curve(0.5, value).toFixed(2)}
    </p>
  </div>
{/if}

<style>
  .row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) 3rem;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  input {
    accent-color: var(--ink);
    width: 100%;
  }
  .tip {
    position: fixed;
    z-index: 100;
    box-sizing: border-box;
    padding: 0.5rem;
    border: 1px solid var(--edge);
    border-radius: 6px;
    background: var(--well);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.4);
    pointer-events: none;
  }
  .tip p {
    margin: 0.35rem 0 0;
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
