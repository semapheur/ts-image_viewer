<script lang="ts">
  import Slider from "./Slider.svelte";
  import { getConv } from "../contexts/convolution.svelte";
  import {
    KERNEL_SIZES,
    PRESETS,
    PRESET_GROUPS,
    kernelDivisor,
    type ConvFilter,
  } from "../convolution";

  interface Props {
    filter: ConvFilter;
    index: number;
    count: number;
  }

  // $bindable: the card edits the filter in place without breaking ownership of the state.
  let { filter = $bindable(), index, count }: Props = $props();

  const conv = getConv();

  let dialog: HTMLDialogElement;

  const sum = $derived(filter.kernel.reduce((a, b) => a + (Number(b) || 0), 0));
  const divisor = $derived(kernelDivisor(filter.kernel, filter.normalize));
  const peak = $derived(
    Math.max(1e-9, ...filter.kernel.map((v) => Math.abs(Number(v) || 0))),
  );

  // Thumbnail cell colour: light for positive weights, red for negative, opacity ~ magnitude.
  const cellColor = (v: number) => {
    const n = Number(v) || 0;
    const alpha = Math.max(0.08, Math.abs(n) / peak).toFixed(2);
    return n >= 0
      ? `rgb(235 233 228 / ${alpha})`
      : `rgb(232 102 92 / ${alpha})`;
  };
</script>

<div class="card" class:off={!filter.enabled}>
  <header>
    <label class="check title">
      <input type="checkbox" bind:checked={filter.enabled} />
      {index + 1}. {filter.name}
    </label>
    <div class="buttons">
      <button
        disabled={index === 0}
        title="Move up"
        aria-label="Move up"
        onclick={() => conv.move(filter.id, -1)}>↑</button
      >
      <button
        disabled={index === count - 1}
        title="Move down"
        aria-label="Move down"
        onclick={() => conv.move(filter.id, 1)}>↓</button
      >
      <button
        disabled={conv.full}
        title="Duplicate"
        aria-label="Duplicate"
        onclick={() => conv.duplicate(filter.id)}>⧉</button
      >
      <button
        title="Remove"
        aria-label="Remove"
        onclick={() => conv.remove(filter.id)}>✕</button
      >
    </div>
  </header>

  <!-- Thumbnail + summary; opens the full matrix editor. -->
  <button
    class="open"
    onclick={() => dialog.showModal()}
    aria-label="Edit kernel matrix"
  >
    <span class="thumb" style:--n={filter.size} aria-hidden="true">
      {#each filter.kernel as v}
        <i style:background={cellColor(v)}></i>
      {/each}
    </span>
    <span class="summary">
      <strong>{filter.size}×{filter.size} kernel</strong>
      <span>
        sum {sum.toFixed(2)}{filter.normalize
          ? ` · ÷ ${divisor.toFixed(2)}`
          : ""}{filter.abs ? " · |abs|" : ""}
      </span>
      <span class="edit">Edit matrix…</span>
    </span>
  </button>

  <Slider label="Bias" bind:value={filter.bias} min={-1} max={1} neutral={0} />
  <Slider
    label="Amount"
    bind:value={filter.amount}
    min={0}
    max={1}
    neutral={1}
  />
</div>

<!-- Native modal dialog: lives in the top layer, so the sidebar can never clip it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  aria-label="Kernel matrix for filter {index + 1}"
  onclick={(e) => e.target === dialog && dialog.close()}
>
  <div class="dlg">
    <header>
      <h3>{index + 1}. {filter.name}</h3>
      <button onclick={() => dialog.close()} aria-label="Close">✕</button>
    </header>

    <div class="scroll">
      <div class="kernel" style:--n={filter.size}>
        {#each filter.kernel as _, k}
          <input
            type="number"
            step="any"
            bind:value={filter.kernel[k]}
            oninput={() => conv.markCustom(filter.id)}
            onfocus={(e) => e.currentTarget.select()}
            aria-label="Row {Math.floor(k / filter.size) + 1}, column {(k %
              filter.size) +
              1}"
          />
        {/each}
      </div>
    </div>

    <p class="hint">
      Sum {sum.toFixed(3)}{filter.normalize
        ? ` · divided by ${divisor.toFixed(3)}`
        : ""}. Changes apply live.
    </p>

    <div class="row">
      <label class="select">
        <span>Size</span>
        <select
          value={filter.size}
          onchange={(e) =>
            conv.setSize(filter.id, Number(e.currentTarget.value))}
        >
          {#each KERNEL_SIZES as n}
            <option value={n}>{n}×{n}</option>
          {/each}
        </select>
      </label>
      <label class="select">
        <span>Preset</span>
        <select
          value=""
          onchange={(e) => {
            conv.loadPreset(filter.id, e.currentTarget.value);
            e.currentTarget.value = "";
          }}
        >
          <option value="">Load…</option>
          {#each PRESET_GROUPS as g}
            <optgroup label={g}>
              {#each PRESETS.filter((p) => p.group === g) as p (p.id)}
                <option value={p.id}>{p.label}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </label>
    </div>

    <div class="row">
      <label class="check"
        ><input type="checkbox" bind:checked={filter.normalize} /> Normalise</label
      >
      <label class="check"
        ><input type="checkbox" bind:checked={filter.abs} /> Absolute value</label
      >
    </div>

    <footer>
      <button onclick={() => dialog.close()}>Done</button>
    </footer>
  </div>
</dialog>

<style>
  .card {
    display: grid;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--edge);
    border-radius: 6px;
    background: var(--well);
  }
  .card.off > :not(header) {
    opacity: 0.45;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .title {
    color: var(--ink);
    font-weight: 600;
  }
  .buttons {
    display: flex;
    gap: 0.25rem;
  }
  .buttons button {
    padding: 0.1rem 0.45rem;
    font-size: 0.8rem;
  }
  .buttons button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* Summary button */
  .open {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    text-align: left;
  }
  .thumb {
    display: grid;
    grid-template-columns: repeat(var(--n), 9px);
    gap: 1px;
    flex: none;
    padding: 3px;
    border-radius: 3px;
    background: var(--panel);
  }
  .thumb i {
    display: block;
    width: 9px;
    height: 9px;
    border-radius: 1px;
  }
  .summary {
    display: grid;
    gap: 0.1rem;
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .summary strong {
    color: var(--ink);
    font-weight: 600;
  }
  .edit {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* Dialog */
  dialog {
    padding: 0;
    border: 1px solid var(--edge);
    border-radius: 8px;
    background: var(--panel);
    color: var(--ink);
    max-width: min(92vw, 40rem);
    max-height: 90vh;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  .dlg {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
  }
  .dlg header {
    margin-bottom: 0;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .scroll {
    overflow: auto;
    max-height: 60vh;
  }
  .kernel {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(3.5rem, 4.5rem));
    gap: 4px;
    width: max-content;
    margin: 0 auto;
  }
  .kernel input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.45rem 0.25rem;
    border: 1px solid var(--edge);
    border-radius: 4px;
    background: var(--well);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .kernel input::-webkit-inner-spin-button,
  .kernel input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }
  .row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }
  footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
