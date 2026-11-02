<script lang="ts">
  import Panel from "./Panel.svelte";
  import ConvFilterCard from "./ConvFilterCard.svelte";
  import { getConv } from "../contexts/convolution.svelte";
  import { MAX_FILTERS, PRESETS, PRESET_GROUPS } from "../convolution";

  const conv = getConv();
</script>

<Panel title="Convolution">
  <label class="select">
    <span>Apply in</span>
    <select bind:value={conv.space}>
      <option value="display">Display (sRGB)</option>
      <option value="linear">Linear light</option>
    </select>
  </label>

  {#each conv.filters as f, i (f.id)}
    <ConvFilterCard
      bind:filter={conv.filters[i]}
      index={i}
      count={conv.filters.length}
    />
  {:else}
    <p class="hint">
      No filters yet. Add a preset or a custom kernel; filters run top to
      bottom.
    </p>
  {/each}

  <div class="add">
    <select
      disabled={conv.full}
      aria-label="Add a preset filter"
      onchange={(e) => {
        conv.add(e.currentTarget.value);
        e.currentTarget.value = "";
      }}
    >
      <option value="">Add preset…</option>
      {#each PRESET_GROUPS as g}
        <optgroup label={g}>
          {#each PRESETS.filter((p) => p.group === g) as p (p.id)}
            <option value={p.id}>{p.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <button disabled={conv.full} onclick={() => conv.addCustom()}
      >Add custom</button
    >
  </div>

  {#if conv.full}
    <p class="hint">Limit of {MAX_FILTERS} filters reached.</p>
  {/if}
</Panel>

<style>
  .add {
    display: flex;
    gap: 0.5rem;
  }
  .add select {
    flex: 1;
    background: var(--well);
    color: var(--ink);
    border: 1px solid var(--edge);
    border-radius: 4px;
    padding: 0.3rem 0.4rem;
    font: inherit;
    font-size: 0.85rem;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
