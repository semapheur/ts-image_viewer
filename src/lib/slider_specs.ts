import type { ParamValues } from "./contexts/params.svelte";

// Keys of ParamValues whose value is a number (the ones a slider can bind to)
export type NumericParam = {
  [K in keyof ParamValues]: ParamValues[K] extends number ? K : never;
}[keyof ParamValues];

export interface SliderSpec {
  key: NumericParam;
  label: string;
  min: number;
  max: number;
  step?: number;
  neutral: number; // value restored by double-click
}

export const TONE: SliderSpec[] = [
  { key: "exposure", label: "Exposure (EV)", min: -4, max: 4, neutral: 0 },
  { key: "brightness", label: "Brightness", min: -0.5, max: 0.5, neutral: 0 },
  { key: "contrast", label: "Contrast", min: 0, max: 2, neutral: 1 },
  { key: "saturation", label: "Saturation", min: 0, max: 2, neutral: 1 },
  { key: "gamma", label: "Gamma", min: 0.2, max: 3, neutral: 1 },
];

export const DETAIL: SliderSpec[] = [
  { key: "sharpen", label: "Sharpen", min: 0, max: 3, neutral: 0 },
  { key: "denoise", label: "Denoise", min: 0, max: 1, neutral: 0 },
];

export const HIST_RANGE: SliderSpec[] = [
  { key: "histLo", label: "Range low", min: 0, max: 0.98, neutral: 0 },
  { key: "histHi", label: "Range high", min: 0.02, max: 1, neutral: 1 },
];

export const BIT_DEPTH: SliderSpec[] = [
  {
    key: "bitDepth",
    label: "Bits / channel",
    min: 1,
    max: 16,
    step: 1,
    neutral: 16,
  },
  { key: "dither", label: "Dither", min: 0, max: 1, neutral: 0 },
];

export const CLIP: SliderSpec[] = [
  {
    key: "clipLo",
    label: "Clip low %",
    min: 0,
    max: 5,
    step: 0.05,
    neutral: 0.1,
  },
  {
    key: "clipHi",
    label: "Clip high %",
    min: 0,
    max: 5,
    step: 0.05,
    neutral: 0.1,
  },
];

export const MIDTONE: SliderSpec[] = [
  { key: "midtone", label: "Midtone", min: 0.01, max: 0.99, neutral: 0.5 },
];

export const STRENGTH: SliderSpec[] = [
  {
    key: "curveStrength",
    label: "Strength",
    min: 0.1,
    max: 50,
    step: 0.1,
    neutral: 5,
  },
];

// Per-band black/white sliders, used when bands are not linked.
export const BAND_SPECS: SliderSpec[] = (["R", "G", "B"] as const).flatMap(
  (n) => [
    {
      key: `black${n}` as const,
      label: `Black ${n}`,
      min: 0,
      max: 0.98,
      neutral: 0,
    },
    {
      key: `white${n}` as const,
      label: `White ${n}`,
      min: 0.02,
      max: 1,
      neutral: 1,
    },
  ],
);

export const CURVES = [
  { value: 0, label: "Linear" },
  { value: 1, label: "Midtone (MTF)" },
  { value: 2, label: "Logarithmic" },
  { value: 3, label: "Asinh" },
  { value: 4, label: "Square root" },
];
