<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    onfile,
    disabled = false,
    class: className = "",
    children,
  }: {
    onfile: (file: File | undefined) => void;
    disabled?: boolean;
    class?: string;
    children: Snippet;
  } = $props();
</script>

<label class={className} aria-disabled={disabled}>
  {@render children()}
  <input
    type="file"
    accept="image/*"
    hidden
    {disabled}
    onchange={(e) => {
      const input = e.currentTarget;
      onfile(input.files?.[0]);
      input.value = ""; // allow choosing the same file again
    }}
  />
</label>
