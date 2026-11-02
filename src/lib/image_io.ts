import { decode as decodePng, encode as encodePng } from "fast-png";
import type { DeepImage } from "./pipeline";

const MAX_DIM = 4096; // longest side after loading
const PREVIEW_DIM = 512; // minimap thumbnail for 16-bit images

export interface Decoded {
  // 8-bit image: the pipeline source. 16-bit image: a small preview for the minimap.
  bitmap: ImageBitmap;
  // Present for 16-bit sources: what the pipeline should use instead of `bitmap`.
  deep?: DeepImage;
  width: number;
  height: number;
  info: string;
}

/*
  Decode an image file. 16-bit PNGs go through a float32 path (when the GPU supports it);
  everything else uses the browser decoder, which always delivers 8 bits per channel.
 */
export async function decodeImage(
  file: File,
  deepSupported: boolean,
): Promise<Decoded> {
  if ((await pngBitDepth(file)) === 16) {
    if (deepSupported) return decodeDeepPng(file);
    const shallow = await decodeShallow(file);
    return {
      ...shallow,
      info: "16-bit PNG shown as 8-bit (this GPU lacks float32-filterable)",
    };
  }
  return decodeShallow(file);
}

/** Bit depth from the PNG header, or null if the file isn't a PNG. */
async function pngBitDepth(file: File): Promise<number | null> {
  const head = new Uint8Array(await file.slice(0, 25).arrayBuffer());
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 25 || !sig.every((b, i) => head[i] === b)) return null;
  return head[24]; // IHDR: signature(8) + length(4) + type(4) + width(4) + height(4) -> depth
}

async function decodeShallow(file: File): Promise<Decoded> {
  const full = await createImageBitmap(file);
  const s = Math.min(1, MAX_DIM / Math.max(full.width, full.height));
  let bitmap = full;
  if (s < 1) {
    bitmap = await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * s),
      resizeHeight: Math.round(full.height * s),
      resizeQuality: "high",
    });
    full.close(); // free the full-size pixels
  }
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    info: "8-bit source · half-float pipeline",
  };
}

// sRGB-encoded 16-bit value -> linear light, via a 65536-entry table (fast and exact).
function srgbToLinearLut(): Float32Array {
  const lut = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const c = i / 65535;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
}

async function decodeDeepPng(file: File): Promise<Decoded> {
  const png = decodePng(new Uint8Array(await file.arrayBuffer()));
  const { width: sw, height: sh, channels, data } = png;
  const color = channels >= 3; // 1 = grey, 2 = grey + alpha (alpha is ignored)

  // Integer box downsample (averaged in linear light) if the image is too large for the GPU path.
  const factor = Math.max(1, Math.ceil(Math.max(sw, sh) / MAX_DIM));
  const w = Math.floor(sw / factor);
  const h = Math.floor(sh / factor);
  const lut = srgbToLinearLut();
  const out = new Float32Array(w * h * 4);
  const norm = 1 / (factor * factor);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * sw + (x * factor + dx)) * channels;
          r += lut[data[i]];
          g += lut[color ? data[i + 1] : data[i]];
          b += lut[color ? data[i + 2] : data[i]];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r * norm;
      out[o + 1] = g * norm;
      out[o + 2] = b * norm;
      out[o + 3] = 1;
    }
  }

  // 8-bit preview for the minimap (nearest sampling is fine at this size).
  const ps = Math.min(1, PREVIEW_DIM / Math.max(sw, sh));
  const pw = Math.max(1, Math.round(sw * ps));
  const ph = Math.max(1, Math.round(sh * ps));
  const px = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x + 0.5) / ps));
      const sy = Math.min(sh - 1, Math.floor((y + 0.5) / ps));
      const i = (sy * sw + sx) * channels;
      const o = (y * pw + x) * 4;
      px[o] = data[i] >> 8;
      px[o + 1] = (color ? data[i + 1] : data[i]) >> 8;
      px[o + 2] = (color ? data[i + 2] : data[i]) >> 8;
      px[o + 3] = 255;
    }
  }
  const bitmap = await createImageBitmap(new ImageData(px, pw, ph));

  return {
    bitmap,
    deep: { width: w, height: h, data: out, bitDepth: 16 },
    width: w,
    height: h,
    info: `16-bit PNG · float32 pipeline${factor > 1 ? ` · downsampled ${factor}×` : ""}`,
  };
}

// RGB floats (0..1) -> 16-bit PNG bytes.
export function encodePng16(
  width: number,
  height: number,
  rgb: Float32Array,
): Uint8Array {
  const data = new Uint16Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    data[i] = Math.round(Math.min(1, Math.max(0, rgb[i])) * 65535);
  }
  return encodePng({ width, height, data, depth: 16, channels: 3 });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
