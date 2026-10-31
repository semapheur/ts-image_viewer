import { createContext, tick, untrack } from "svelte";
import { Pipeline, type Region } from "../pipeline";
import { extentOf } from "../band_stretch";
import { View } from "../view";
import type { Interpolation } from "../interpolation";
import { decodeImage, encodePng16, saveBlob } from "../image_io";
import type { RGB } from "../color";
import type { Params } from "./params.svelte";
import type { Convolution } from "./convolution.svelte";

/** Minimum gap between visible-region extent updates while panning/zooming. */
const REGION_INTERVAL_MS = 80;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface PickedPixel {
  x: number;
  y: number;
  adjusted: RGB;
  original: RGB;
}

/**
 * Owns the GPU pipeline, the zoom/pan state and everything derived from them.
 * Components read its reactive fields and call its methods; they never touch
 * the pipeline directly. Construct it during component initialisation
 * (it registers $effects).
 */
export class Viewer {
  /** Zoom/pan maths. Not reactive: read `vs` in templates. */
  readonly view = new View();

  // ---- reactive state ----
  gpuReady = $state(false);
  imageReady = $state(false);
  loading = $state(false);
  /** The current image runs through the float32 (16-bit) path. */
  deep = $state(false);
  /** One-line description of how the source was decoded. */
  sourceInfo = $state("");
  /** How the image is resampled on screen (a view setting, not an image edit). */
  interpolation = $state<Interpolation>("bilinear");
  error = $state("");
  img = $state({ w: 0, h: 0 });
  hist = $state.raw<Uint32Array | null>(null);
  /** Extent histogram of the whole image (computed once per image). */
  extentHist = $state.raw<Uint32Array | null>(null);
  /** Extent histogram of the visible area (only maintained while auto + visible-only is on). */
  regionHist = $state.raw<Uint32Array | null>(null);
  bitmap = $state.raw<ImageBitmap | null>(null);
  picked = $state.raw<PickedPixel | null>(null);
  /** Reactive mirror of the view, updated once per drawn frame. */
  vs = $state.raw({ cx: 0, cy: 0, zoom: 1, w: 1, h: 1 });

  extent = $derived(this.extentHist ? extentOf(this.extentHist) : null);
  regionExtent = $derived(this.regionHist ? extentOf(this.regionHist) : null);
  zoomPct = $derived(Math.round(this.vs.zoom * 100));
  /** An image is loaded and nothing is replacing it. */
  ready = $derived(this.imageReady && !this.loading);

  // ---- internals ----
  private params: Params;
  private conv: Convolution;
  private pipe: Pipeline | null = null;
  private size = { w: 0, h: 0 };
  private busy = false;
  private dirty = false;
  private drawQueued = false;
  private regionBusy = false;
  private regionDirty = false;
  private lastRegion = "";
  private disposed = false;

  constructor(params: Params, conv: Convolution) {
    this.params = params;
    this.conv = conv;

    // Push parameter changes to the GPU and refresh the histogram.
    $effect(() => {
      const p = this.params.snapshot(); // tracks every parameter
      if (!this.ready) return;
      this.pipe?.setParams(p);
      void this.frame();
    });

    // Push the convolution chain to the GPU. Editing a weight only updates uniforms;
    // adding, removing or resizing filters rebuilds the chain's passes.
    $effect(() => {
      const chain = this.conv.snapshot(); // tracks every filter field
      if (!this.ready) return;
      this.pipe?.setConvolution(chain);
      void this.frame();
    });

    // Auto stretch: recompute black/white whenever its inputs change.
    // Falls back to the whole-image extent until the visible-area one is ready.
    $effect(() => {
      const v = this.params.values;
      if (!v.auto) return;
      const hist = (v.autoVisible ? this.regionHist : null) ?? this.extentHist;
      if (hist) this.params.applyAuto(hist);
    });

    // Start tracking the visible area when auto (visible-only) is switched on.
    $effect(() => {
      if (this.wantsRegion() && this.ready)
        untrack(() => void this.requestRegionExtent());
    });

    // Release the GPU when the owning component is destroyed.
    $effect(() => () => this.dispose());
  }

  // ───────────── lifecycle ─────────────

  async init(canvas: HTMLCanvasElement) {
    if (!("gpu" in navigator)) {
      this.error =
        "WebGPU is required (compute shaders). Try a recent Chrome, Edge, or Safari.";
      return;
    }
    const pipe = new Pipeline();
    try {
      await pipe.init(canvas);
    } catch (e) {
      this.error = String(e);
      return;
    }
    if (this.disposed) {
      pipe.dispose(); // unmounted while the GPU was starting up
      return;
    }
    pipe.setInterpolation(this.interpolation);
    this.pipe = pipe;
    this.gpuReady = true;
  }

  dispose() {
    this.disposed = true;
    this.pipe?.dispose();
    this.pipe = null;
  }

  async load(file: File | undefined) {
    const pipe = this.pipe;
    if (!file || !pipe || this.loading) return;

    const previous = this.bitmap;
    this.loading = true;
    try {
      const dec = await decodeImage(file, pipe.hasFloat32);
      pipe.setImage(dec.deep ?? dec.bitmap);
      // Update everything that describes the image *before* any further await,
      // so it never disagrees with the pipeline.
      this.bitmap = dec.bitmap;
      this.img = { w: dec.width, h: dec.height };
      this.deep = !!dec.deep;
      this.sourceInfo = dec.info;
      this.view.setImage(dec.width, dec.height);
      this.picked = null;
      this.hist = null;
      this.regionHist = null;
      this.lastRegion = "";
      this.extentHist = await pipe.computeExtent();
      this.imageReady = true;
      this.error = "";
    } catch (e) {
      this.error = `Could not load image: ${e}`;
      return;
    } finally {
      this.loading = false;
    }

    await tick(); // lets the canvas un-hide and auto-stretch effects run
    previous?.close();
    pipe.setParams(this.params.snapshot());
    pipe.setConvolution(this.conv.snapshot());
    this.applySize();
    void this.frame();
  }

  // ───────────── rendering ─────────────

  /** Coalesces rapid changes: at most one GPU frame in flight, latest params win. */
  async frame() {
    const pipe = this.pipe;
    if (!pipe || !this.ready) return;
    if (this.busy) {
      this.dirty = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.dirty = false;
        this.hist = await pipe.render();
        const p = this.picked; // keep the inspector live while sliders move
        if (p)
          this.picked = { x: p.x, y: p.y, ...(await pipe.pickPixel(p.x, p.y)) };
      } while (this.dirty && this.ready && !this.disposed);
    } catch (e) {
      this.error = String(e);
    } finally {
      this.busy = false;
    }
  }

  /** Immediate redraw of the display pass (cheap: no histogram). */
  private draw() {
    const pipe = this.pipe;
    if (!pipe || !this.ready) return;
    const v = this.view;
    pipe.setView(v.cx, v.cy, v.zoom);
    pipe.drawView();
    this.vs = { cx: v.cx, cy: v.cy, zoom: v.zoom, w: v.viewW, h: v.viewH };
    // The visible area changed, so the auto range may need to follow it.
    if (this.wantsRegion()) void this.requestRegionExtent();
  }

  requestDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  /** Called by the viewport whenever its size changes. */
  resize(w: number, h: number) {
    this.size = { w, h };
    this.applySize();
  }

  private applySize() {
    const { w, h } = this.size;
    if (!this.pipe || !this.img.w || !w || !h) return;
    this.pipe.resize(w, h); // clears the canvas, so draw straight away
    this.view.setViewport(w, h);
    this.draw();
  }

  // ───────────── visible-area auto range ─────────────

  private wantsRegion() {
    const v = this.params.values;
    return v.auto && v.autoVisible;
  }

  /** The part of the image currently on screen, in image pixels. */
  private visibleRegion(): Region {
    const { cx, cy, zoom, viewW, viewH } = this.view;
    const { w, h } = this.img;
    const hw = viewW / zoom / 2;
    const hh = viewH / zoom / 2;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(hi, Math.max(lo, v));
    const x0 = clamp(Math.floor(cx - hw), 0, w - 1);
    const y0 = clamp(Math.floor(cy - hh), 0, h - 1);
    return {
      x0,
      y0,
      x1: clamp(Math.ceil(cx + hw), x0 + 1, w),
      y1: clamp(Math.ceil(cy + hh), y0 + 1, h),
    };
  }

  /**
   * Recompute the extent histogram for the visible area. One computation in flight,
   * latest view wins, at most one every REGION_INTERVAL_MS. Skipped if the region is unchanged.
   */
  private async requestRegionExtent() {
    const pipe = this.pipe;
    if (!pipe || !this.ready) return;
    if (this.regionBusy) {
      this.regionDirty = true;
      return;
    }
    this.regionBusy = true;
    try {
      do {
        this.regionDirty = false;
        const r = this.visibleRegion();
        const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
        if (key !== this.lastRegion) {
          this.lastRegion = key;
          this.regionHist = await pipe.computeExtent(r);
        }
        if (this.regionDirty) await wait(REGION_INTERVAL_MS);
      } while (this.regionDirty && this.ready && !this.disposed);
    } catch (e) {
      this.lastRegion = ""; // retry next time
      this.error = String(e);
    } finally {
      this.regionBusy = false;
    }
  }

  // ───────────── view commands (screen coords: CSS px from the viewport's top-left) ─────────────

  zoomAt(sx: number, sy: number, factor: number) {
    if (!this.ready) return;
    this.view.zoomAt(sx, sy, factor);
    this.requestDraw();
  }

  zoomTo(sx: number, sy: number, zoom: number) {
    if (!this.ready) return;
    this.view.setZoomAt(sx, sy, zoom);
    this.requestDraw();
  }

  panBy(dx: number, dy: number) {
    if (!this.ready) return;
    this.view.panBy(dx, dy);
    this.requestDraw();
  }

  centerOn(ix: number, iy: number) {
    if (!this.ready) return;
    this.view.centerOn(ix, iy);
    this.requestDraw();
  }

  fit() {
    if (!this.ready) return;
    this.view.fit();
    this.requestDraw();
  }

  actualSize() {
    this.zoomTo(this.view.viewW / 2, this.view.viewH / 2, 1);
  }

  toggleActualSize(sx: number, sy: number) {
    if (Math.abs(this.view.zoom - 1) < 1e-3) this.fit();
    else this.zoomTo(sx, sy, 1);
  }

  setInterpolation(mode: Interpolation) {
    this.interpolation = mode;
    this.pipe?.setInterpolation(mode);
    this.requestDraw(); // display pass only: no re-render, no histogram work
  }

  // ───────────── export ─────────────

  /** Save the processed image (not just the visible part) as a 16-bit PNG. */
  async exportPng() {
    const pipe = this.pipe;
    if (!pipe || !this.ready) return;
    try {
      const { width, height, data } = await pipe.readOutput();
      saveBlob(
        new Blob([encodePng16(width, height, data)], { type: "image/png" }),
        "export-16bit.png",
      );
    } catch (e) {
      this.error = String(e);
    }
  }

  // ───────────── pixel inspector ─────────────

  async pickAt(sx: number, sy: number) {
    const pipe = this.pipe;
    if (!pipe || !this.ready) return;
    const { cx, cy, zoom, viewW, viewH } = this.view;
    // screen -> image pixel, same maths as the display shader
    const x = Math.floor(cx + (sx - viewW / 2) / zoom);
    const y = Math.floor(cy + (sy - viewH / 2) / zoom);
    if (x < 0 || y < 0 || x >= this.img.w || y >= this.img.h) {
      this.picked = null;
      return;
    }
    try {
      this.picked = { x, y, ...(await pipe.pickPixel(x, y)) };
    } catch (e) {
      this.error = String(e);
    }
  }
}

export const [getViewer, setViewer] = createContext<Viewer>();
