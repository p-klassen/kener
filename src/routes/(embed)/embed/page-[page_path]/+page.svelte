<script lang="ts">
  import { onMount } from "svelte";
  import { setMode } from "mode-watcher";
  import { resolve } from "$app/paths";
  import StatusBarCalendar from "$lib/components/StatusBarCalendar.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import type { MonitorBarResponse } from "$lib/server/api-server/monitor-bar/get";
  import { t } from "$lib/stores/i18n";
  import clientResolver from "$lib/client/resolver.js";

  interface Props {
    data: {
      pageTitle: string | null;
      monitorTags: string[];
      days: number;
      endOfDayTodayAtTz: number;
      theme: string;
      localTz: string;
    };
  }

  let { data }: Props = $props();

  let loading = $state(true);
  let monitors = $state<Record<string, MonitorBarResponse>>({});
  let error = $state<string | null>(null);

  async function fetchData() {
    loading = true;
    error = null;

    if (data.monitorTags.length === 0) {
      loading = false;
      return;
    }

    try {
      const url =
        `?tags=${data.monitorTags.join(",")}&endOfDayTodayAtTz=${data.endOfDayTodayAtTz}&days=${data.days}`;
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/monitor-bars") + url);
      if (!response.ok) throw new Error("Failed to load");
      const result = await response.json();
      monitors = result.data;
    } catch (e) {
      console.error("Failed to fetch page monitors:", e);
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (data.theme) setMode(data.theme === "dark" ? "dark" : "light");
    fetchData();
  });
</script>

<div class="flex flex-col gap-3 p-2">
  {#if data.pageTitle}
    <div class="text-foreground text-sm font-semibold">{data.pageTitle}</div>
  {/if}

  {#if loading}
    {#each data.monitorTags as tag (tag)}
      <div class="flex flex-col gap-1">
        <Skeleton class="h-3 w-28" />
        <Skeleton class="h-7.5 w-full rounded" />
      </div>
    {/each}
  {:else if error}
    <div class="text-muted-foreground text-xs">{$t("Failed to load data")}</div>
  {:else if data.monitorTags.length === 0}
    <div class="text-muted-foreground text-center text-xs">No monitors on this page</div>
  {:else}
    {#each data.monitorTags as tag (tag)}
      {@const m = monitors[tag]}
      {#if m}
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs font-semibold">
            <span class="text-foreground">{m.name}</span>
            <span class="text-muted-foreground">{m.uptime}% {$t("Uptime")}</span>
          </div>
          <StatusBarCalendar data={m.uptimeData} monitorTag={tag} barHeight={24} radius={3} disableClick={true} />
        </div>
      {/if}
    {/each}
  {/if}
</div>
