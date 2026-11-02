<script lang="ts">
  import Panel from "./Panel.svelte";
  import ParamSliders from "./ParamSliders.svelte";
  import type { SliderSpec } from "../slider_specs";

  let { title, specs }: { title: string; specs: SliderSpec[] } = $props();
</script>

<Panel {title}>
  <ParamSliders {specs} />
</Panel>
