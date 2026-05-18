<script lang="ts">
  import { page } from "$app/state";
  import { SveltePurify } from "@humanspeak/svelte-purify";

  let { data } = page;
</script>

<div class="mx-auto flex max-w-5xl justify-center px-4">
  <SveltePurify html={data.footerHTML} />
</div>
