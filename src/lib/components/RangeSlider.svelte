<script lang="ts">
  interface Props {
    label: string;
    lo: number;
    hi: number;
    min?: number;
    max?: number;
    step?: number;
    minGap?: number;
    neutralLo?: number;
    neutralHi?: number;
  }

  let {
    label,
    lo = $bindable(),
    hi = $bindable(),
    min = 0,
    max = 1,
    step = 0.01,
    minGap = 0.02, // closest the two handles may get
    neutralLo = min, // restored by double-click
    neutralHi = max,
  }: Props = $props();

  const frac = (v: number) => (v - min) / (max - min);
  const round = (v: number) => Math.round(v * 1e4) / 1e4; // hide float noise like 0.9800000000000001

  function onLo(e: Event & { currentTarget: HTMLInputElement }) {
    lo = round(Math.min(e.currentTarget.valueAsNumber, hi - minGap));
    e.currentTarget.value = String(lo); // show the clamped value even if state didn't change
  }

  function onHi(e: Event & { currentTarget: HTMLInputElement }) {
    hi = round(Math.max(e.currentTarget.valueAsNumber, lo + minGap));
    e.currentTarget.value = String(hi);
  }

  function reset() {
    lo = neutralLo;
    hi = neutralHi;
  }
</script>

<div class="row">
  <span>{label}</span>
  <output>{lo.toFixed(2)}–{hi.toFixed(2)}</output>

  <!-- Double-click anywhere on the control resets both ends. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="control"
    style:--lo={frac(lo)}
    style:--hi={frac(hi)}
    ondblclick={reset}
  >
    <div class="track"></div>
    <div class="fill"></div>
    <!-- When both handles sit at the far right, keep the low one on top so it can still be grabbed. -->
    <input
      type="range"
      aria-label="{label}, low"
      {min}
      {max}
      {step}
      value={lo}
      oninput={onLo}
      style:z-index={frac(lo) > 0.9 ? 3 : 1}
    />
    <input
      type="range"
      aria-label="{label}, high"
      {min}
      {max}
      {step}
      value={hi}
      oninput={onHi}
      style:z-index="2"
    />
  </div>
</div>

<style>
  /* Label and readout share the first line; the track then spans the full width below them. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.1rem 0.5rem;
    font-size: 0.85rem;
  }
  .control {
    grid-column: 1 / -1;
  }
  output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .control {
    --thumb: 14px;
    position: relative;
    height: 1.5rem;
  }
  .track,
  .fill {
    position: absolute;
    top: 50%;
    height: 4px;
    transform: translateY(-50%);
    border-radius: 2px;
  }
  .track {
    left: 0;
    right: 0;
    background: var(--edge);
  }
  /* The native thumb's centre travels from thumb/2 to width - thumb/2. */
  .fill {
    left: calc(var(--thumb) / 2 + (100% - var(--thumb)) * var(--lo));
    width: calc((100% - var(--thumb)) * (var(--hi) - var(--lo)));
    background: var(--ink);
  }

  /* Two stacked native range inputs: only their thumbs receive the pointer. */
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    margin: 0;
    background: none;
    appearance: none;
    -webkit-appearance: none;
    pointer-events: none;
  }
  input:focus-visible {
    outline: none;
  }
  input::-webkit-slider-runnable-track {
    background: transparent;
  }
  input::-moz-range-track {
    background: transparent;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    border: 2px solid var(--panel);
    background: var(--ink);
    cursor: pointer;
  }
  input::-moz-range-thumb {
    pointer-events: auto;
    box-sizing: border-box;
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    border: 2px solid var(--panel);
    background: var(--ink);
    cursor: pointer;
  }
  input:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  input:focus-visible::-moz-range-thumb {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>
