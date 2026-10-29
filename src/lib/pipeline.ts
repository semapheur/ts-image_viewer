/**
 * GPU pipeline (Three.js WebGPURenderer + TSL)
 *
 *   source ─► A: bilateral denoise ─► RT_A (linear, half-float)
 *   RT_A   ─► B: sharpen ─► sRGB encode ─► band stretch ─► exposure ─► tone chain ─► RT_B
 *   RT_B   ─► C: zoom/pan display quad ─► canvas
 *   RT_B   ─► D: compute: atomicAdd histogram ─► storage buffer ─► CPU
 *   source ─► E: compute: fine "extent" histogram (once per image, drives auto stretch)
 *   RT_B/source ─► F: compute: single-pixel picker
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
} from "three/tsl";
import type { ParamValues } from "./contexts/params.svelte";

export type RGB = [number, number, number];

// Rectangle in image pixels (y down): x0,y0 inclusive, x1,y1 exclusive.
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const EBINS = 1024;
export const BINS = 256;
export const CHANNELS = 4; // R, G, B, luma

const LUMA = [0.2126, 0.7152, 0.0722];

export class Pipeline {
  renderer!: THREE.WebGPURenderer;

  // One uniform per parameter, updated without rebuilding shaders.
  private u = {
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
  };

  // View (zoom/pan) uniforms
  private v = {
    zoom: uniform(1),
    cx: uniform(0),
    cy: uniform(0),
    vw: uniform(1),
    vh: uniform(1),
  };

  private src?: THREE.Texture;
  private rtA?: THREE.RenderTarget;
  private rtB?: THREE.RenderTarget;
  private quads: THREE.QuadMesh[] = [];

  private histNode?: any;
  private clearPass?: any;
  private accumPass?: any;

  private pick = { x: uniform(0), y: uniform(0) };
  private pickPass?: any;
  private pickOut?: any;

  private extentNode?: any;
  private extentClear?: any;
  private extentAccum?: any;
  // Region the extent histogram is restricted to (image pixels).
  private region = {
    x0: uniform(0, "uint"),
    y0: uniform(0, "uint"),
    w: uniform(1, "uint"),
    count: uniform(1, "uint"),
  };
  private imgW = 0;
  private imgH = 0;

  async init(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
    await this.renderer.init();
    // RT_B already holds sRGB-encoded values, so don't encode again on output.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  resize(cssW: number, cssH: number) {
    this.renderer.setSize(cssW, cssH, false);
    this.v.vw.value = cssW;
    this.v.vh.value = cssH;
  }

  setParams(p: ParamValues) {
    for (const k in this.u) (this.u as any)[k].value = (p as any)[k];
  }

  setView(cx: number, cy: number, zoom: number) {
    this.v.cx.value = cx;
    this.v.cy.value = cy;
    this.v.zoom.value = zoom;
  }

  // Cheap redraw for pan/zoom: display pass only.
  drawView() {
    if (!this.quads[2]) return;
    this.renderer.setRenderTarget(null);
    this.quads[2].render(this.renderer);
  }

  // (Re)build all GPU resources for a new image.
  setImage(bitmap: ImageBitmap) {
    this.disposeImage();
    const w = bitmap.width,
      h = bitmap.height;
    this.imgW = w;
    this.imgH = h;
    const u = this.u;

    const src = new THREE.Texture(bitmap as any);
    src.colorSpace = THREE.SRGBColorSpace; // sampled values are decoded to linear
    src.minFilter = src.magFilter = THREE.LinearFilter;
    src.generateMipmaps = false;
    src.needsUpdate = true;
    this.src = src;

    const makeRT = () =>
      new THREE.RenderTarget(w, h, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    const rtA = (this.rtA = makeRT());
    const rtB = (this.rtB = makeRT());
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

      return vec4(clamp(v, 0, 1), 1);
    });

    // Pass C: zoom/pan display
    const BG = vec3(34 / 255, 37 / 255, 42 / 255); // matches --well
    const display = Fn(() => {
      const view = this.v;
      // screen position in CSS px, y down
      const sx = uv().x.mul(view.vw);
      const sy = uv().y.mul(view.vh);
      // image position in pixels, y down
      const ix = view.cx.add(sx.sub(view.vw.mul(0.5)).div(view.zoom));
      const iy = view.cy.add(sy.sub(view.vh.mul(0.5)).div(view.zoom));
      const col = texture(rtB.texture, vec2(ix.div(w), iy.div(h))).rgb;
      const inside = step(float(0), ix)
        .mul(step(ix, float(w)))
        .mul(step(float(0), iy))
        .mul(step(iy, float(h)));
      return vec4(mix(BG, col, inside), 1);
    });

    const matA = new THREE.NodeMaterial();
    matA.fragmentNode = denoise();
    const matB = new THREE.NodeMaterial();
    matB.fragmentNode = tonal();
    const matC = new THREE.NodeMaterial();
    matC.fragmentNode = display();
    this.quads = [matA, matB, matC].map((m) => new THREE.QuadMesh(m));

    // Pass D: display histogram
    const total = w * h;
    const histNode = instancedArray(BINS * CHANNELS, "uint");
    const hist = histNode.toAtomic();
    this.histNode = histNode;

    this.clearPass = Fn(() => {
      atomicStore(hist.element(instanceIndex), uint(0));
    })().compute(BINS * CHANNELS);

    const pixels = texture(rtB.texture);
    this.accumPass = Fn(() => {
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
    this.extentNode = extNode;

    this.extentClear = Fn(() => {
      atomicStore(ext.element(instanceIndex), uint(0));
    })().compute(EBINS * CHANNELS);

    // Only pixels inside `region` are counted. Threads beyond region.count exit at once.
    const region = this.region;
    this.extentAccum = Fn(() => {
      If(instanceIndex.lessThan(region.count), () => {
        const x = region.x0.add(instanceIndex.mod(region.w)).toFloat();
        const y = region.y0.add(instanceIndex.div(region.w)).toFloat();
        const p = vec2(x.add(0.5).div(w), y.add(0.5).div(h));
        // (x, y) is in the display convention (y down), so undo pass A's vertical
        // flip when reading the source, exactly like the pixel picker does.
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
    this.pickOut = pickOut;
    this.pickPass = Fn(() => {
      If(instanceIndex.equal(uint(0)), () => {
        // pixel centre in the same (u, v) convention the display pass samples with
        const p = vec2(
          this.pick.x.add(0.5).div(w),
          this.pick.y.add(0.5).div(h),
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

  /**
   * Fine histogram of the source image: 4 * EBINS counts (R, G, B, luma).
   * Pass a region (image pixels) to restrict it, e.g. to the visible area; default is the whole image.
   */
  async computeExtent(r?: Region): Promise<Uint32Array> {
    const extentNode = this.extentNode;
    const w = this.imgW,
      h = this.imgH;
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(r?.x0 ?? 0)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(r?.y0 ?? 0)));
    const x1 = Math.max(x0 + 1, Math.min(w, Math.ceil(r?.x1 ?? w)));
    const y1 = Math.max(y0 + 1, Math.min(h, Math.ceil(r?.y1 ?? h)));
    this.region.x0.value = x0;
    this.region.y0.value = y0;
    this.region.w.value = x1 - x0;
    this.region.count.value = (x1 - x0) * (y1 - y0);
    await this.renderer.computeAsync([this.extentClear, this.extentAccum]);
    const buf = await this.renderer.getArrayBufferAsync(extentNode.value);
    return new Uint32Array(buf.slice(0));
  }

  async pickPixel(
    x: number,
    y: number,
  ): Promise<{ adjusted: RGB; original: RGB }> {
    const pickOut = this.pickOut;
    this.pick.x.value = x;
    this.pick.y.value = y;
    await this.renderer.computeAsync(this.pickPass);
    const f = new Float32Array(
      await this.renderer.getArrayBufferAsync(pickOut.value),
    );
    return { adjusted: [f[0], f[1], f[2]], original: [f[4], f[5], f[6]] };
  }

  /** Run all passes, then read the histogram back. Returns 4*256 counts: R,G,B,luma. */
  async render(): Promise<Uint32Array> {
    if (!this.rtA || !this.rtB) return new Uint32Array(BINS * CHANNELS);
    const r = this.renderer;
    const histNode = this.histNode; // captured: setImage() may swap it while we await
    r.setRenderTarget(this.rtA);
    this.quads[0].render(r);
    r.setRenderTarget(this.rtB);
    this.quads[1].render(r);
    r.setRenderTarget(null);
    this.quads[2].render(r);
    await r.computeAsync([this.clearPass, this.accumPass]);
    const buf = await r.getArrayBufferAsync(histNode.value);
    return new Uint32Array(buf.slice(0));
  }

  private disposeImage() {
    this.src?.dispose();
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.quads.forEach((q) => (q.material as THREE.Material | null)?.dispose());
    this.quads = [];
  }

  dispose() {
    this.disposeImage();
    this.renderer?.dispose();
  }
}
