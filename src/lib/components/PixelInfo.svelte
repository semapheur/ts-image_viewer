<script lang="ts">
  import type { RGB } from "../types";

  interface Props {
    x: number;
    y: number;
    adjusted: RGB;
    original: RGB;
  }
  let { x, y, adjusted, original }: Props = $props();

  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const hex = (c: RGB) =>
    "#" + c.map((v) => byte(v).toString(16).padStart(2, "0")).join("");

  function hsl(c: RGB): [number, number, number] {
    const [r, g, b] = c.map((v) => Math.min(1, Math.max(0, v)));
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l * 100];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s * 100, l * 100];
  }

  const rows = ["R", "G", "B"] as const;
  const adjHsl = $derived(hsl(adjusted));
</script>

<div class="pixel">
  <div class="swatches">
    <figure>
      <div class="swatch" style:background={hex(original)}></div>
      <figcaption>Original</figcaption>
    </figure>
    <figure>
      <div class="swatch" style:background={hex(adjusted)}></div>
      <figcaption>Adjusted</figcaption>
    </figure>
  </div>

  <dl>
    <dt class="rgb-label">RGB</dt>
    <dd>
      {byte(adjusted[0])}, {byte(adjusted[1])}, {byte(adjusted[2])} / {adjusted[0].toFixed(
        3,
      )},
      {adjusted[1].toFixed(3)},
      {adjusted[2].toFixed(3)}
    </dd>
    <dd class="muted">
      (was {byte(original[0])}, {byte(original[1])}, {byte(original[2])} / {original[0].toFixed(
        3,
      )},
      {original[1].toFixed(3)},
      {original[2].toFixed(3)})
    </dd>
    <dt>Hex</dt>
    <dd>{hex(adjusted)} <span class="muted">(was {hex(original)})</span></dd>
    <dt>HSL</dt>
    <dd>
      {adjHsl[0].toFixed(0)}°, {adjHsl[1].toFixed(0)}%, {adjHsl[2].toFixed(0)}%
    </dd>
    <dt>Position</dt>
    <dd>{x}, {y}</dd>
  </dl>
</div>

<style>
  .pixel {
    display: grid;
    gap: 0.6rem;
    font-size: 0.85rem;
  }
  .swatches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  figure {
    margin: 0;
  }
  .swatch {
    height: 2.75rem;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
  }
  figcaption {
    color: var(--muted);
    font-size: 0.75rem;
    margin-top: 0.15rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.75rem;
    margin: 0;
  }
  dt,
  .muted {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .rgb-label {
    grid-row: span 2;
    align-self: start;
  }
</style>
