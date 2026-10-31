/** Convolution filter chain: data model, presets and helpers. No Svelte or GPU code. */

export type ConvSpace = "display" | "linear";

export const KERNEL_SIZES = [3, 5, 7] as const;
export const MAX_FILTERS = 8; // each filter is a full-resolution GPU pass

export interface ConvFilter {
  id: number;
  name: string; // preset label, or "Custom" once edited
  size: number; // kernel is size x size, row-major
  kernel: number[];
  normalize: boolean; // divide by the kernel sum (when it is not ~0)
  bias: number; // added to the result
  amount: number; // 0..1 blend between the input and the filtered result
  abs: boolean; // absolute value of the result (for edge detectors)
  enabled: boolean;
}

export type PresetGroup = "Blur" | "Sharpen" | "Edges" | "Other";

export interface ConvPreset {
  id: string;
  label: string;
  group: PresetGroup;
  size: number;
  kernel: number[];
  normalize: boolean;
  bias?: number;
  abs?: boolean;
}

const ones = (n: number) => Array<number>(n * n).fill(1);

export const PRESET_GROUPS: PresetGroup[] = [
  "Blur",
  "Sharpen",
  "Edges",
  "Other",
];

export const PRESETS: ConvPreset[] = [
  // Blur
  {
    id: "box3",
    label: "Box blur 3×3",
    group: "Blur",
    size: 3,
    kernel: ones(3),
    normalize: true,
  },
  {
    id: "box5",
    label: "Box blur 5×5",
    group: "Blur",
    size: 5,
    kernel: ones(5),
    normalize: true,
  },
  {
    id: "box7",
    label: "Box blur 7×7",
    group: "Blur",
    size: 7,
    kernel: ones(7),
    normalize: true,
  },
  {
    id: "gauss3",
    label: "Gaussian blur 3×3",
    group: "Blur",
    size: 3,
    normalize: true,
    kernel: [1, 2, 1, 2, 4, 2, 1, 2, 1],
  },
  {
    id: "gauss5",
    label: "Gaussian blur 5×5",
    group: "Blur",
    size: 5,
    normalize: true,
    kernel: [
      1, 4, 6, 4, 1, 4, 16, 24, 16, 4, 6, 24, 36, 24, 6, 4, 16, 24, 16, 4, 1, 4,
      6, 4, 1,
    ],
  },
  {
    id: "motion5",
    label: "Motion blur (horizontal) 5×5",
    group: "Blur",
    size: 5,
    normalize: true,
    kernel: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  },

  // Sharpen
  {
    id: "sharpen",
    label: "Sharpen",
    group: "Sharpen",
    size: 3,
    normalize: false,
    kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  },
  {
    id: "sharpen-strong",
    label: "Sharpen (strong)",
    group: "Sharpen",
    size: 3,
    normalize: false,
    kernel: [-1, -1, -1, -1, 9, -1, -1, -1, -1],
  },
  {
    id: "unsharp5",
    label: "Unsharp mask 5×5",
    group: "Sharpen",
    size: 5,
    normalize: false,
    kernel: [
      1, 4, 6, 4, 1, 4, 16, 24, 16, 4, 6, 24, -476, 24, 6, 4, 16, 24, 16, 4, 1,
      4, 6, 4, 1,
    ].map((v) => -v / 256),
  },

  // Edges
  {
    id: "laplacian4",
    label: "Laplacian (4-neighbour)",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  },
  {
    id: "laplacian8",
    label: "Laplacian (8-neighbour)",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [1, 1, 1, 1, -8, 1, 1, 1, 1],
  },
  {
    id: "sobel-x",
    label: "Sobel X",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  },
  {
    id: "sobel-y",
    label: "Sobel Y",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
  },
  {
    id: "prewitt-x",
    label: "Prewitt X",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
  },
  {
    id: "prewitt-y",
    label: "Prewitt Y",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
  },
  {
    id: "outline",
    label: "Outline",
    group: "Edges",
    size: 3,
    normalize: false,
    abs: true,
    kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  },

  // Other
  {
    id: "identity",
    label: "Identity",
    group: "Other",
    size: 3,
    normalize: false,
    kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  {
    id: "emboss",
    label: "Emboss",
    group: "Other",
    size: 3,
    normalize: false,
    kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  },
  {
    id: "highpass",
    label: "High-pass (mid-grey)",
    group: "Other",
    size: 3,
    normalize: false,
    bias: 0.5,
    kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/** Divisor applied to the kernel: its sum when normalising (unless the sum is ~0), else 1. */
export function kernelDivisor(kernel: number[], normalize: boolean): number {
  const sum = kernel.reduce((a, b) => a + (Number(b) || 0), 0);
  return normalize && Math.abs(sum) > 1e-6 ? sum : 1;
}

/** Re-centre a kernel in a new odd size: grows with zeros, shrinks by cropping the outer ring. */
export function resizeKernel(
  kernel: number[],
  oldN: number,
  newN: number,
): number[] {
  const out = Array<number>(newN * newN).fill(0);
  const off = (newN - oldN) / 2; // an integer: both sizes are odd
  for (let y = 0; y < newN; y++) {
    for (let x = 0; x < newN; x++) {
      const ox = x - off;
      const oy = y - off;
      if (ox >= 0 && ox < oldN && oy >= 0 && oy < oldN)
        out[y * newN + x] = kernel[oy * oldN + ox];
    }
  }
  return out;
}

// ───────────── what the GPU pipeline consumes ─────────────

export interface ConvStep {
  size: number;
  weights: number[]; // kernel already divided by its divisor
  bias: number;
  amount: number;
  abs: boolean;
  /** Display-referred chains encode the input in the first pass and decode the output in the last. */
  encodeIn: boolean;
  decodeOut: boolean;
}

export interface ConvSnapshot {
  /** Describes the chain's shape. While it is unchanged, only uniform values need updating. */
  key: string;
  steps: ConvStep[];
}

export function buildSnapshot(
  filters: ConvFilter[],
  space: ConvSpace,
): ConvSnapshot {
  const active = filters.filter((f) => f.enabled);
  const steps = active.map((f, i): ConvStep => {
    const div = kernelDivisor(f.kernel, f.normalize);
    return {
      size: f.size,
      weights: f.kernel.map((v) => (Number(v) || 0) / div),
      bias: Number(f.bias) || 0,
      amount: Math.min(1, Math.max(0, Number(f.amount) || 0)),
      abs: f.abs,
      encodeIn: space === "display" && i === 0,
      decodeOut: space === "display" && i === active.length - 1,
    };
  });
  const key = steps
    .map(
      (s) =>
        `${s.size}${s.abs ? "a" : ""}${s.encodeIn ? "e" : ""}${s.decodeOut ? "d" : ""}`,
    )
    .join(",");
  return { key, steps };
}
