<script lang="ts">
  import Slider from "./Slider.svelte";
  import { getParams } from "../contexts/params.svelte";
  import type { SliderSpec } from "../slider_specs";

  let { specs, disabled = false }: { specs: SliderSpec[]; disabled?: boolean } =
    $props();

  const { values: v } = getParams();
</script>

{#each specs as s (s.key)}
  <Slider
    label={s.label}
    min={s.min}
    max={s.max}
    step={s.step}
    neutral={s.neutral}
    {disabled}
    curve={s.curve}
    bind:value={v[s.key]}
  />
{/each}
