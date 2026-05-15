<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import SaveIcon from "@lucide/svelte/icons/save";
  import Loader from "@lucide/svelte/icons/loader";
  import type { MonitorRecord } from "$lib/server/types/db.js";
  import type { SiteMonitorDefaults } from "$lib/types/site.js";
  import { toast } from "svelte-sonner";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";

  interface Props {
    monitor: MonitorRecord;
    typeData: Record<string, unknown>;
    statusHistoryDays: {
      desktop: number | null;
      mobile: number | null;
    };
    monitorDefaults: SiteMonitorDefaults;
  }

  let { monitor = $bindable(), typeData, statusHistoryDays = $bindable(), monitorDefaults }: Props = $props();

  let saving = $state(false);

  const isValid = $derived(
    (statusHistoryDays.desktop === null || (statusHistoryDays.desktop >= 1 && statusHistoryDays.desktop <= 365)) &&
    (statusHistoryDays.mobile === null || (statusHistoryDays.mobile >= 1 && statusHistoryDays.mobile <= 365))
  );

  async function save() {
    if (!isValid) {
      toast.error("Days must be between 1 and 365");
      return;
    }

    saving = true;
    try {
      let existingSettings: Record<string, unknown> = {};
      if (monitor.monitor_settings_json) {
        try {
          existingSettings = JSON.parse(monitor.monitor_settings_json);
        } catch {
          existingSettings = {};
        }
      }

      const mergedSettings = {
        ...existingSettings,
        monitor_status_history_days: {
          desktop: statusHistoryDays.desktop,
          mobile: statusHistoryDays.mobile,
        },
      };

      const payload = {
        ...monitor,
        type_data: JSON.stringify(typeData),
        monitor_settings_json: JSON.stringify(mergedSettings),
      };

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "storeMonitorData", data: payload }),
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        monitor.monitor_settings_json = JSON.stringify(mergedSettings);
        toast.success("Status history settings saved successfully");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save status history settings";
      toast.error(message);
    } finally {
      saving = false;
    }
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Status History Days</Card.Title>
    <Card.Description>
      Configure how many days of status history to display by default when this monitor loads on a status page.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
      <!-- Desktop -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <Label for="monitor-history-desktop">Desktop (days)</Label>
          {#if statusHistoryDays.desktop === null}
            <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
              {$t("manage.page_detail.site_default_badge")}
            </span>
          {:else}
            <span class="rounded border px-1.5 py-0.5 text-xs">
              {$t("manage.page_detail.custom_badge")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-2 text-xs"
              onclick={() => { statusHistoryDays.desktop = null; }}
            >
              {$t("manage.page_detail.reset_to_default")}
            </Button>
          {/if}
        </div>
        <Input
          id="monitor-history-desktop"
          type="number"
          min="1"
          max="365"
          value={statusHistoryDays.desktop ?? ""}
          placeholder={String(monitorDefaults.monitor_status_history_days.desktop)}
          class={statusHistoryDays.desktop !== null && (statusHistoryDays.desktop < 1 || statusHistoryDays.desktop > 365) ? "border-destructive" : ""}
          oninput={(e) => {
            const v = parseInt((e.currentTarget as HTMLInputElement).value);
            statusHistoryDays.desktop = isNaN(v) ? null : v;
          }}
        />
        <p class="text-muted-foreground text-xs">Number of days shown on desktop screens</p>
      </div>

      <!-- Mobile -->
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <Label for="monitor-history-mobile">Mobile (days)</Label>
          {#if statusHistoryDays.mobile === null}
            <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
              {$t("manage.page_detail.site_default_badge")}
            </span>
          {:else}
            <span class="rounded border px-1.5 py-0.5 text-xs">
              {$t("manage.page_detail.custom_badge")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-2 text-xs"
              onclick={() => { statusHistoryDays.mobile = null; }}
            >
              {$t("manage.page_detail.reset_to_default")}
            </Button>
          {/if}
        </div>
        <Input
          id="monitor-history-mobile"
          type="number"
          min="1"
          max="365"
          value={statusHistoryDays.mobile ?? ""}
          placeholder={String(monitorDefaults.monitor_status_history_days.mobile)}
          class={statusHistoryDays.mobile !== null && (statusHistoryDays.mobile < 1 || statusHistoryDays.mobile > 365) ? "border-destructive" : ""}
          oninput={(e) => {
            const v = parseInt((e.currentTarget as HTMLInputElement).value);
            statusHistoryDays.mobile = isNaN(v) ? null : v;
          }}
        />
        <p class="text-muted-foreground text-xs">Number of days shown on mobile screens</p>
      </div>
    </div>
  </Card.Content>
  <Card.Footer class="flex justify-end border-t pt-6">
    <Button onclick={save} disabled={saving || !isValid}>
      {#if saving}
        <Loader class="size-4 animate-spin" />
      {:else}
        <SaveIcon class="size-4" />
      {/if}
      Save Status History Settings
    </Button>
  </Card.Footer>
</Card.Root>
