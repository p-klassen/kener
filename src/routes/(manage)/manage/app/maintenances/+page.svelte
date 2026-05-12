<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import BlendIcon from "@lucide/svelte/icons/blend";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import RepeatIcon from "@lucide/svelte/icons/repeat";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import UsersIcon from "@lucide/svelte/icons/users";
  import { goto } from "$app/navigation";
  import { format, formatDistanceToNow, isPast, isFuture, isWithinInterval } from "date-fns";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";

  // Types
  interface MaintenanceEvent {
    id: number;
    maintenance_id: number;
    start_date_time: number;
    end_date_time: number;
    status: string;
  }

  interface Maintenance {
    id: number;
    title: string;
    description: string | null;
    start_date_time: number;
    rrule: string;
    duration_seconds: number;
    status: "ACTIVE" | "INACTIVE";
    monitors?: Array<{ monitor_tag: string }>;
    events?: MaintenanceEvent[];
    upcoming_event?: MaintenanceEvent | null;
  }

  // State
  let loading = $state(true);
  let maintenances = $state<Maintenance[]>([]);
  let totalPages = $state(0);
  let totalCount = $state(0);
  let pageNo = $state(1);
  let status = $state("ACTIVE");
  const limit = 10;

  // Fetch maintenances
  async function fetchData() {
    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getMaintenances",
          data: {
            page: pageNo,
            limit,
            filter: { status: status === "ALL" ? undefined : status }
          }
        })
      });
      const result = await response.json();
      if (!result.error) {
        maintenances = result.maintenances;
        totalCount = result.total;
        totalPages = Math.ceil(result.total / limit);
      }
    } catch (error) {
      console.error("Error fetching maintenances:", error);
    } finally {
      loading = false;
    }
  }

  // Check if RRULE is one-time (contains COUNT=1)
  function isOneTime(rrule: string): boolean {
    return rrule.includes("COUNT=1");
  }

  // Format duration in seconds
  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  // Get status badge class for ACTIVE/INACTIVE
  function getStatusClass(status: string): string {
    switch (status) {
      case "ACTIVE":
        return "text-green-500";
      case "INACTIVE":
        return "text-pink-500";
      default:
        return "text-muted-foreground";
    }
  }

  // Compute event display status based on current time
  interface EventDisplayStatus {
    label: string;
    colorClass: string;
  }

  function getEventDisplayStatus(event: MaintenanceEvent): EventDisplayStatus {
    const now = new Date();
    const startDate = new Date(event.start_date_time * 1000);
    const endDate = new Date(event.end_date_time * 1000);

    if (isWithinInterval(now, { start: startDate, end: endDate })) {
      return { label: "Ongoing", colorClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
    }

    if (isFuture(startDate)) {
      const distance = formatDistanceToNow(startDate, { addSuffix: false });
      return { label: `In ${distance}`, colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" };
    }

    if (isPast(endDate)) {
      return { label: "Completed", colorClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
    }

    return { label: "Scheduled", colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" };
  }

  // Navigate to maintenance
  function openMaintenance(id: number) {
    goto(clientResolver(resolve, `/manage/app/maintenances/${id}`));
  }

  // Create new maintenance
  function createNewMaintenance() {
    goto(clientResolver(resolve, "/manage/app/maintenances/new"));
  }

  // Handle status filter change
  function handleStatusChange(value: string | undefined) {
    if (value) {
      status = value;
      pageNo = 1;
      fetchData();
    }
  }

  // Pagination
  function goToPage(page: number) {
    pageNo = page;
    fetchData();
  }

  $effect(() => {
    fetchData();
  });
</script>

<div class="container mx-auto space-y-6 py-6">
  <!-- Breadcrumb -->

  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Select.Root type="single" value={status} onValueChange={handleStatusChange}>
          <Select.Trigger class="w-40">
            {status === "ALL" ? $t("manage.maintenances.status_all") : status === "ACTIVE" ? $t("manage.maintenances.status_active") : $t("manage.maintenances.status_inactive")}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="ALL">{$t("manage.maintenances.status_all")}</Select.Item>
            <Select.Item value="ACTIVE">{$t("manage.maintenances.status_active")}</Select.Item>
            <Select.Item value="INACTIVE">{$t("manage.maintenances.status_inactive")}</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
      {#if loading}
        <Spinner class="size-5" />
      {/if}
    </div>
    <div class="flex items-center gap-3">
      <Button onclick={createNewMaintenance}>
        <PlusIcon class="size-4" />
        {$t("manage.maintenances.add_button")}
      </Button>
    </div>
  </div>

  <!-- Filters -->

  <!-- Maintenances Table -->
  <div class="ktable overflow-hidden rounded-xl border">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-16">{$t("manage.common.id")}</Table.Head>
          <Table.Head>{$t("manage.maintenances.col_title")}</Table.Head>
          <Table.Head class="w-32">{$t("manage.common.type")}</Table.Head>
          <Table.Head class="w-40">{$t("manage.maintenances.col_duration")}</Table.Head>
          <Table.Head class="w-24">{$t("manage.maintenances.col_monitors")}</Table.Head>
          <Table.Head class="w-40">{$t("manage.maintenances.col_next_event")}</Table.Head>
          <Table.Head class="w-24">{$t("manage.common.status")}</Table.Head>
          <Table.Head class="w-24 text-right">{$t("manage.common.actions")}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#if loading && maintenances.length === 0}
          <Table.Row>
            <Table.Cell colspan={8} class="py-8 text-center">
              <div class="flex items-center justify-center gap-2">
                <Spinner class="size-4" />
                <span class="text-muted-foreground text-sm">{$t("manage.common.loading")}</span>
              </div>
            </Table.Cell>
          </Table.Row>
        {:else if maintenances.length === 0}
          <Table.Row>
            <Table.Cell colspan={8} class="text-muted-foreground py-8 text-center">{$t("manage.maintenances.no_maintenances")}</Table.Cell>
          </Table.Row>
        {:else}
          {#each maintenances as maintenance}
            <Table.Row class="hover:bg-muted/50 cursor-pointer" onclick={() => openMaintenance(maintenance.id)}>
              <Table.Cell class="font-medium">{maintenance.id}</Table.Cell>
              <Table.Cell>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    <span class="line-clamp-1 max-w-xs">{maintenance.title}</span>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <p class="max-w-md">{maintenance.title}</p>
                    {#if maintenance.description}
                      <p class="text-muted-foreground mt-1 text-sm">{maintenance.description}</p>
                    {/if}
                  </Tooltip.Content>
                </Tooltip.Root>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" class="gap-1">
                  {#if isOneTime(maintenance.rrule)}
                    <CalendarIcon class="size-3" />
                    {$t("manage.maintenances.type_one_time")}
                  {:else}
                    <RepeatIcon class="size-3" />
                    {$t("manage.maintenances.type_recurring")}
                  {/if}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    <div class="flex items-center gap-1">
                      <ClockIcon class="text-muted-foreground size-3" />
                      <span class="text-muted-foreground text-sm">{formatDuration(maintenance.duration_seconds)}</span>
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <div class="text-sm">
                      <div>
                        <span class="text-muted-foreground">Start:</span>
                        {format(new Date(maintenance.start_date_time * 1000), "yyyy-MM-dd HH:mm")}
                      </div>
                      <div>
                        <span class="text-muted-foreground">Duration:</span>
                        {formatDuration(maintenance.duration_seconds)}
                      </div>
                      <div>
                        <span class="text-muted-foreground">RRULE:</span>
                        {maintenance.rrule}
                      </div>
                    </div>
                  </Tooltip.Content>
                </Tooltip.Root>
              </Table.Cell>
              <Table.Cell>
                {#if maintenance.monitors && maintenance.monitors.length > 0}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <div class="flex items-center gap-1">
                        <BlendIcon class="text-muted-foreground size-3" />
                        <span class="text-sm">{maintenance.monitors.length}</span>
                      </div>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <div class="text-sm">
                        {#each maintenance.monitors as monitor}
                          <div>{monitor.monitor_tag}</div>
                        {/each}
                      </div>
                    </Tooltip.Content>
                  </Tooltip.Root>
                {:else}
                  <span class="text-muted-foreground text-sm">{$t("manage.maintenances.none")}</span>
                {/if}
              </Table.Cell>
              <Table.Cell>
                {#if maintenance.upcoming_event}
                  {@const displayStatus = getEventDisplayStatus(maintenance.upcoming_event)}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <span class="rounded px-2 py-0.5 text-xs font-semibold {displayStatus.colorClass}">
                        {displayStatus.label}
                      </span>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <div class="text-sm">
                        <div>
                          <span class="text-muted-foreground">Start:</span>
                          {format(new Date(maintenance.upcoming_event.start_date_time * 1000), "MMM d, yyyy HH:mm")}
                        </div>
                        <div>
                          <span class="text-muted-foreground">End:</span>
                          {format(new Date(maintenance.upcoming_event.end_date_time * 1000), "MMM d, yyyy HH:mm")}
                        </div>
                      </div>
                    </Tooltip.Content>
                  </Tooltip.Root>
                {:else}
                  <span class="text-muted-foreground text-sm">{$t("manage.maintenances.no_events")}</span>
                {/if}
              </Table.Cell>
              <Table.Cell>
                <span class="text-sm font-semibold {getStatusClass(maintenance.status)}">
                  {maintenance.status}
                </span>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={(e) => {
                    e.stopPropagation();
                    openMaintenance(maintenance.id);
                  }}
                >
                  <PencilIcon class="mr-1 size-4" />{$t("manage.common.edit")}
                </Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        {/if}
      </Table.Body>
    </Table.Root>
  </div>

  <!-- Pagination -->
  {#if totalCount > 0}
    {@const startItem = (pageNo - 1) * limit + 1}
    {@const endItem = Math.min(pageNo * limit, totalCount)}
    <div class="flex items-center justify-between">
      <span class="text-muted-foreground text-sm">{$t("manage.common.showing")} {startItem}-{endItem} {$t("manage.common.of")} {totalCount}</span>
      {#if totalPages > 1}
        <div class="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={pageNo === 1} onclick={() => goToPage(pageNo - 1)}>
            <ChevronLeftIcon class="size-4" />
          </Button>
          <div class="flex items-center gap-1">
            {#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
              {#if page === 1 || page === totalPages || (page >= pageNo - 1 && page <= pageNo + 1)}
                <Button variant={page === pageNo ? "default" : "ghost"} size="sm" onclick={() => goToPage(page)}>
                  {page}
                </Button>
              {:else if page === pageNo - 2 || page === pageNo + 2}
                <span class="text-muted-foreground px-1">...</span>
              {/if}
            {/each}
          </div>
          <Button variant="outline" size="icon" disabled={pageNo === totalPages} onclick={() => goToPage(pageNo + 1)}>
            <ChevronRightIcon class="size-4" />
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</div>
