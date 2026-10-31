/*
  GPU pipeline (Three.js WebGPURenderer + TSL)

  source ─► A: bilateral denoise ─► RT_A (linear, half-float)
  RT_A   ─► B: sharpen ─► sRGB encode ─► band stretch ─► exposure ─► tone chain ─► RT_B
  RT_B   ─► C: zoom/pan display quad ─► canvas
  RT_B   ─► D: compute: atomicAdd histogram ─► storage buffer ─► CPU
  source ─► E: compute: fine "extent" histogram (once per image, drives auto stretch)
  RT_B/source ─► F: compute: single-pixel picker
 */
import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uint,
  uvec2,
  uniform,
  texture,
  instancedArray,
  instanceIndex,
  atomicAdd,
  atomicStore,
  exp,
  log,
  sqrt,
  pow,
  max,
  min,
  mix,
  dot,
  step,
  clamp,
  sin,
} from "three/tsl";
import type { ParamValues } from "./contexts/params.svelte";
import type { Interpolation } from "./interpolation";
import type { RGB } from "./types";

/**
 * A high-bit-depth source: linear-light RGBA floats in 0..1, row 0 = top.
 * Float32 keeps every 16-bit level exact (half-float would not).
 */
export interface DeepImage {
  width: number;
  height: number;
  data: Float32Array; // RGBA, linear light
  bitDepth: number;
}
const isDeep = (s: ImageBitmap | DeepImage): s is DeepImage => "data" in s;

// Rectangle in image pixels (y down): x0,y0 inclusive, x1,y1 exclusive.
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const EBINS = 4096;
export const BINS = 256;
export const CHANNELS = 4; // R, G, B, luma

const LUMA = [0.2126, 0.7152, 0.0722];

export class Pipeline {
  renderer!: THREE.WebGPURenderer;

  // One uniform per parameter, updated without rebuilding shaders.
  #u = {
    exposure: uniform(0),
    brightness: uniform(0),
    contrast: uniform(1),
    saturation: uniform(1),
    gamma: uniform(1),
    sigmoidAmount: uniform(0),
    sigmoidMid: uniform(0.5),
    sharpen: uniform(0),
    denoise: uniform(0),
    histLo: uniform(0),
    histHi: uniform(1),
    blackR: uniform(0),
    blackG: uniform(0),
    blackB: uniform(0),
    whiteR: uniform(1),
    whiteG: uniform(1),
    whiteB: uniform(1),
    stretchMode: uniform(0),
    curveStrength: uniform(5),
    midtone: uniform(0.5),
    bitDepth: uniform(16),
    dither: uniform(0),
  };

  // View (zoom/pan) uniforms
  #v = {
    zoom: uniform(1),
    cx: uniform(0),
    cy: uniform(0),
    vw: uniform(1),
    vh: uniform(1),
  };

  #src?: THREE.Texture;
  #rtA?: THREE.RenderTarget;
  #rtB?: THREE.RenderTarget;
  #quads: THREE.QuadMesh[] = [];
  #interpolation: Interpolation = "bilinear";
  #displayQuads = new Map<Interpolation, THREE.QuadMesh>();
  #makeDisplay?: (mode: Interpolation) => THREE.QuadMesh;

  #histNode?: any;
  #clearPass?: any;
  #accumPass?: any;

  #pick = { x: uniform(0), y: uniform(0) };
  #pickPass?: any;
  #pickOut?: any;

  #extentNode?: any;
  #extentClear?: any;
  #extentAccum?: any;
  // Region the extent histogram is restricted to (image pixels).
  #region = {
    x0: uniform(0, "uint"),
    y0: uniform(0, "uint"),
    w: uniform(1, "uint"),
    count: uniform(1, "uint"),
  };
  #imgW = 0;
  #imgH = 0;
  #deepPath = false;
  hasFloat32 = false;

  async init(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
    await this.renderer.init();
    const device = this.renderer.backend?.device;
    this.hasFloat32 = !!device?.features?.has("float32-filterable");
    // RT_B already holds sRGB-encoded values, so don't encode again on output.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  resize(cssW: number, cssH: number) {
    this.renderer.setSize(cssW, cssH, false);
    this.#v.vw.value = cssW;
    this.#v.vh.value = cssH;
  }

  setParams(p: ParamValues) {
    for (const k in this.#u) (this.#u as any)[k].value = (p as any)[k];
  }

  setView(cx: number, cy: number, zoom: number) {
    this.#v.cx.value = cx;
    this.#v.cy.value = cy;
    this.#v.zoom.value = zoom;
  }

  setInterpolation(mode: Interpolation) {
    this.#interpolation = mode;
  }

  #displayQuad(): THREE.QuadMesh | undefined {
    let q = this.#displayQuads.get(this.#interpolation);
    if (!q && this.#makeDisplay) {
      q = this.#makeDisplay(this.#interpolation);
      this.#displayQuads.set(this.#interpolation, q);
    }
    return q;
  }

  // Cheap redraw for pan/zoom: display pass only.
  drawView() {
    const q = this.#displayQuad();
    if (!q) return;
    this.renderer.setRenderTarget(null);
    q.render(this.renderer);
  }

  // (Re)build all GPU resources for a new image.
  setImage(source: ImageBitmap | DeepImage) {
    this.#disposeImage();
    const deep = isDeep(source);
    if (deep && !this.hasFloat32) {
      throw new Error(
        'The 16-bit path needs the WebGPU "float32-filterable" feature.',
      );
    }
    this.#deepPath = deep;
    const w = source.width;
    const h = source.height;
    this.#imgW = w;
    this.#imgH = h;
    const u = this.#u;

    let src: THREE.Texture;
    if (isDeep(source)) {
      // Already linear light, so no colour-space conversion is wanted. Same memory layout as an uploaded bitmap (row 0 = top), so pass A's flip still applies.

      src = new THREE.DataTexture(
        source.data,
        w,
        h,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      src.colorSpace = THREE.NoColorSpace;
    } else {
      src = new THREE.Texture(source as any);
      src.colorSpace = THREE.SRGBColorSpace; // sampled values are decoded to linear
    }
    src.minFilter = src.magFilter = THREE.LinearFilter;
    src.generateMipmaps = false;
    src.needsUpdate = true;
    this.#src = src;

    const rtType = deep ? THREE.FloatType : THREE.HalfFloatType;
    const quantizeBelow = deep ? 16.5 : 15.5;

    const makeRT = () =>
      new THREE.RenderTarget(w, h, {
        type: rtType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    const rtA = (this.#rtA = makeRT());
    const rtB = (this.#rtB = makeRT());
    const texel = vec2(1 / w, 1 / h);

    // colour helpers
    const srgbEncode = (x: any) => {
      const xc = max(x, 0);
      const hi = pow(max(xc, 0.0031308), 1 / 2.4)
        .mul(1.055)
        .sub(0.055);
      return mix(hi, xc.mul(12.92), step(xc, float(0.0031308)));
    };
    const srgbDecode = (x: any) => {
      const xc = max(x, 0);
      const hi = pow(xc.add(0.055).div(1.055), 2.4);
      return mix(hi, xc.div(12.92), step(xc, float(0.04045)));
    };
    const sigmoid = (x: any) => float(1).div(float(1).add(exp(x.negate())));

    // Pass A: bilateral denoise (5x5, unrolled)
    const denoise = Fn(() => {
      // vertical flip applied once, here, when reading the source
      const c = vec2(uv().x, float(1).sub(uv().y));
      const center = texture(src, c).rgb.toVar();
      const sigma = u.denoise.mul(0.25).add(0.03);
      const twoSigma2 = sigma.mul(sigma).mul(2);
      let acc: any = vec3(0),
        wsum: any = float(0);
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const s = texture(src, c.add(vec2(i, j).mul(texel))).rgb;
          const d = s.sub(center);
          const wRange = exp(dot(d, d).div(twoSigma2).negate());
          const wSpace = Math.exp(-(i * i + j * j) / (2 * 1.5 * 1.5));
          const wgt = wRange.mul(wSpace);
          acc = acc.add(s.mul(wgt));
          wsum = wsum.add(wgt);
        }
      }
      return vec4(mix(center, acc.div(wsum), u.denoise), 1);
    });

    // Pass B: sharpen, stretch, tone chain
    const tonal = Fn(() => {
      const c = uv();
      const tap = (dx: number, dy: number) =>
        texture(rtA.texture, c.add(vec2(dx, dy).mul(texel))).rgb;

      // unsharp mask in linear light (3x3 gaussian)
      const kern = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1],
      ];
      let blur: any = vec3(0);
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++)
          blur = blur.add(tap(i - 1, j - 1).mul(kern[j][i] / 16));
      const center = tap(0, 0);
      const sharpened: any = center.add(center.sub(blur).mul(u.sharpen));

      // go display-referred
      let v: any = srgbEncode(sharpened);

      // per-band stretch (before exposure, so auto ranges from the source stay valid)
      const black = vec3(u.blackR, u.blackG, u.blackB);
      const white = vec3(u.whiteR, u.whiteG, u.whiteB);
      const t = clamp(v.sub(black).div(max(white.sub(black), 0.001)), 0, 1);

      const strength = max(u.curveStrength, 0.01);
      const mid = u.midtone;
      // midtone transfer function: maps input level `mid` to 0.5 (0.5 = identity)
      const mtf = mid.sub(1).mul(t).div(mid.mul(2).sub(1).mul(t).sub(mid));
      const logC = log(float(1).add(strength.mul(t))).div(
        log(float(1).add(strength)),
      );
      const asinhOf = (x: any) => log(x.add(sqrt(x.mul(x).add(1))));
      const asinhC = asinhOf(strength.mul(t)).div(asinhOf(strength));

      // pick the curve with 0/1 masks (every branch stays finite for t in [0,1])
      const isMode = (i: number) =>
        step(float(i - 0.5), u.stretchMode).mul(
          step(u.stretchMode, float(i + 0.5)),
        );
      v = t
        .mul(isMode(0))
        .add(mtf.mul(isMode(1)))
        .add(logC.mul(isMode(2)))
        .add(asinhC.mul(isMode(3)))
        .add(sqrt(t).mul(isMode(4)));

      // exposure in linear light (decode -> scale -> encode)
      v = srgbEncode(srgbDecode(v).mul(pow(float(2), u.exposure)));

      // brightness / contrast
      v = v.add(u.brightness);
      v = v.sub(0.5).mul(u.contrast).add(0.5);
      // saturation (Rec.709 luma)
      const lum = dot(v, vec3(LUMA[0], LUMA[1], LUMA[2]));
      v = mix(vec3(lum), v, u.saturation);
      // gamma
      v = pow(max(v, 0), float(1).div(max(u.gamma, 0.01)));
      // sigmoidal contrast (ImageMagick formulation); identity when amount ~ 0
      const amount = max(u.sigmoidAmount, 0.01);
      const sMid = u.sigmoidMid;
      const sLo = sigmoid(amount.mul(sMid).negate());
      const sHi = sigmoid(amount.mul(float(1).sub(sMid)));
      const sig = sigmoid(amount.mul(v.sub(sMid)))
        .sub(sLo)
        .div(sHi.sub(sLo));
      v = mix(v, sig, step(0.01, u.sigmoidAmount));

      // bit depth: quantise each band to 2^bit levels (display deferred values)
      v = clamp(v, 0, 1);
      const levels = pow(float(2), u.bitDepth).sub(1);
      // Interleaved-gradient noise anchored to image pixels, so it is stable under zoom/pan.
      const px = uv().mul(vec2(w, h)).floor();
      const noise = dot(px, vec2(0.06711056, 0.00583715))
        .fract()
        .mul(52.9829189)
        .fract();
      const jitter = noise.sub(0.5).mul(u.dither); // same offset for all bands: no colour noise
      const quantised = clamp(
        v.mul(levels).add(0.5).add(jitter).floor().div(levels),
        0,
        1,
      );
      v = mix(v, quantised, step(u.bitDepth, float(quantizeBelow)));

      return vec4(v, 1);
    });

    // Pass C: zoom/pan display
    const BG = vec3(34 / 255, 37 / 255, 42 / 255); // matches --well

    // Colour of image texel (px, py), read at its exact centre so the sampler can't blend it.
    const texelAt = (px: any, py: any) =>
      texture(rtB.texture, vec2(px.add(0.5).div(w), py.add(0.5).div(h))).rgb;

    // Mitchell-Netravali family (B, C): (0, 0.5) = Catmull-Rom, (1/3, 1/3) = Mitchell.
    const bcKernel = (B: number, C: number) => (x: any) => {
      const ax = x.abs();
      const ax2 = ax.mul(ax);
      const ax3 = ax2.mul(ax);
      const near = ax3
        .mul((12 - 9 * B - 6 * C) / 6)
        .add(ax2.mul((-18 + 12 * B + 6 * C) / 6))
        .add((6 - 2 * B) / 6);
      const far = ax3
        .mul((-B - 6 * C) / 6)
        .add(ax2.mul((6 * B + 30 * C) / 6))
        .add(ax.mul((-12 * B - 48 * C) / 6))
        .add((8 * B + 24 * C) / 6);
      // |x| <= 1 -> near, 1 < |x| <= 2 -> far, beyond -> 0
      return mix(far.mul(step(ax, float(2))), near, step(ax, float(1)));
    };

    const lanczos3 = (x: any) => {
      const ax = x.abs();
      const px = ax.mul(Math.PI);
      const safe = max(px, 1e-5);
      // sinc(x) * sinc(x / 3), with the x -> 0 limit of 1
      const val = sin(px)
        .mul(sin(px.div(3)))
        .mul(3)
        .div(safe.mul(safe));
      return mix(val, float(1), step(ax, float(1e-4))).mul(step(ax, float(3)));
    };

    // Separable kernel resampling over offsets x offsets taps, weights normalised per axis.
    const separable = (
      ix: any,
      iy: any,
      offsets: number[],
      kernel: (x: any) => any,
    ) => {
      const pos = vec2(ix.sub(0.5), iy.sub(0.5));
      const base = pos.floor();
      const f = pos.sub(base);
      const norm = (t: any) => {
        const raw = offsets.map((k) => kernel(t.sub(k)));
        const sum = raw.reduce((a, b) => a.add(b));
        return raw.map((wgt) => wgt.div(sum));
      };
      const wx = norm(f.x);
      const wy = norm(f.y);
      let acc: any = vec3(0);
      offsets.forEach((oy, j) => {
        offsets.forEach((ox, i) => {
          acc = acc.add(
            texelAt(base.x.add(ox), base.y.add(oy)).mul(wx[i].mul(wy[j])),
          );
        });
      });
      return clamp(acc, 0, 1); // kernels with negative lobes can overshoot
    };

    const CUBIC = [-1, 0, 1, 2];
    const LANCZOS = [-2, -1, 0, 1, 2, 3];
    const resample = (mode: Interpolation, ix: any, iy: any) => {
      switch (mode) {
        case "nearest":
          return texelAt(ix.floor(), iy.floor());
        case "catmull-rom":
          return separable(ix, iy, CUBIC, bcKernel(0, 0.5));
        case "mitchell":
          return separable(ix, iy, CUBIC, bcKernel(1 / 3, 1 / 3));
        case "lanczos3":
          return separable(ix, iy, LANCZOS, lanczos3);
        default:
          return texture(rtB.texture, vec2(ix.div(w), iy.div(h))).rgb; // bilinear (hardware)
      }
    };

    const buildDisplay = (mode: Interpolation) =>
      Fn(() => {
        const view = this.#v;
        // screen position in CSS px, y down
        const sx = uv().x.mul(view.vw);
        const sy = uv().y.mul(view.vh);
        // image position in pixels, y down
        const ix = view.cx.add(sx.sub(view.vw.mul(0.5)).div(view.zoom));
        const iy = view.cy.add(sy.sub(view.vh.mul(0.5)).div(view.zoom));
        const col = resample(mode, ix, iy);
        const inside = step(float(0), ix)
          .mul(step(ix, float(w)))
          .mul(step(float(0), iy))
          .mul(step(iy, float(h)));
        return vec4(mix(BG, col, inside), 1);
      });

    this.#makeDisplay = (mode) => {
      const mat = new THREE.NodeMaterial();
      mat.fragmentNode = buildDisplay(mode)();
      return new THREE.QuadMesh(mat);
    };

    const matA = new THREE.NodeMaterial();
    matA.fragmentNode = denoise();
    const matB = new THREE.NodeMaterial();
    matB.fragmentNode = tonal();
    const matC = new THREE.NodeMaterial();
    this.#quads = [matA, matB, matC].map((m) => new THREE.QuadMesh(m));

    // Pass D: display histogram
    const total = w * h;
    const histNode = instancedArray(BINS * CHANNELS, "uint");
    const hist = histNode.toAtomic();
    this.#histNode = histNode;

    this.#clearPass = Fn(() => {
      atomicStore(hist.element(instanceIndex), uint(0));
    })().compute(BINS * CHANNELS);

    const pixels = texture(rtB.texture);
    this.#accumPass = Fn(() => {
      If(instanceIndex.lessThan(uint(total)), () => {
        const x = instanceIndex.mod(uint(w));
        const y = instanceIndex.div(uint(w));
        const c = pixels.load(uvec2(x, y)).rgb;
        const luma = dot(c, vec3(LUMA[0], LUMA[1], LUMA[2]));
        const range = u.histHi.sub(u.histLo);

        const bump = (value: any, ch: number) => {
          const t = value.sub(u.histLo).div(range);
          If(t.greaterThanEqual(0).and(t.lessThanEqual(1)), () => {
            const bin = min(t.mul(BINS).floor().toUint(), uint(BINS - 1));
            atomicAdd(hist.element(bin.add(uint(ch * BINS))), uint(1));
          });
        };
        bump(c.r, 0);
        bump(c.g, 1);
        bump(c.b, 2);
        bump(luma, 3);
      });
    })().compute(total);

    // Pass E: extent histogram of the source (once per image)
    const extNode = instancedArray(EBINS * CHANNELS, "uint");
    const ext = extNode.toAtomic();
    this.#extentNode = extNode;

    this.#extentClear = Fn(() => {
      atomicStore(ext.element(instanceIndex), uint(0));
    })().compute(EBINS * CHANNELS);

    // Only pixels inside `region` are counted. Threads beyond region.count exit at once.
    const region = this.#region;
    this.#extentAccum = Fn(() => {
      If(instanceIndex.lessThan(region.count), () => {
        const x = region.x0.add(instanceIndex.mod(region.w)).toFloat();
        const y = region.y0.add(instanceIndex.div(region.w)).toFloat();
        const p = vec2(x.add(0.5).div(w), y.add(0.5).div(h));
        // (x, y) is in the display convention (y down), so undo pass A's vertical flip when reading the source, exactly like the pixel picker does.
        const c = clamp(
          srgbEncode(texture(src, vec2(p.x, float(1).sub(p.y))).level(0).rgb),
          0,
          1,
        );
        const luma = dot(c, vec3(LUMA[0], LUMA[1], LUMA[2]));
        const bump = (val: any, ch: number) => {
          const bin = min(val.mul(EBINS).floor().toUint(), uint(EBINS - 1));
          atomicAdd(ext.element(bin.add(uint(ch * EBINS))), uint(1));
        };
        bump(c.r, 0);
        bump(c.g, 1);
        bump(c.b, 2);
        bump(luma, 3);
      });
    })().compute(total);

    // Pass F: pixel picker
    const pickOut = instancedArray(8, "float"); // [adj r,g,b,_, orig r,g,b,_]
    this.#pickOut = pickOut;
    this.#pickPass = Fn(() => {
      If(instanceIndex.equal(uint(0)), () => {
        // pixel centre in the same (u, v) convention the display pass samples with
        const p = vec2(
          this.#pick.x.add(0.5).div(w),
          this.#pick.y.add(0.5).div(h),
        );
        const adj = texture(rtB.texture, p).level(0).rgb;
        // original: undo the vertical flip pass A applies when reading the source
        const orig = srgbEncode(
          texture(src, vec2(p.x, float(1).sub(p.y))).level(0).rgb,
        );
        pickOut.element(0).assign(adj.r);
        pickOut.element(1).assign(adj.g);
        pickOut.element(2).assign(adj.b);
        pickOut.element(4).assign(orig.r);
        pickOut.element(5).assign(orig.g);
        pickOut.element(6).assign(orig.b);
      });
    })().compute(1);
  }

  /*
    Fine histogram of the source image: 4 * EBINS counts (R, G, B, luma).
    Pass a region (image pixels) to restrict it, e.g. to the visible area; default is the whole image.
  */
  async computeExtent(r?: Region): Promise<Uint32Array> {
    const extentNode = this.#extentNode;
    const w = this.#imgW,
      h = this.#imgH;
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(r?.x0 ?? 0)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(r?.y0 ?? 0)));
    const x1 = Math.max(x0 + 1, Math.min(w, Math.ceil(r?.x1 ?? w)));
    const y1 = Math.max(y0 + 1, Math.min(h, Math.ceil(r?.y1 ?? h)));
    this.#region.x0.value = x0;
    this.#region.y0.value = y0;
    this.#region.w.value = x1 - x0;
    this.#region.count.value = (x1 - x0) * (y1 - y0);
    await this.renderer.computeAsync([this.#extentClear, this.#extentAccum]);
    const buf = await this.renderer.getArrayBufferAsync(extentNode.value);
    return new Uint32Array(buf.slice(0));
  }

  async pickPixel(
    x: number,
    y: number,
  ): Promise<{ adjusted: RGB; original: RGB }> {
    const pickOut = this.#pickOut;
    this.#pick.x.value = x;
    this.#pick.y.value = y;
    await this.renderer.computeAsync(this.#pickPass);
    const f = new Float32Array(
      await this.renderer.getArrayBufferAsync(pickOut.value),
    );
    return { adjusted: [f[0], f[1], f[2]], original: [f[4], f[5], f[6]] };
  }

  // Run all passes, then read the histogram back. Returns 4*256 counts: R,G,B,luma.
  async render(): Promise<Uint32Array> {
    if (!this.#rtA || !this.#rtB) return new Uint32Array(BINS * CHANNELS);
    const r = this.renderer;
    const histNode = this.#histNode; // captured: setImage() may swap it while we await
    r.setRenderTarget(this.#rtA);
    this.#quads[0].render(r);
    r.setRenderTarget(this.#rtB);
    this.#quads[1].render(r);
    r.setRenderTarget(null);
    this.#displayQuad()!.render(r);
    await r.computeAsync([this.#clearPass, this.#accumPass]);
    const buffer = await r.getArrayBufferAsync(histNode.value);
    return new Uint32Array(buffer.slice(0));
  }

  get isDeepPath() {
    return this.#deepPath;
  }

  /** The processed image as RGB floats in 0..1, top row first (for export). */
  async readOutput(): Promise<{
    width: number;
    height: number;
    data: Float32Array;
  }> {
    if (!this.#rtB) throw new Error("No image loaded");
    const w = this.#imgW,
      h = this.#imgH;
    const raw: any = await this.renderer.readRenderTargetPixelsAsync(
      this.#rtB,
      0,
      0,
      w,
      h,
    );
    const half = !this.#deepPath; // half-float targets come back as raw 16-bit half values
    const out = new Float32Array(w * h * 3);
    for (let i = 0, n = w * h; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const v = raw[i * 4 + c];
        out[i * 3 + c] = half ? THREE.DataUtils.fromHalfFloat(v) : v;
      }
    }
    return { width: w, height: h, data: out };
  }

  #disposeImage() {
    this.#src?.dispose();
    this.#rtA?.dispose();
    this.#rtB?.dispose();
    this.#quads.forEach((q) =>
      (q.material as THREE.Material | null)?.dispose(),
    );
    this.#quads = [];
    this.#displayQuads.forEach((q) =>
      (q.material as THREE.Material | null)?.dispose(),
    );
    this.#displayQuads.clear();
    this.#makeDisplay = undefined;
  }

  dispose() {
    this.#disposeImage();
    this.renderer?.dispose();
  }
}
