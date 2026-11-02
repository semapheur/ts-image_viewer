import type { RGB } from "./color";

export interface StretchRange {
  black: RGB;
  white: RGB;
}

/*
  Value in 0..1 below which fraction `p` (0..1) of a channel's pixels fall,
  interpolated inside the bin. p = 0 gives the true minimum, p = 1 the true maximum.
*/
export function quantile(
  hist: Uint32Array,
  channel: number,
  bins: number,
  p: number,
): number {
  const off = channel * bins;
  let total = 0;
  for (let i = 0; i < bins; i++) total += hist[off + i];
  if (!total) return p < 0.5 ? 0 : 1;

  const target = total * Math.min(1, Math.max(0, p));
  let cum = 0;
  for (let i = 0; i < bins; i++) {
    const c = hist[off + i];
    if (!c) continue; // empty bins can't hold the quantile
    if (cum + c >= target) return (i + (target - cum) / c) / bins;
    cum += c;
  }
  return 1;
}

/*
  Per-band black/white points from the image extent.
  clipLoPct / clipHiPct are the percentages of pixels allowed to clip at each end
  (0 = use the absolute min/max).
  linked: use one common range (the widest of the three bands) so no band clips
  and the colour balance is preserved.
*/
export function autoStretch(
  hist: Uint32Array,
  clipLoPct: number,
  clipHiPct: number,
  linked: boolean,
): StretchRange {
  const bins = hist.length / 4;
  const black: RGB = [0, 0, 0];
  const white: RGB = [1, 1, 1];

  for (let c = 0; c < 3; c++) {
    black[c] = quantile(hist, c, bins, clipLoPct / 100);
    white[c] = quantile(hist, c, bins, 1 - clipHiPct / 100);
  }
  if (linked) {
    const b = Math.min(...black),
      w = Math.max(...white);
    black.fill(b);
    white.fill(w);
  }

  // Keep a minimum gap so a flat band can't divide by ~zero in the shader.
  const gap = 2 / bins;
  for (let c = 0; c < 3; c++) {
    if (white[c] - black[c] < gap) {
      black[c] = Math.max(0, white[c] - gap);
      white[c] = Math.min(1, black[c] + gap);
    }
  }
  return { black, white };
}

/** Absolute min/max per band (for display in the UI). */
export function extentOf(hist: Uint32Array): StretchRange {
  return autoStretch(hist, 0, 0, false);
}
