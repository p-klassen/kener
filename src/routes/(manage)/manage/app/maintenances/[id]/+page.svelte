<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import SaveIcon from "@lucide/svelte/icons/save";
  import Loader from "@lucide/svelte/icons/loader";
  import TrashIcon from "@lucide/svelte/icons/trash";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import RepeatIcon from "@lucide/svelte/icons/repeat";
  import InfoIcon from "@lucide/svelte/icons/info";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import PlayCircleIcon from "@lucide/svelte/icons/play-circle";
  import type { PageProps } from "./$types";
  import type { MonitorRecord } from "$lib/server/types/db.js";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { format, formatDistanceToNow, isPast, isFuture, isWithinInterval, addDays } from "date-fns";
  import { rrulestr } from "rrule";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";

  let { params }: PageProps = $props();
  const isNew = $derived(params.id === "new");

  // Types
  interface MaintenanceEvent {
    id: number;
    maintenance_id: number;
    start_date_time: number;
    end_date_time: number;
    status: string;
  }

  // Form state
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  // Schedule type for UI switching
  type ScheduleType = "ONE_TIME" | "RECURRING";
  let scheduleType = $state<ScheduleType>("ONE_TIME");

  // Maintenance data
  let maintenance = $state<{
    id: number;
    title: string;
    description: string;
    start_date_time: number;
    rrule: string;
    duration_seconds: number;
    status: "ACTIVE" | "INACTIVE";
    is_global: string;
  }>({
    id: 0,
    title: "",
    description: "",
    start_date_time: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    rrule: "FREQ=MINUTELY;COUNT=1",
    duration_seconds: 3600, // 1 hour default
    status: "ACTIVE",
    is_global: "YES"
  });

  // For datetime input
  let startDateTimeLocal = $state("");

  // Duration inputs (for easier UI)
  let durationHours = $state(1);
  let durationMinutes = $state(0);

  // Custom RRULE input for recurring
  let customRrule = $state("FREQ=WEEKLY;BYDAY=SU");

  // Sample RRULE patterns
  const sampleRrules = [
    { labelKey: "manage.maintenance_detail.pattern_every_sunday", value: "FREQ=WEEKLY;BYDAY=SU" },
    { labelKey: "manage.maintenance_detail.pattern_every_day", value: "FREQ=DAILY" },
    { labelKey: "manage.maintenance_detail.pattern_weekdays", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    { labelKey: "manage.maintenance_detail.pattern_every_monday", value: "FREQ=WEEKLY;BYDAY=MO" },
    { labelKey: "manage.maintenance_detail.pattern_biweekly", value: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" },
    { labelKey: "manage.maintenance_detail.pattern_first_of_month", value: "FREQ=MONTHLY;BYMONTHDAY=1" }
  ];

  // Monitor selection
  type MonitorStatus = "UP" | "DOWN" | "DEGRADED" | "MAINTENANCE";
  interface SelectedMonitor {
    tag: string;
    status: MonitorStatus;
  }
  let availableMonitors = $state<MonitorRecord[]>([]);
  let selectedMonitors = $state<SelectedMonitor[]>([]);

  // Derived for backward compatibility
  const selectedMonitorTags = $derived(selectedMonitors.map((m) => m.tag));

  // Events for existing maintenance
  let events = $state<MaintenanceEvent[]>([]);
  let loadingEvents = $state(false);

  // Convert timestamp to local datetime string for input
  function timestampToLocalDatetime(ts: number): string {
    const date = new Date(ts * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Convert local datetime string to timestamp
  function localDatetimeToTimestamp(datetime: string): number {
    if (!datetime) return Math.floor(Date.now() / 1000);
    const date = new Date(datetime);
    return Math.floor(date.getTime() / 1000);
  }

  // Get the RRULE to use
  function getRrule(): string {
    if (scheduleType === "ONE_TIME") {
      return "FREQ=MINUTELY;COUNT=1";
    }
    return customRrule;
  }

  // Parse RRULE string for UI
  function parseRrule(rrule: string) {
    if (rrule.includes("COUNT=1")) {
      scheduleType = "ONE_TIME";
    } else {
      scheduleType = "RECURRING";
      customRrule = rrule;
    }
  }

  // Generate preview dates based on RRULE and start time
  function getPreviewDates(): string[] {
    if (scheduleType === "ONE_TIME" || !startDateTimeLocal || !customRrule.trim()) {
      return [];
    }

    try {
      const dtstart = new Date(startDateTimeLocal);
      const fullRrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:${customRrule}`;
      const rule = rrulestr(fullRrule);
      const now = new Date();
      const windowEnd = addDays(now, 30);
      const occurrences = rule.between(now, windowEnd, true).slice(0, 5);
      return occurrences.map((d) => format(d, "EEE, MMM d, yyyy 'at' h:mm a"));
    } catch (e) {
      return [];
    }
  }

  // Validate RRULE format
  function validateRrule(): string | null {
    if (scheduleType === "ONE_TIME" || !customRrule.trim()) {
      return null;
    }

    try {
      const dtstart = new Date();
      const fullRrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, "").split(".")[0]}Z\nRRULE:${customRrule}`;
      rrulestr(fullRrule);
      return null;
    } catch (e) {
      return "Invalid RRULE format";
    }
  }

  // Reactive preview dates
  const previewDates = $derived.by(() => getPreviewDates());

  // Reactive RRULE error
  const rruleError = $derived.by(() => validateRrule());

  // Calculate duration_seconds from hours and minutes
  const calculatedDurationSeconds = $derived(durationHours * 3600 + durationMinutes * 60);

  // Update duration inputs when duration_seconds changes
  function updateDurationInputs(seconds: number) {
    durationHours = Math.floor(seconds / 3600);
    durationMinutes = Math.floor((seconds % 3600) / 60);
  }

  // Validation
  const isValid = $derived.by(() => {
    if (!maintenance.title.trim()) return false;
    if (!startDateTimeLocal) return false;
    if (calculatedDurationSeconds <= 0) return false;
    if (scheduleType === "RECURRING" && (!customRrule.trim() || rruleError)) return false;
    return true;
  });

  // Fetch maintenance data
  async function fetchMaintenance() {
    if (isNew) {
      // Set default start time
      const now = new Date();
      now.setMinutes(now.getMinutes() + 60);
      startDateTimeLocal = timestampToLocalDatetime(Math.floor(now.getTime() / 1000));
      loading = false;
      return;
    }

    loading = true;
    error = null;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMaintenance", data: { id: parseInt(params.id) } })
      });
      const result = await response.json();
      if (result.error) {
        error = result.error;
      } else if (result) {
        maintenance = {
          id: result.id,
          title: result.title,
          description: result.description || "",
          start_date_time: result.start_date_time,
          rrule: result.rrule,
          duration_seconds: result.duration_seconds,
          status: result.status,
          is_global: result.is_global || "YES"
        };

        // Parse RRULE for UI
        parseRrule(result.rrule);

        // Set UI values
        startDateTimeLocal = timestampToLocalDatetime(result.start_date_time);
        updateDurationInputs(result.duration_seconds);

        // Set monitors with their statuses
        if (result.monitors) {
          selectedMonitors = result.monitors.map((m: { monitor_tag: string; monitor_impact: MonitorStatus }) => ({
            tag: m.monitor_tag,
            status: m.monitor_impact || "MAINTENANCE"
          }));
        }

        events = result.events || [];
      } else {
        error = "Maintenance not found";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch maintenance";
    } finally {
      loading = false;
    }
  }

  // Fetch events
  async function fetchEvents() {
    loadingEvents = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMaintenanceEvents", data: { maintenance_id: parseInt(params.id) } })
      });
      const result = await response.json();
      if (!result.error) {
        events = result;
      }
    } catch {
      // Ignore errors
    } finally {
      loadingEvents = false;
    }
  }

  // Fetch available monitors
  async function fetchAvailableMonitors() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMonitors", data: { status: "ACTIVE" } })
      });
      const result = await response.json();
      if (!result.error) {
        availableMonitors = result;
      }
    } catch {
      // Ignore errors
    }
  }

  // Save maintenance
  async function saveMaintenance() {
    if (!isValid) return;
    saving = true;
    error = null;

    try {
      const rrule = getRrule();
      const startTime = localDatetimeToTimestamp(startDateTimeLocal);

      if (isNew) {
        const createData = {
          title: maintenance.title,
          description: maintenance.description || null,
          start_date_time: startTime,
          rrule,
          duration_seconds: calculatedDurationSeconds,
          monitors: selectedMonitors.map((m) => ({ monitor_tag: m.tag, monitor_impact: m.status })),
          is_global: maintenance.is_global
        };

        const response = await fetch(clientResolver(resolve, "/manage/api"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createMaintenance", data: createData })
        });
        const result = await response.json();
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success($t("manage.maintenance_detail.created_toast"));
          goto(clientResolver(resolve, `/manage/app/maintenances/${result.maintenance_id}`));
        }
      } else {
        const updateData = {
          id: maintenance.id,
          title: maintenance.title,
          description: maintenance.description || null,
          start_date_time: startTime,
          rrule,
          duration_seconds: calculatedDurationSeconds,
          status: maintenance.status,
          monitors: selectedMonitors.map((m) => ({ monitor_tag: m.tag, monitor_impact: m.status })),
          is_global: maintenance.is_global
        };

        const response = await fetch(clientResolver(resolve, "/manage/api"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "updateMaintenance", data: updateData })
        });
        const result = await response.json();
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success($t("manage.maintenance_detail.updated_toast"));
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      saving = false;
    }
  }

  // Delete maintenance
  async function deleteMaintenance() {
    if (!confirm($t("manage.maintenance_detail.delete_confirm"))) return;

    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteMaintenance", data: { id: maintenance.id } })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.maintenance_detail.deleted_toast"));
        goto(clientResolver(resolve, "/manage/app/maintenances"));
      }
    } catch {
      toast.error($t("manage.maintenance_detail.delete_error"));
    }
  }

  // Delete event
  async function deleteEvent(eventId: number) {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteMaintenanceEvent", data: { id: eventId } })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.maintenance_detail.event_deleted_toast"));
        await fetchEvents();
      }
    } catch {
      toast.error("Failed to delete event");
    }
  }

  // Compute event display status based on current time
  interface EventDisplayStatus {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: "clock" | "play" | "check";
  }

  function getEventDisplayStatus(event: MaintenanceEvent): EventDisplayStatus {
    const now = new Date();
    const startDate = new Date(event.start_date_time * 1000);
    const endDate = new Date(event.end_date_time * 1000);

    // Check if currently ongoing
    if (isWithinInterval(now, { start: startDate, end: endDate })) {
      return {
        label: $t("manage.maintenance_detail.event_ongoing"),
        variant: "default",
        icon: "play"
      };
    }

    // Check if in the future (upcoming)
    if (isFuture(startDate)) {
      const distance = formatDistanceToNow(startDate, { addSuffix: false });
      return {
        label: `Upcoming • starts in ${distance}`,
        variant: "outline",
        icon: "clock"
      };
    }

    // If in the past (completed)
    if (isPast(endDate)) {
      return {
        label: $t("manage.maintenance_detail.event_completed"),
        variant: "secondary",
        icon: "check"
      };
    }

    // Fallback
    return {
      label: $t("manage.maintenance_detail.event_scheduled"),
      variant: "outline",
      icon: "clock"
    };
  }

  // Toggle monitor selection
  function toggleMonitor(tag: string) {
    const existing = selectedMonitors.find((m) => m.tag === tag);
    if (existing) {
      selectedMonitors = selectedMonitors.filter((m) => m.tag !== tag);
    } else {
      selectedMonitors = [...selectedMonitors, { tag, status: "MAINTENANCE" }];
    }
  }

  // Update monitor status locally
  function updateMonitorStatus(tag: string, status: MonitorStatus) {
    selectedMonitors = selectedMonitors.map((m) => (m.tag === tag ? { ...m, status } : m));
  }

  // Get monitor name by tag
  function getMonitorName(tag: string): string {
    const monitor = availableMonitors.find((m) => m.tag === tag);
    return monitor?.name || tag;
  }

  $effect(() => {
    fetchMaintenance();
    fetchAvailableMonitors();
  });
</script>

<div class="container space-y-6 py-6">
  <div class="flex justify-between gap-2">
    <!-- Breadcrumb -->
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href={clientResolver(resolve, "/manage/app/maintenances")}>{$t("manage.maintenance_detail.breadcrumb")}</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{isNew ? $t("manage.maintenance_detail.new_title") : `Edit #${params.id}`}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>
    <div>
      {#if !isNew}
        <Button
          variant="outline"
          target="_blank"
          size="sm"
          class="mr-2"
          href={clientResolver(resolve, `/maintenances/${maintenance.id}?type=maintenance`)}
        >
          {$t("manage.maintenance_detail.view_button")}
        </Button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="pt-6">
        <div class="flex items-center gap-2">
          <AlertTriangleIcon class="text-destructive size-5" />
          <p class="text-destructive">{error}</p>
        </div>
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Main Details Card -->
    <Card.Root>
      <Card.Header>
        <Card.Title>{isNew ? $t("manage.maintenance_detail.create_card_title") : "Maintenance Details"}</Card.Title>
        <Card.Description>
          {#if isNew}
            {$t("manage.maintenance_detail.create_card_desc")}
          {:else}
            {$t("manage.maintenance_detail.edit_card_desc")}
          {/if}
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Schedule Type Selection -->
        <div class="flex flex-col gap-3">
          <Label>{$t("manage.maintenance_detail.schedule_type")} <span class="text-destructive">*</span></Label>
          <RadioGroup.Root bind:value={scheduleType} class="flex gap-6">
            <div class="flex items-center gap-2">
              <RadioGroup.Item value="ONE_TIME" id="type-onetime" />
              <Label for="type-onetime" class="flex cursor-pointer items-center gap-2 font-normal">
                <CalendarIcon class="size-4" />
                {$t("manage.maintenance_detail.one_time")}
              </Label>
            </div>
            <div class="flex items-center gap-2">
              <RadioGroup.Item value="RECURRING" id="type-recurring" />
              <Label for="type-recurring" class="flex cursor-pointer items-center gap-2 font-normal">
                <RepeatIcon class="size-4" />
                {$t("manage.maintenance_detail.recurring")}
              </Label>
            </div>
          </RadioGroup.Root>
        </div>

        <!-- Title -->
        <div class="flex flex-col gap-2">
          <Label for="title">{$t("manage.maintenance_detail.title_label")} <span class="text-destructive">*</span></Label>
          <Input id="title" bind:value={maintenance.title} placeholder={$t("manage.maintenance_detail.title_placeholder")} />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-2">
          <Label for="description">{$t("manage.maintenance_detail.description_label")}</Label>
          <Textarea
            id="description"
            bind:value={maintenance.description}
            placeholder={$t("manage.maintenance_detail.description_placeholder")}
            rows={3}
          />
        </div>

        <!-- Global Visibility -->
        <div class="flex items-center justify-between rounded-md border p-3">
          <div class="flex flex-col gap-1">
            <Label for="is-global">{$t("manage.maintenance_detail.global_label")}</Label>
            <p class="text-muted-foreground text-xs">
              {$t("manage.maintenance_detail.global_desc")}
            </p>
          </div>
          <Switch
            id="is-global"
            checked={maintenance.is_global === "YES"}
            onCheckedChange={(checked) => {
              maintenance.is_global = checked ? "YES" : "NO";
            }}
          />
        </div>

        <!-- Start Date/Time -->
        <div class="flex flex-col gap-2">
          <Label for="start-time">
            {scheduleType === "ONE_TIME" ? $t("manage.maintenance_detail.start_datetime") : $t("manage.maintenance_detail.first_occurrence")}
            <span class="text-destructive">*</span>
          </Label>
          <Input id="start-time" type="datetime-local" bind:value={startDateTimeLocal} />
          {#if scheduleType === "RECURRING"}
            <p class="text-muted-foreground text-xs">
              {$t("manage.maintenance_detail.recurring_time_note")}
            </p>
          {/if}
        </div>

        <!-- Duration -->
        <div class="flex flex-col gap-2">
          <Label>{$t("manage.maintenance_detail.duration_label")} <span class="text-destructive">*</span></Label>
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-1">
              <Input type="number" min={0} max={72} class="w-20" bind:value={durationHours} />
              <span class="text-muted-foreground text-sm">{$t("manage.maintenance_detail.hours")}</span>
            </div>
            <div class="flex items-center gap-1">
              <Input type="number" min={0} max={59} class="w-20" bind:value={durationMinutes} />
              <span class="text-muted-foreground text-sm">{$t("manage.maintenance_detail.minutes")}</span>
            </div>
          </div>
          <p class="text-muted-foreground text-xs">
            Total: {calculatedDurationSeconds} seconds ({Math.floor(calculatedDurationSeconds / 60)} minutes)
          </p>
        </div>

        <!-- RRULE Configuration -->
        <Card.Root class="bg-muted/50">
          <Card.Header class="pb-3">
            <Card.Title class="flex items-center gap-2 text-base">
              <InfoIcon class="size-4" />
              {scheduleType === "ONE_TIME" ? $t("manage.maintenance_detail.schedule_pattern_title") : $t("manage.maintenance_detail.rrule_section_title")}
            </Card.Title>
          </Card.Header>
          <Card.Content class="space-y-4">
            {#if scheduleType === "ONE_TIME"}
              <!-- One-time: Show readonly RRULE -->
              <div class="flex flex-col gap-2">
                <Label class="text-muted-foreground text-xs">{$t("manage.maintenance_detail.rrule_auto_label")}</Label>
                <Input value="FREQ=MINUTELY;COUNT=1" disabled class="bg-muted font-mono text-sm" />
                <p class="text-muted-foreground text-xs">
                  {$t("manage.maintenance_detail.rrule_one_time_note")}
                </p>
              </div>
            {:else}
              <!-- Recurring: Editable RRULE -->
              <div class="flex flex-col gap-2">
                <Label for="rrule">{$t("manage.maintenance_detail.rrule_label")} <span class="text-destructive">*</span></Label>
                <Input
                  id="rrule"
                  bind:value={customRrule}
                  placeholder="FREQ=WEEKLY;BYDAY=SU"
                  class={rruleError ? "border-destructive" : ""}
                />
                {#if rruleError}
                  <p class="text-destructive text-xs">{rruleError}</p>
                {/if}
              </div>

              <!-- Sample Patterns -->
              {#if isNew}
                <div class="flex flex-col gap-2">
                  <Label class="text-muted-foreground text-xs">{$t("manage.maintenance_detail.quick_patterns")}</Label>
                  <div class="flex flex-wrap gap-2">
                    {#each sampleRrules as sample}
                      <Button
                        variant={customRrule === sample.value ? "default" : "outline"}
                        size="sm"
                        onclick={() => (customRrule = sample.value)}
                      >
                        {$t(sample.labelKey)}
                      </Button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Preview Dates -->
              {#if previewDates.length > 0}
                <div class="bg-background rounded-md border p-3">
                  <Label class="text-muted-foreground text-xs">{$t("manage.maintenance_detail.upcoming_occurrences")}</Label>
                  <ul class="mt-2 space-y-1 text-sm">
                    {#each previewDates as date}
                      <li class="flex items-center gap-2">
                        <CalendarIcon class="text-muted-foreground size-3" />
                        {date}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/if}
          </Card.Content>
        </Card.Root>

        <!-- Monitor Selection -->
        <div class="flex flex-col gap-3">
          <Label>{$t("manage.maintenance_detail.affected_monitors")}</Label>

          <!-- Available monitors to add -->
          <div class="rounded-md border p-3">
            <Label class="text-muted-foreground mb-2 block text-xs">{$t("manage.maintenance_detail.select_monitors_label")}</Label>
            <div class="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto">
              {#each availableMonitors as monitor}
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="monitor-{monitor.tag}"
                    checked={selectedMonitorTags.includes(monitor.tag)}
                    onCheckedChange={() => toggleMonitor(monitor.tag)}
                  />
                  <Label for="monitor-{monitor.tag}" class="cursor-pointer text-sm font-normal">
                    {monitor.name}
                  </Label>
                </div>
              {/each}
              {#if availableMonitors.length === 0}
                <p class="text-muted-foreground col-span-2 text-sm">{$t("manage.maintenance_detail.no_monitors")}</p>
              {/if}
            </div>
          </div>

          <!-- Selected monitors with status -->
          {#if selectedMonitors.length > 0}
            <div class="rounded-md border p-3">
              <Label class="text-muted-foreground mb-2 block text-xs">{$t("manage.maintenance_detail.monitor_status_label")}</Label>
              <div class="space-y-2">
                {#each selectedMonitors as selectedMonitor, index}
                  {@const currentStatus = selectedMonitor.status}
                  <div class="bg-muted/30 flex items-center justify-between gap-3 rounded border p-2">
                    <span class="text-sm font-medium">{getMonitorName(selectedMonitor.tag)}</span>
                    <Select.Root
                      type="single"
                      value={currentStatus}
                      onValueChange={(value) => {
                        if (value) {
                          selectedMonitors[index].status = value as MonitorStatus;
                          selectedMonitors = [...selectedMonitors];
                        }
                      }}
                    >
                      <Select.Trigger class="h-8 w-36 text-xs">
                        {currentStatus}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="UP">UP</Select.Item>
                        <Select.Item value="DOWN">DOWN</Select.Item>
                        <Select.Item value="DEGRADED">DEGRADED</Select.Item>
                        <Select.Item value="MAINTENANCE">MAINTENANCE</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          <p class="text-muted-foreground text-xs">
            {$t("manage.maintenance_detail.status_during_note")}
          </p>
        </div>

        <!-- Status Toggle (only for existing) -->
        {#if !isNew}
          <div class="flex flex-col gap-2">
            <Label>{$t("manage.maintenance_detail.status_label")}</Label>
            <div class="flex gap-2">
              <Button
                variant={maintenance.status === "ACTIVE" ? "default" : "outline"}
                size="sm"
                onclick={() => (maintenance.status = "ACTIVE")}
              >
                Active
              </Button>
              <Button
                variant={maintenance.status === "INACTIVE" ? "default" : "outline"}
                size="sm"
                onclick={() => (maintenance.status = "INACTIVE")}
              >
                Inactive
              </Button>
            </div>
          </div>
        {/if}
      </Card.Content>
      <Card.Footer class="flex justify-end gap-2">
        {#if !isNew}
          <Button variant="destructive" onclick={deleteMaintenance}>
            <TrashIcon class="size-4" />
            {$t("manage.maintenance_detail.delete_button")}
          </Button>
        {/if}
        <Button onclick={saveMaintenance} disabled={saving || !isValid}>
          {#if saving}
            <Loader class="size-4 animate-spin" />
          {:else}
            <SaveIcon class="size-4" />
          {/if}
          {isNew ? $t("manage.maintenance_detail.create_button") : $t("manage.maintenance_detail.save_button")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Events Section (only for existing) -->
    {#if !isNew}
      <Card.Root>
        <Card.Header>
          <div>
            <Card.Title>{$t("manage.maintenance_detail.events_title")}</Card.Title>
            <Card.Description>{$t("manage.maintenance_detail.events_desc")}</Card.Description>
          </div>
        </Card.Header>
        <Card.Content>
          {#if loadingEvents}
            <div class="flex justify-center py-4">
              <Spinner class="size-6" />
            </div>
          {:else if events.length === 0}
            <p class="text-muted-foreground py-4 text-center text-sm">
              {$t("manage.maintenance_detail.no_events")}
            </p>
          {:else}
            <div class="space-y-3">
              {#each events as event}
                {@const displayStatus = getEventDisplayStatus(event)}
                <div class="flex items-center justify-between rounded-md border p-4">
                  <div class="flex items-center gap-3">
                    <div class="bg-muted flex size-8 items-center justify-center rounded-full">
                      {#if displayStatus.icon === "play"}
                        <PlayCircleIcon class="text-primary size-4" />
                      {:else if displayStatus.icon === "check"}
                        <CheckCircleIcon class="text-muted-foreground size-4" />
                      {:else}
                        <ClockIcon class="text-muted-foreground size-4" />
                      {/if}
                    </div>
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
                      </div>
                      <p class="text-muted-foreground text-sm">
                        {format(new Date(event.start_date_time * 1000), "MMM d, yyyy HH:mm")}
                        →
                        {format(new Date(event.end_date_time * 1000), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onclick={() => deleteEvent(event.id)}>
                    <TrashIcon class="size-4" />
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}
  {/if}
</div>
