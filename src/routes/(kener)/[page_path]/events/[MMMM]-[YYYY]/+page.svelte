<script lang="ts">
  import EventsMonth from "$lib/components/EventsMonth.svelte";

  let { data } = $props();
</script>

<EventsMonth {data} />
