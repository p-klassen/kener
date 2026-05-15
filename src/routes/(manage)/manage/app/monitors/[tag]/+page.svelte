<script lang="ts">
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import type { PageProps } from "./$types";
  import type { MonitorRecord } from "$lib/server/types/db.js";
  import type { MonitorType } from "$lib/types/monitor.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import * as Accordion from "$lib/components/ui/accordion/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import type { SiteSubMenuOptions, SiteMonitorDefaults } from "$lib/types/site";
  import { t } from "$lib/stores/i18n";

  // Card components
  import GeneralSettingsCard from "./components/GeneralSettingsCard.svelte";
  import MonitorTypeCard from "./components/MonitorTypeCard.svelte";
  import UptimeSettingsCard from "./components/UptimeSettingsCard.svelte";
  import PageVisibilityCard from "./components/PageVisibilityCard.svelte";
  import ModifyDataCard from "./components/ModifyDataCard.svelte";
  import DangerZoneCard from "./components/DangerZoneCard.svelte";
  import MonitorRecentLogs from "./components/MonitorRecentLogs.svelte";
  import StatusHistoryDaysCard from "./components/StatusHistoryDaysCard.svelte";
  import MonitorSharingOptionsCard from "./components/MonitorSharingOptionsCard.svelte";

  let { params }: PageProps = $props();
  const isNew = $derived(params.tag === "new");

  const SYSTEM_MONITOR_DEFAULTS: SiteMonitorDefaults = {
    uptime_formula_numerator: "up + maintenance",
    uptime_formula_denominator: "up + maintenance + down + degraded",
    monitor_status_history_days: { desktop: 90, mobile: 30 },
    sharing_options: { showShareBadgeMonitor: false, showShareEmbedMonitor: false },
  };

  let monitorDefaults = $state<SiteMonitorDefaults>(structuredClone(SYSTEM_MONITOR_DEFAULTS));

  // Form state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let availableMonitors = $state<MonitorRecord[]>([]);
  let subMenuOptions = $state<SiteSubMenuOptions | null>(null);

  // Uptime settings state
  let uptimeSettings = $state({
    uptime_formula_numerator: "up + maintenance",
    uptime_formula_denominator: "up + maintenance + down + degraded"
  });

  // Status history days state
  let statusHistoryDays = $state<{ desktop: number | null; mobile: number | null }>({
    desktop: null,
    mobile: null,
  });

  // Pages state
  interface PageWithMonitors {
    id: number;
    page_path: string;
    page_title: string;
    monitors?: { monitor_tag: string }[];
  }
  let allPages = $state<PageWithMonitors[]>([]);

  // Monitor data
  let monitor = $state<MonitorRecord>({
    id: 0,
    tag: "",
    name: "",
    description: "",
    image: "",
    cron: "* * * * *",
    default_status: "UP",
    status: "ACTIVE",
    category_name: "Home",
    monitor_type: "" as MonitorType,
    is_hidden: "NO",
    is_public: 1,
    monitor_settings_json: "",
    external_url: ""
  });

  // Type-specific data
  let typeData = $state<Record<string, unknown>>({});

  // Get pages this monitor is on
  const monitorPages = $derived(allPages.filter((p) => p.monitors?.some((m) => m.monitor_tag === monitor.tag)));

  async function fetchMonitor() {
    if (isNew) {
      loading = false;
      return;
    }

    loading = true;
    error = null;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMonitors", data: { tag: params.tag } })
      });
      const result = await response.json();
      if (result.error) {
        error = result.error;
      } else if (result.length > 0) {
        const m = result[0];
        monitor = {
          id: m.id,
          tag: m.tag,
          name: m.name,
          description: m.description || "",
          image: m.image || "",
          cron: m.cron || "* * * * *",
          default_status: m.default_status || "UP",
          status: m.status || "ACTIVE",
          category_name: m.category_name || "Home",
          monitor_type: m.monitor_type || "",
          is_hidden: m.is_hidden || "NO",
          is_public: m.is_public ?? 1,
          monitor_settings_json: m.monitor_settings_json || "",
          external_url: m.external_url || ""
        };
        // Parse type_data
        if (m.type_data) {
          try {
            typeData = JSON.parse(m.type_data);
          } catch (e) {
            console.error("Failed to parse type_data:", e);
            typeData = {};
          }
        }
        // Parse monitor_settings_json
        if (m.monitor_settings_json) {
          try {
            const settings = JSON.parse(m.monitor_settings_json);
            uptimeSettings = {
              uptime_formula_numerator: settings.uptime_formula_numerator || "up + maintenance",
              uptime_formula_denominator: settings.uptime_formula_denominator || "up + maintenance + down + degraded"
            };
            if (settings.monitor_status_history_days) {
              statusHistoryDays = {
                desktop: settings.monitor_status_history_days.desktop ?? null,
                mobile: settings.monitor_status_history_days.mobile ?? null,
              };
            }
          } catch (e) {
            console.error("Failed to parse monitor_settings_json:", e);
          }
        }
      } else {
        error = "Monitor not found";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch monitor";
    } finally {
      loading = false;
    }
  }

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
      // Ignore errors for available monitors
    }
  }

  async function fetchPages() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPages" })
      });
      const result = await response.json();
      if (!result.error) {
        allPages = result;
      }
    } catch {
      // Ignore errors for pages
    }
  }

  //fetch sharing options from site data
  async function getSiteLevelSharingConfig() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getSiteDataByKey", data: { key: "subMenuOptions" } })
      });
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      subMenuOptions = result as SiteSubMenuOptions;
    } catch (e) {
      console.error("Failed to fetch site level sharing config:", e);
      return {};
    }
  }

  async function fetchMonitorDefaults() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getAllSiteData" }),
      });
      const data = await response.json();
      if (data.monitorDefaults) {
        const parsed =
          typeof data.monitorDefaults === "string"
            ? JSON.parse(data.monitorDefaults)
            : data.monitorDefaults;
        monitorDefaults = {
          ...SYSTEM_MONITOR_DEFAULTS,
          monitor_status_history_days: {
            desktop:
              parsed?.monitor_status_history_days?.desktop ??
              SYSTEM_MONITOR_DEFAULTS.monitor_status_history_days.desktop,
            mobile:
              parsed?.monitor_status_history_days?.mobile ??
              SYSTEM_MONITOR_DEFAULTS.monitor_status_history_days.mobile,
          },
        };
      }
    } catch (e) {
      console.error("Failed to fetch monitor defaults", e);
    }
  }

  $effect(() => {
    fetchMonitor();
    fetchAvailableMonitors();
    fetchPages();
    getSiteLevelSharingConfig();
    fetchMonitorDefaults();
  });

  let activeAccordionItem = $derived<string>(isNew ? "general" : "configuration");
  let cloneDialogOpen = $state(false);
  let cloneTag = $state("");
  let cloneName = $state("");
  let cloning = $state(false);

  function openCloneDialog() {
    cloneTag = "";
    cloneName = monitor.name ? `${monitor.name} Copy` : "Copy";
    cloneDialogOpen = true;
  }

  async function cloneMonitor() {
    const newTag = cloneTag.trim();
    const newName = cloneName.trim();

    if (!newTag || !newName) {
      toast.error("Tag and name are required");
      return;
    }

    cloning = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cloneMonitor",
          data: {
            sourceTag: monitor.tag,
            newTag,
            newName
          }
        })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Monitor cloned successfully");
      cloneDialogOpen = false;
      goto(clientResolver(resolve, `/manage/app/monitors/${newTag}`));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to clone monitor";
      toast.error(message);
    } finally {
      cloning = false;
    }
  }
</script>

<div class="flex w-full flex-col gap-4 p-4">
  <div class="mb-4 flex items-center justify-between">
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href={clientResolver(resolve, "/manage/app/monitors")}>{$t("manage.monitor_detail.breadcrumb")}</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>{isNew ? $t("manage.monitor_detail.new_title") : monitor.name || params.tag}</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>
    <div class="flex gap-2">
      {#if !isNew}
        <Button size="sm" variant="outline" onclick={openCloneDialog}>{$t("manage.monitor_detail.clone_button")}</Button>
      {/if}
      <HoverCard.Root>
        <HoverCard.Trigger>
          <Button size="sm" target="_blank" href={clientResolver(resolve, `/monitors/${params.tag}`)} variant="outline">
            {$t("manage.monitor_detail.view_button")}
          </Button>
        </HoverCard.Trigger>
        <HoverCard.Content class="w-80">
          <div class="flex justify-between space-x-4 text-xs">
            {#if monitor.is_hidden === "YES"}
              <p class="text-destructive">{$t("manage.monitor_detail.hidden_warning")}</p>
            {:else if monitor.status !== "ACTIVE"}
              <p class="text-destructive">{$t("manage.monitor_detail.inactive_warning")}</p>
            {:else}
              <p class="text-success">{$t("manage.monitor_detail.visible_success")}</p>
            {/if}
            <p class="text-xs"></p>
          </div>
        </HoverCard.Content>
      </HoverCard.Root>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else if error}
    <Card.Root class="border-destructive">
      <Card.Content class="pt-6">
        <p class="text-destructive">{error}</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Warning Alert if monitor is not on any page -->
    {#if !isNew && monitorPages.length === 0}
      <Alert.Root variant="destructive">
        <AlertTriangleIcon class="size-4" />
        <Alert.Title>{$t("manage.monitor_detail.not_visible_title")}</Alert.Title>
        <Alert.Description>
          {$t("manage.monitor_detail.not_visible_desc")}
        </Alert.Description>
      </Alert.Root>
    {/if}

    <Accordion.Root
      type="single"
      class="w-full "
      bind:value={activeAccordionItem}
      onValueChange={(value) => (activeAccordionItem = value)}
    >
      <Accordion.Item value="general">
        <Accordion.Trigger>{$t("manage.monitor_detail.section_general")}</Accordion.Trigger>
        <Accordion.Content class="flex flex-col gap-4 text-balance">
          <!-- General Settings Card -->
          <GeneralSettingsCard bind:monitor {typeData} {isNew} />
        </Accordion.Content>
      </Accordion.Item>
      {#if !isNew}
        <Accordion.Item value="configuration">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_config")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Monitor Type Configuration Card -->
            <MonitorTypeCard bind:monitor bind:typeData {availableMonitors} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="calculation">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_uptime")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Uptime Calculation Card -->
            <UptimeSettingsCard {monitor} {typeData} bind:uptimeSettings />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="status-history">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_history")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Status History Days Card -->

            <StatusHistoryDaysCard bind:monitor {typeData} bind:statusHistoryDays {monitorDefaults} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="logs-recent">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_logs")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Recent Logs Card -->

            <MonitorRecentLogs monitor_tag={params.tag} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="pages-visibility">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_visibility")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Page Visibility Card -->

            <PageVisibilityCard monitorTag={monitor.tag} {allPages} onPagesUpdated={fetchPages} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="sharing-options">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_sharing")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Monitor Sharing Options Card -->

            <MonitorSharingOptionsCard bind:monitor {typeData} {subMenuOptions} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="modify-data">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_modify")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Modify Data Card -->

            <ModifyDataCard monitorTag={monitor.tag} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
      {#if !isNew}
        <Accordion.Item value="danger-zone">
          <Accordion.Trigger>{$t("manage.monitor_detail.section_danger")}</Accordion.Trigger>
          <Accordion.Content class="flex flex-col gap-4 text-balance">
            <!-- Danger Zone Card -->

            <DangerZoneCard {monitor} status={monitor.status || "INACTIVE"} />
          </Accordion.Content>
        </Accordion.Item>
      {/if}
    </Accordion.Root>
  {/if}
</div>

<Dialog.Root bind:open={cloneDialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{$t("manage.monitor_detail.clone_dialog_title")}</Dialog.Title>
      <Dialog.Description>{$t("manage.monitor_detail.clone_dialog_desc")}</Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-2">
        <Label for="clone-tag">{$t("manage.monitor_detail.clone_tag_label")}</Label>
        <Input id="clone-tag" bind:value={cloneTag} placeholder={$t("manage.monitor_detail.clone_tag_placeholder")} />
      </div>
      <div class="space-y-2">
        <Label for="clone-name">{$t("manage.monitor_detail.clone_name_label")}</Label>
        <Input id="clone-name" bind:value={cloneName} placeholder={$t("manage.monitor_detail.clone_name_placeholder")} />
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (cloneDialogOpen = false)} disabled={cloning}>{$t("manage.common.cancel")}</Button>
      <Button onclick={cloneMonitor} disabled={cloning || !cloneTag.trim() || !cloneName.trim()}>
        {#if cloning}
          <Spinner class="size-4" />
          {$t("manage.monitor_detail.cloning")}
        {:else}
          {$t("manage.monitor_detail.clone_button")}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
