/*
  Sigmoidal contrast curve (ImageMagick formulation), mirrored from the shader so the
  plot always shows exactly what the pipeline applies.
    f(u) = (s(a (u - m)) - s(-a m)) / (s(a (1 - m)) - s(-a m)),  s(x) = 1 / (1 + e^-x)
 a = amount (contrast), m = midpoint. Below OFF_BELOW the shader treats it as identity.
*/
export const AMOUNT_MAX = 20; // top of the plot's vertical (contrast) axis
export const MID_MIN = 0.05;
export const MID_MAX = 0.95;
export const OFF_BELOW = 0.01;

const sig = (x: number) => 1 / (1 + Math.exp(-x));

export function sigmoidCurve(u: number, a: number, m: number): number {
  if (a < OFF_BELOW) return u;
  const lo = sig(-a * m);
  const hi = sig(a * (1 - m));
  return (sig(a * (u - m)) - lo) / (hi - lo);
}
