export const INTERPOLATIONS = [
  {
    id: "nearest",
    label: "Nearest",
    hint: "Hard pixel edges; best for inspecting individual pixels",
  },
  { id: "bilinear", label: "Bilinear", hint: "Smooth and fast; slightly soft" },
  {
    id: "catmull-rom",
    label: "Bicubic (Catmull-Rom)",
    hint: "Sharper than bilinear; mild ringing",
  },
  {
    id: "mitchell",
    label: "Bicubic (Mitchell)",
    hint: "Balanced sharpness and ringing",
  },
  {
    id: "lanczos3",
    label: "Lanczos 3",
    hint: "Sharpest; can ring around hard edges",
  },
] as const;

export type Interpolation = (typeof INTERPOLATIONS)[number]["id"];
