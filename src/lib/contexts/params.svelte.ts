import { createContext } from "svelte";
import { autoStretch } from "../band_stretch";

export const DEFAULTS = {
  // tonal
  exposure: 0, // EV stops
  brightness: 0, // additive, display space
  contrast: 1, // multiplier around 0.5
  saturation: 1,
  gamma: 1,
  sigmoidAmount: 0, // 0 = off, ~3-15 typical (ImageMagick -sigmoidal-contrast)
  sigmoidMid: 0.5,
  // spatial
  sharpen: 0, // unsharp-mask amount
  denoise: 0, // bilateral filter strength
  // histogram window (value range mapped onto the 256 bins)
  histLo: 0,
  histHi: 1,
  // band stretch
  blackR: 0,
  blackG: 0,
  blackB: 0,
  whiteR: 1,
  whiteG: 1,
  whiteB: 1,
  stretchMode: 0, // 0 linear, 1 midtone (MTF), 2 log, 3 asinh, 4 sqrt
  curveStrength: 5, // log / asinh
  midtone: 0.5, // MTF: input level mapped to mid-grey (lower = brighter)
  // auto stretch (CPU-side only, never sent to the GPU)
  auto: false,
  autoVisible: true,
  linked: true,
  clipLo: 0.1, // % of pixels allowed to clip, shadows
  clipHi: 0.1, // % of pixels allowed to clip, highlights
};

export type ParamValues = typeof DEFAULTS;

export class Params {
  values = $state<ParamValues>({ ...DEFAULTS });
  reset = () => Object.assign(this.values, DEFAULTS);

  snapshot(): ParamValues {
    return $state.snapshot(this.values);
  }

  applyAuto(extent: Uint32Array) {
    const v = this.values;
    const { black, white } = autoStretch(extent, v.clipLo, v.clipHi, v.linked);
    [v.blackR, v.blackG, v.blackB] = black;
    [v.whiteR, v.whiteG, v.whiteB] = white;
  }

  // Linked mode: write one value to all three bands.
  setBoth(edge: "black" | "white", x: number) {
    const v = this.values;
    if (edge === "black") v.blackR = v.blackG = v.blackB = x;
    else v.whiteR = v.whiteG = v.whiteB = x;
  }

  linkBands() {
    const v = this.values;
    v.blackG = v.blackB = v.blackR;
    v.whiteG = v.whiteB = v.whiteR;
  }
}

export const [getParams, setParams] = createContext<Params>();
