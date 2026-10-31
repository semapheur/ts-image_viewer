import { createContext } from "svelte";
import {
  MAX_FILTERS,
  buildSnapshot,
  presetById,
  resizeKernel,
  type ConvFilter,
  type ConvPreset,
  type ConvSnapshot,
  type ConvSpace,
} from "../convolution";

let nextId = 1;

function fromPreset(p: ConvPreset): ConvFilter {
  return {
    id: nextId++,
    name: p.label,
    size: p.size,
    kernel: [...p.kernel],
    normalize: p.normalize,
    bias: p.bias ?? 0,
    amount: 1,
    abs: p.abs ?? false,
    enabled: true,
  };
}

/** The filter chain the user is building. Filters run top to bottom. */
export class Convolution {
  filters = $state<ConvFilter[]>([]);
  space = $state<ConvSpace>("display");

  get full() {
    return this.filters.length >= MAX_FILTERS;
  }

  private find(id: number) {
    return this.filters.find((f) => f.id === id);
  }

  add(presetId: string) {
    const p = presetById(presetId);
    if (p && !this.full) this.filters.push(fromPreset(p));
  }

  addCustom() {
    const identity = presetById("identity")!;
    if (this.full) return;
    this.filters.push({ ...fromPreset(identity), name: "Custom" });
  }

  remove(id: number) {
    this.filters = this.filters.filter((f) => f.id !== id);
  }

  duplicate(id: number) {
    const i = this.filters.findIndex((f) => f.id === id);
    if (i < 0 || this.full) return;
    const copy = { ...$state.snapshot(this.filters[i]), id: nextId++ };
    this.filters.splice(i + 1, 0, copy);
  }

  move(id: number, delta: -1 | 1) {
    const i = this.filters.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.filters.length) return;
    const next = [...this.filters];
    [next[i], next[j]] = [next[j], next[i]];
    this.filters = next;
  }

  /** Replace a filter's kernel and options with a preset's (keeps its id and enabled state). */
  loadPreset(id: number, presetId: string) {
    const f = this.find(id);
    const p = presetById(presetId);
    if (!f || !p) return;
    const fresh = fromPreset(p);
    Object.assign(f, {
      ...fresh,
      id: f.id,
      enabled: f.enabled,
      amount: f.amount,
    });
  }

  setSize(id: number, size: number) {
    const f = this.find(id);
    if (!f || f.size === size) return;
    f.kernel = resizeKernel(f.kernel, f.size, size);
    f.size = size;
    f.name = "Custom";
  }

  markCustom(id: number) {
    const f = this.find(id);
    if (f) f.name = "Custom";
  }

  reset() {
    this.filters = [];
    this.space = "display";
  }

  /** Plain, GPU-ready description of the active chain. Reading it tracks every filter field. */
  snapshot(): ConvSnapshot {
    return buildSnapshot($state.snapshot(this.filters), this.space);
  }
}

export const [getConv, setConv] = createContext<Convolution>();
