<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    neutral?: number;
    disabled?: boolean;
  }

  let {
    label,
    value = $bindable(),
    min,
    max,
    step = 0.01,
    neutral = 0,
    disabled = false,
  }: Props = $props();
</script>

<label class="row">
  <span>{label}</span>
  <output>{value.toFixed(Number.isInteger(step) ? 0 : 2)}</output>
  <input
    type="range"
    {min}
    {max}
    {step}
    {disabled}
    bind:value
    ondblclick={() => (value = neutral)}
  />
</label>

<style>
  .row {
    display: grid;
    grid-template-columns: 6rem 3rem 1fr;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  input {
    accent-color: var(--ink);
    width: 100%;
  }
</style>
