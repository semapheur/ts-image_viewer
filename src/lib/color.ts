export type RGB = [number, number, number];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface Hsl {
  h: number | null; // degrees; null for greys, where hue is undefined
  s: number; // 0..1
  l: number; // 0..1
}

export interface Oklch {
  l: number; // 0..1
  c: number; // roughly 0..0.4 for sRGB
  h: number | null; // degrees; null when chroma is ~0
}

/** sRGB-encoded values (0..1) -> HSL. */
export function srgbToHsl(rgb: RGB): Hsl {
  const [r, g, b] = rgb.map(clamp01);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d < 1e-9) return { h: null, s: 0, l };

  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** sRGB-encoded values (0..1) -> OKLab [L, a, b] (Björn Ottosson's matrices). */
export function srgbToOklab(rgb: RGB): [number, number, number] {
  const [r, g, b] = rgb.map((v) => toLinear(clamp01(v)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** sRGB-encoded values (0..1) -> OKLCH (the polar form of OKLab). */
export function srgbToOklch(rgb: RGB): Oklch {
  const [l, a, b] = srgbToOklab(rgb);
  const c = Math.hypot(a, b);
  if (c < 4e-4) return { l, c, h: null }; // too little chroma for a meaningful hue
  return { l, c, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
