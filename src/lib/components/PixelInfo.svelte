<script lang="ts">
  import { srgbToHsl, srgbToOklch, type RGB } from "../color";

  interface Props {
    x: number;
    y: number;
    adjusted: RGB;
    original: RGB;
    maxValue?: number;
  }
  let { x, y, adjusted, original, maxValue = 255 }: Props = $props();

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const level = (v: number) => Math.round(clamp01(v) * maxValue);
  const hex = (c: RGB) =>
    "#" + c.map((v) => byte(v).toString(16).padStart(2, "0")).join("");

  const deg = (h: number | null) => (h === null ? "—" : `${h.toFixed(1)}°`);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const hslAdjusted = $derived(srgbToHsl(adjusted));
  const hslOriginal = $derived(srgbToHsl(original));

  const oklchAdjusted = $derived(srgbToOklch(adjusted));
  const oklchOriginal = $derived(srgbToOklch(original));
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
    <dt class="wrap-row" title="Red, Green, Blue">RGB</dt>
    <dd>
      {String(level(adjusted[0]))}, {String(level(adjusted[1]))}, {String(
        level(adjusted[2]),
      )} / {adjusted[0].toFixed(3)},
      {adjusted[1].toFixed(3)},
      {adjusted[2].toFixed(3)}
    </dd>
    <dd class="muted">
      (was {String(level(original[0]))}, {String(level(original[1]))}, {String(
        level(original[2]),
      )} / {original[0].toFixed(3)},
      {original[1].toFixed(3)},
      {original[2].toFixed(3)})
    </dd>
    <dt>Hex</dt>
    <dd>{hex(adjusted)} <span class="muted">(was {hex(original)})</span></dd>
    <dt class="wrap-row" title="Hue, Saturation, Lighness">HSL</dt>
    <dd>
      {deg(hslAdjusted.h)}, {pct(hslAdjusted.s)}, {pct(hslAdjusted.l)}
    </dd>
    <dd>
      <span class="muted">
        (was {deg(hslOriginal.h)}, {pct(hslOriginal.s)}, {pct(hslOriginal.l)})
      </span>
    </dd>
    <dt class="wrap-row" title="Lightness, Chroma, Hue">OKLCH</dt>
    <dd>
      {pct(oklchAdjusted.l)}, {oklchAdjusted.c.toFixed(3)}, {deg(
        oklchAdjusted.h,
      )}
    </dd>
    <dd>
      <span class="muted">
        (was {pct(oklchOriginal.l)}, {oklchOriginal.c.toFixed(3)}, {deg(
          oklchOriginal.h,
        )})
      </span>
    </dd>
    <dt title="x, y">Position</dt>
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
    height: 2rem;
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
  .wrap-row {
    grid-row: span 2;
    align-self: start;
  }
</style>
