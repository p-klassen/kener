<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import Plus from "@lucide/svelte/icons/plus";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import SearchIcon from "@lucide/svelte/icons/search";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import XIcon from "@lucide/svelte/icons/x";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import type { MonitorRecord } from "$lib/server/types/db.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { GetInitials } from "$lib/clientTools.js";
  import { onMount } from "svelte";
  import { t } from "$lib/stores/i18n";

  let monitors = $state<MonitorRecord[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showFilters = $state(false);
  let statusFilter = $state("ALL");
  let typeFilter = $state("ALL");
  let searchQuery = $state("");
  let pageNo = $state(1);
  const limit = 10;

  const statusOptions = $derived([
    { value: "ALL", label: $t("manage.monitors.filter_status") },
    { value: "ACTIVE", label: $t("manage.monitors.status_active") },
    { value: "INACTIVE", label: $t("manage.monitors.status_inactive") },
  ]);

  const typeOptions = $derived([
    { value: "ALL", label: $t("manage.monitors.filter_type") },
    { value: "API", label: $t("manage.monitors.type_api") },
    { value: "PING", label: $t("manage.monitors.type_ping") },
    { value: "TCP", label: $t("manage.monitors.type_tcp") },
    { value: "DNS", label: $t("manage.monitors.type_dns") },
    { value: "SSL", label: $t("manage.monitors.type_ssl") },
    { value: "SQL", label: $t("manage.monitors.type_sql") },
    { value: "HEARTBEAT", label: $t("manage.monitors.type_heartbeat") },
    { value: "GAMEDIG", label: $t("manage.monitors.type_gamedig") },
    { value: "GROUP", label: $t("manage.monitors.type_group") },
    { value: "GRPC", label: $t("manage.monitors.type_grpc") },
    { value: "NONE", label: $t("manage.monitors.type_none") },
  ]);

  const totalCount = $derived(monitors.length);
  const totalPages = $derived(Math.max(1, Math.ceil(totalCount / limit)));

  const paginatedMonitors = $derived.by(() => {
    const safePageNo = Math.min(pageNo, totalPages);
    const start = (safePageNo - 1) * limit;
    return monitors.slice(start, start + limit);
  });

  const hasActiveFilters = $derived(statusFilter !== "ALL" || typeFilter !== "ALL" || searchQuery.trim() !== "");

  function goToPage(page: number) {
    if (page < 1 || page > totalPages) return;
    pageNo = page;
  }

  function applyFilters() {
    pageNo = 1;
    fetchMonitors();
  }

  function clearFilters() {
    statusFilter = "ALL";
    typeFilter = "ALL";
    searchQuery = "";
    pageNo = 1;
    fetchMonitors();
  }

  async function fetchMonitors() {
    loading = true;
    error = null;
    try {
      const data: Record<string, string> = {};
      if (statusFilter !== "ALL") {
        data.status = statusFilter;
      }
      if (typeFilter !== "ALL") {
        data.monitor_type = typeFilter;
      }
      const trimmed = searchQuery.trim();
      if (trimmed) {
        data.search = trimmed;
      }
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMonitors", data })
      });
      const result = await response.json();
      if (result.error) {
        error = result.error;
      } else {
        monitors = result;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : $t("manage.monitors.fetch_error");
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchMonitors();
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">
  <div class="mb-4 flex flex-col gap-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <Button variant={showFilters ? "default" : "outline"} size="sm" onclick={() => (showFilters = !showFilters)}>
          <FilterIcon class="size-4" />
          {$t("manage.monitors.filters_button")}
          {#if hasActiveFilters}
            <Badge variant="secondary" class="ml-1 px-1.5 py-0 text-[10px]">ON</Badge>
          {/if}
        </Button>
        {#if loading}
          <Spinner class="size-5" />
        {/if}
      </div>
      <Button class="cursor-pointer" href={clientResolver(resolve, "/manage/app/monitors/new")}>
        <Plus class="size-4" />
        {$t("manage.monitors.add_button")}
      </Button>
    </div>

    {#if showFilters}
      <div class="bg-muted/50 flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div class="flex flex-col gap-1">
          <span class="text-muted-foreground text-xs font-medium">{$t("manage.common.search")}</span>
          <Input type="text" placeholder={$t("manage.monitors.search_placeholder")} bind:value={searchQuery} class="w-60" />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-muted-foreground text-xs font-medium">{$t("manage.common.status")}</span>
          <Select.Root
            type="single"
            value={statusFilter}
            onValueChange={(v) => {
              if (v) statusFilter = v;
            }}
          >
            <Select.Trigger class="w-40">
              {statusOptions.find((o) => o.value === statusFilter)?.label || "All Status"}
            </Select.Trigger>
            <Select.Content>
              {#each statusOptions as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-muted-foreground text-xs font-medium">{$t("manage.common.type")}</span>
          <Select.Root
            type="single"
            value={typeFilter}
            onValueChange={(v) => {
              if (v) typeFilter = v;
            }}
          >
            <Select.Trigger class="w-40">
              {typeOptions.find((o) => o.value === typeFilter)?.label || "All Types"}
            </Select.Trigger>
            <Select.Content>
              {#each typeOptions as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <Button size="sm" onclick={applyFilters}>
          <SearchIcon class="size-4" />
          {$t("manage.common.search")}
        </Button>
        {#if hasActiveFilters}
          <Button variant="ghost" size="sm" onclick={clearFilters}>
            <XIcon class="size-4" />
            {$t("manage.common.clear")}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
  {#if loading}
    <div class="flex w-full flex-col gap-4 [--radius:1rem]">
      <Item.Root variant="muted" class="mx-auto">
        <Item.Media>
          <Spinner />
        </Item.Media>
        <Item.Content>
          <Item.Title class="line-clamp-1">{$t("manage.monitors.loading")}</Item.Title>
        </Item.Content>
        <Item.Content class="flex-none justify-end"></Item.Content>
      </Item.Root>
    </div>
  {:else if error}
    <div class="text-destructive py-8 text-center">
      {error}
    </div>
  {:else if monitors.length === 0}
    <div class="text-muted-foreground py-8 text-center">{$t("manage.monitors.no_monitors")}</div>
  {:else}
    <div class="ktable overflow-hidden rounded-xl border">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head class="w-[300px]">{$t("manage.monitors.col_name")}</Table.Head>
            <Table.Head class="w-[180px]">{$t("manage.monitors.col_tag")}</Table.Head>
            <Table.Head class="w-[130px]">{$t("manage.monitors.col_type")}</Table.Head>
            <Table.Head class="w-[120px]">{$t("manage.monitors.col_status")}</Table.Head>
            <Table.Head class="w-[120px]">{$t("manage.monitors.col_hidden")}</Table.Head>
            <Table.Head class="w-[180px]">{$t("manage.monitors.col_cron")}</Table.Head>
            <Table.Head class="w-[120px] text-right"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each paginatedMonitors as data (data.id)}
            <Table.Row>
              <Table.Cell>
                <div class="flex items-center gap-3">
                  <Avatar.Root class="size-8">
                    {#if data.image}
                      <Avatar.Image src={clientResolver(resolve, data.image)} alt={data.name} class="  " />
                    {/if}
                    <Avatar.Fallback>{GetInitials(data.name)}</Avatar.Fallback>
                  </Avatar.Root>
                  <div class="min-w-0">
                    <div class="font-medium">{data.name}</div>
                  </div>
                </div>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline">{data.tag}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="secondary">{data.monitor_type}</Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge variant={(data.status || "INACTIVE") === "ACTIVE" ? "default" : "destructive"}>
                  {data.status || "INACTIVE"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge variant={data.is_hidden === "YES" ? "destructive" : "outline"}>
                  {data.is_hidden === "YES" ? "YES" : "NO"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <span class="text-muted-foreground text-xs">{data.cron || "-"}</span>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Button variant="outline" size="sm" href={clientResolver(resolve, `/manage/app/monitors/${data.tag}`)}>
                  <SettingsIcon class="mr-1 size-4" />
                  {$t("manage.monitors.configure_button")}
                </Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>

    <!-- Pagination -->
    {#if totalPages > 0}
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground text-sm">
          {$t("manage.common.showing")} {(pageNo - 1) * limit + 1} - {Math.min(pageNo * limit, totalCount)} {$t("manage.common.of")} {totalCount} {$t("manage.monitors.count_unit")}
        </p>
        {#if totalPages > 1}
          <div class="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={pageNo === 1} onclick={() => goToPage(pageNo - 1)}>
              <ChevronLeftIcon class="size-4" />
            </Button>
            <div class="flex items-center gap-1">
              {#if totalPages <= 7}
                {#each Array.from({ length: totalPages }, (_, i) => i + 1) as page (page)}
                  <Button variant={page === pageNo ? "default" : "ghost"} size="sm" onclick={() => goToPage(page)}>
                    {page}
                  </Button>
                {/each}
              {:else}
                <Button variant={pageNo === 1 ? "default" : "ghost"} size="sm" onclick={() => goToPage(1)}>1</Button>
                {#if pageNo > 3}
                  <span class="text-muted-foreground px-2">...</span>
                {/if}
                {#each Array.from({ length: 3 }, (_, i) => pageNo - 1 + i).filter((p) => p > 1 && p < totalPages) as page (page)}
                  <Button variant={page === pageNo ? "default" : "ghost"} size="sm" onclick={() => goToPage(page)}>
                    {page}
                  </Button>
                {/each}
                {#if pageNo < totalPages - 2}
                  <span class="text-muted-foreground px-2">...</span>
                {/if}
                <Button
                  variant={pageNo === totalPages ? "default" : "ghost"}
                  size="sm"
                  onclick={() => goToPage(totalPages)}
                >
                  {totalPages}
                </Button>
              {/if}
            </div>
            <Button variant="outline" size="icon" disabled={pageNo === totalPages} onclick={() => goToPage(pageNo + 1)}>
              <ChevronRightIcon class="size-4" />
            </Button>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
