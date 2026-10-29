/*
  cx, cy : image-pixel coordinate (y down) shown at the centre of the viewport
  zoom   : CSS pixels per image pixel (1 = 100%)
  Screen coordinates (sx, sy) are CSS pixels from the viewport's top-left.
 */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export class View {
  static MAX_ZOOM = 64;

  cx = 0;
  cy = 0;
  zoom = 1;
  /** True until the user zooms or pans; while true, resizing the viewport re-fits the image. */
  fitted = true;

  imgW = 0;
  imgH = 0;
  viewW = 1;
  viewH = 1;

  get fitZoom() {
    return this.imgW
      ? Math.min(this.viewW / this.imgW, this.viewH / this.imgH)
      : 1;
  }
  get minZoom() {
    return this.fitZoom * 0.5;
  }

  setImage(w: number, h: number) {
    this.imgW = w;
    this.imgH = h;
    this.fit();
  }

  setViewport(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    if (this.fitted) this.fit();
    else this.clampCenter();
  }

  fit() {
    this.zoom = this.fitZoom;
    this.cx = this.imgW / 2;
    this.cy = this.imgH / 2;
    this.fitted = true;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.setZoomAt(sx, sy, this.zoom * factor);
  }

  /** Set an absolute zoom while keeping the image point under (sx, sy) fixed. */
  setZoomAt(sx: number, sy: number, target: number) {
    const z0 = this.zoom;
    const z1 = clamp(target, this.minZoom, View.MAX_ZOOM);
    const ix = this.cx + (sx - this.viewW / 2) / z0;
    const iy = this.cy + (sy - this.viewH / 2) / z0;
    this.zoom = z1;
    this.cx = ix - (sx - this.viewW / 2) / z1;
    this.cy = iy - (sy - this.viewH / 2) / z1;
    this.fitted = false;
    this.clampCenter();
  }

  panBy(dx: number, dy: number) {
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.fitted = false;
    this.clampCenter();
  }

  /** Centre the viewport on an image-pixel coordinate (used by the minimap). */
  centerOn(ix: number, iy: number) {
    this.cx = ix;
    this.cy = iy;
    this.fitted = false;
    this.clampCenter();
  }

  /** The view centre can't leave the image, so you can never lose it entirely. */
  private clampCenter() {
    this.cx = clamp(this.cx, 0, this.imgW);
    this.cy = clamp(this.cy, 0, this.imgH);
  }
}
