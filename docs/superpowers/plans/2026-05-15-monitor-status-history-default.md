# Monitor Status History — Default/Custom Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Site Default" / "Custom" badge and "Reset to Default" button to the Monitor Status History card, mirroring the existing Pages Display Settings pattern.

**Architecture:** Three files change. The TypeScript type gains `null` support for `desktop`/`mobile`. The parent page (`[tag]/+page.svelte`) loads the Global Monitor Default and passes it as a prop, and stops coercing `null` to `90`/`30` on load. The card component (`StatusHistoryDaysCard.svelte`) receives the default values as props, renders badge/reset UI per field, and preserves `null` through save.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, shadcn-svelte `Button`, i18n via `$t` store.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/server/types/db.ts:94-97` | `monitor_status_history_days` fields → `number \| null` |
| `src/routes/(manage)/manage/app/monitors/[tag]/+page.svelte` | Load Global Monitor Default via API; pass as prop; stop coercing `null` on parse |
| `src/routes/(manage)/manage/app/monitors/[tag]/components/StatusHistoryDaysCard.svelte` | Accept default prop; badge/reset UI; `null`-aware validation and save |

---

## Reference: Existing Pages Pattern

The Pages Display Settings (`src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte:874-960`) is the canonical example. Study it before implementing — the monitor card must look and behave identically.

Key i18n keys (already exist in `en.json`):
- `manage.page_detail.site_default_badge` → "Site default"
- `manage.page_detail.custom_badge` → "Custom"
- `manage.page_detail.reset_to_default` → "Reset to default"

Global Monitor Default is fetched via `action: "getAllSiteData"`, key `monitorDefaults`:
```typescript
const SYSTEM_MONITOR_DEFAULTS = {
  monitor_status_history_days: { desktop: 90, mobile: 30 },
};
// If monitorDefaults is present in getAllSiteData response, parse it and use its value,
// falling back to SYSTEM_MONITOR_DEFAULTS if absent.
```

---

### Task 1: Widen the TypeScript type

**Files:**
- Modify: `src/lib/server/types/db.ts:94-97`

- [ ] **Step 1: Update `MonitorSettings` interface**

In `src/lib/server/types/db.ts`, change lines 94–97 from:
```typescript
  monitor_status_history_days?: {
    desktop: number;
    mobile: number;
  };
```
to:
```typescript
  monitor_status_history_days?: {
    desktop: number | null;
    mobile: number | null;
  };
```

- [ ] **Step 2: Verify type check**

```bash
npm run check 2>&1 | grep -E "error|warning" | grep -v "toggle-group\|chart-container\|(kener)/\+page\|(kener)/\[page"
```

Expected: no new errors (the two pre-existing errors in `(kener)/+page.svelte` and `(kener)/[page_path]/+page.svelte` are unrelated and can be ignored).

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/types/db.ts
git commit -m "feat: allow null in MonitorSettings.monitor_status_history_days"
```

---

### Task 2: Load Global Monitor Default and fix null coercion in parent page

**Files:**
- Modify: `src/routes/(manage)/manage/app/monitors/[tag]/+page.svelte`

The parent page currently initialises `statusHistoryDays` to `{ desktop: 90, mobile: 30 }` and coerces parsed values with `?? 90` / `?? 30`. It needs to:
1. Track the Global Monitor Default separately as `monitorDefaults`.
2. Let `null` pass through on load (drop the `?? 90` / `?? 30` coercion).
3. Fetch `monitorDefaults` from the API on mount.
4. Pass `monitorDefaults` as a prop to `StatusHistoryDaysCard`.

- [ ] **Step 1: Add `SiteMonitorDefaults` import and default constant**

At the top of the `<script>` block (around line 21 where other type imports are), add:

```typescript
import type { SiteMonitorDefaults } from "$lib/types/site.js";
```

After the existing `const isNew = $derived(...)` line (around line 36), add:

```typescript
const SYSTEM_MONITOR_DEFAULTS: SiteMonitorDefaults = {
  uptime_formula_numerator: "up + maintenance",
  uptime_formula_denominator: "up + maintenance + down + degraded",
  monitor_status_history_days: { desktop: 90, mobile: 30 },
  sharing_options: { showShareBadgeMonitor: false, showShareEmbedMonitor: false },
};

let monitorDefaults = $state<SiteMonitorDefaults>(structuredClone(SYSTEM_MONITOR_DEFAULTS));
```

- [ ] **Step 2: Change `statusHistoryDays` initial state to use `null`**

Find (around line 51):
```typescript
  let statusHistoryDays = $state({
    desktop: 90,
    mobile: 30
  });
```

Replace with:
```typescript
  let statusHistoryDays = $state<{ desktop: number | null; mobile: number | null }>({
    desktop: null,
    mobile: null,
  });
```

- [ ] **Step 3: Fix parse logic — pass `null` through instead of coercing**

Find (around lines 141-146):
```typescript
            if (settings.monitor_status_history_days) {
              statusHistoryDays = {
                desktop: settings.monitor_status_history_days.desktop ?? 90,
                mobile: settings.monitor_status_history_days.mobile ?? 30
              };
            }
```

Replace with:
```typescript
            if (settings.monitor_status_history_days) {
              statusHistoryDays = {
                desktop: settings.monitor_status_history_days.desktop ?? null,
                mobile: settings.monitor_status_history_days.mobile ?? null,
              };
            }
```

- [ ] **Step 4: Add `fetchMonitorDefaults` function**

Add the following function after the existing `fetchMonitors` function (or any other fetch helper). The pattern mirrors the pages page (`fetchSiteDefaults`):

```typescript
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
```

- [ ] **Step 5: Call `fetchMonitorDefaults` in the `$effect` block**

Find this `$effect` block (around line 212):
```typescript
  $effect(() => {
    fetchMonitor();
    fetchAvailableMonitors();
    fetchPages();
    getSiteLevelSharingConfig();
  });
```

Add `fetchMonitorDefaults()` inside it:
```typescript
  $effect(() => {
    fetchMonitor();
    fetchAvailableMonitors();
    fetchPages();
    getSiteLevelSharingConfig();
    fetchMonitorDefaults();
  });
```

- [ ] **Step 6: Pass `monitorDefaults` prop to `StatusHistoryDaysCard`**

Find (around line 371):
```svelte
<StatusHistoryDaysCard bind:monitor {typeData} bind:statusHistoryDays />
```

Replace with:
```svelte
<StatusHistoryDaysCard bind:monitor {typeData} bind:statusHistoryDays {monitorDefaults} />
```

- [ ] **Step 7: Verify type check**

```bash
npm run check 2>&1 | grep -E "error|warning" | grep -v "toggle-group\|chart-container\|(kener)/\+page\|(kener)/\[page"
```

Expected: no new errors. TypeScript will flag the `StatusHistoryDaysCard` prop mismatch until Task 3 is done — that's acceptable at this stage.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/(manage)/manage/app/monitors/[tag]/+page.svelte"
git commit -m "feat: load Global Monitor Default and pass to StatusHistoryDaysCard"
```

---

### Task 3: Update StatusHistoryDaysCard with badge/reset UI

**Files:**
- Modify: `src/routes/(manage)/manage/app/monitors/[tag]/components/StatusHistoryDaysCard.svelte`

This is the main UI change. The card must:
- Accept a `monitorDefaults` prop.
- Show "Site Default" badge when the value is `null`; show "Custom" badge + "Reset to default" button when it's a number.
- Input uses `oninput` handler (same as pages) so clearing the field sets `null`.
- Validation: a `null` value is valid (means "use default"). Only validate range when a number is present.
- Save: write `null` as `null` (not as `90`/`30`).

Study `src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte:869-960` as the reference before writing the template.

- [ ] **Step 1: Add imports and update Props interface**

Replace the current `<script>` block imports and Props interface. The full updated `<script>` block:

```typescript
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
```

- [ ] **Step 2: Replace the template**

Replace everything from `<Card.Root>` to the end of the file with:

```svelte
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
```

- [ ] **Step 3: Verify type check passes**

```bash
npm run check 2>&1 | grep -E "error|warning" | grep -v "toggle-group\|chart-container\|(kener)/\+page\|(kener)/\[page"
```

Expected: no new errors.

- [ ] **Step 4: Manual smoke test**

1. Open a monitor in `http://localhost:3000/manage/app/monitors/<tag>`
2. Expand "Status History" accordion
3. Verify both Desktop and Mobile fields show **"Site default"** badge and the input placeholder shows the Global Monitor Default value (e.g. 90 / 30)
4. Type a number in Desktop → badge changes to **"Custom"** and "Reset to default" appears
5. Click "Reset to default" → badge reverts to **"Site default"**, input clears
6. Enter a value and click "Save Status History Settings" → toast success
7. Reload the page → the saved custom value persists (badge = "Custom")
8. Reset and save → reload → badge = "Site default", input empty

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(manage)/manage/app/monitors/[tag]/components/StatusHistoryDaysCard.svelte"
git commit -m "feat: add Site Default/Custom badge and reset to StatusHistoryDaysCard"
```
