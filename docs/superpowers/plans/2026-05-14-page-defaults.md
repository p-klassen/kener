# Global Page Defaults — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable "Global Page Defaults" card to site-configurations so admins can set fallback values for per-page display settings, with null-based per-page overrides in the page edit UI.

**Architecture:** Pages store `null` for fields that should follow the site default; `resolvePageSettings()` in `dashboardController.ts` merges stored page settings with site defaults at load time. The site defaults themselves live in `site_data` under the key `pageDefaults`, with a hardcoded system fallback matching the previous hardcoded values (90/30/default-list).

**Tech Stack:** SvelteKit 5 (Svelte runes), TypeScript, shadcn-svelte (Card, Button, Input, Select, DropdownMenu, AlertDialog), Tailwind CSS v4, Knex/SQLite. No DB migration required.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/types/site.ts` | Add `SitePageDefaults` interface |
| `src/lib/server/controllers/siteDataController.ts` | Add `pageDefaults?` to `SiteDataTransformed` |
| `src/lib/server/types/db.ts` | Make `PageSettingsType` display fields nullable |
| `src/lib/server/controllers/siteDataKeys.ts` | Add `pageDefaults` entry |
| `src/lib/server/db/seedSiteData.ts` | Add `pageDefaults` seed value |
| `src/lib/server/controllers/dashboardController.ts` | Replace hardcoded defaults with `SYSTEM_PAGE_DEFAULTS`, add `getSitePageDefaults()` + `resolvePageSettings()`, call them in two load sites |
| `src/routes/(manage)/manage/api/+server.ts` | Add `applyPageDefaults` action |
| `src/routes/(manage)/manage/app/site-configurations/+page.svelte` | New card: state, load, save, apply-to-unset/force-all UI |
| `src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte` | Fetch site defaults, preserve nulls on load, badge + reset UI in Display Settings card |
| `src/lib/locales/en.json` + 21 other locales | 14 new i18n keys |

---

### Task 1: TypeScript types

**Files:**
- Modify: `src/lib/types/site.ts`
- Modify: `src/lib/server/controllers/siteDataController.ts:26-72`
- Modify: `src/lib/server/types/db.ts:485-494`

- [ ] **Step 1: Add `SitePageDefaults` to site.ts**

After the last interface in `src/lib/types/site.ts` (currently after `GlobalMaintenanceNotificationSettings`), append:

```typescript
export interface SitePageDefaults {
  monitor_status_history_days: {
    desktop: number;
    mobile: number;
  };
  monitor_layout_style: "default-list" | "default-grid" | "compact-list" | "compact-grid";
}
```

- [ ] **Step 2: Add `pageDefaults` to `SiteDataTransformed`**

In `src/lib/server/controllers/siteDataController.ts`, add to the import list from `../../types/site.js`:

```typescript
import type {
  // ... existing imports ...
  GlobalMaintenanceNotificationSettings,
  SitePageDefaults,       // ← add this
} from "../../types/site.js";
```

Then add to the `SiteDataTransformed` interface (after `globalMaintenanceNotificationSettings?`):

```typescript
  pageDefaults?: SitePageDefaults;
```

- [ ] **Step 3: Make `PageSettingsType` display fields nullable**

In `src/lib/server/types/db.ts`, replace the `PageSettingsType` interface (currently at line 485):

```typescript
// Before:
export interface PageSettingsType {
  monitor_status_history_days: {
    desktop: number;
    mobile: number;
  };
  monitor_layout_style: "default-list" | "default-grid" | "compact-list" | "compact-grid";
  metaPageTitle?: string;
  metaPageDescription?: string;
  socialPagePreviewImage?: string;
}

// After:
export interface PageSettingsType {
  monitor_status_history_days: {
    desktop: number | null;
    mobile: number | null;
  } | null;
  monitor_layout_style: "default-list" | "default-grid" | "compact-list" | "compact-grid" | null;
  metaPageTitle?: string;
  metaPageDescription?: string;
  socialPagePreviewImage?: string;
}
```

- [ ] **Step 4: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: errors about `monitor_status_history_days` not being nullable at usage sites in `dashboardController.ts` and `pages/[page_id]/+page.svelte`. These will be fixed in Tasks 3 and 6. Any other errors need investigation.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/site.ts src/lib/server/controllers/siteDataController.ts src/lib/server/types/db.ts
git commit -m "feat: add SitePageDefaults type, nullable PageSettingsType"
```

---

### Task 2: Site data key, seed, and system constant

**Files:**
- Modify: `src/lib/server/controllers/siteDataKeys.ts` (end of array)
- Modify: `src/lib/server/db/seedSiteData.ts` (end of object)

- [ ] **Step 1: Register `pageDefaults` as a valid site data key**

In `src/lib/server/controllers/siteDataKeys.ts`, add at the end of the `siteDataKeys` array (before the closing `]`):

```typescript
  {
    key: "pageDefaults",
    isValid: IsValidJSONString,
    data_type: "object",
  },
```

`IsValidJSONString` is already imported at the top of the file.

- [ ] **Step 2: Add `pageDefaults` to the seed data**

In `src/lib/server/db/seedSiteData.ts`, add after `globalMaintenanceNotificationSettings`:

```typescript
  pageDefaults: {
    monitor_status_history_days: { desktop: 90, mobile: 30 },
    monitor_layout_style: "default-list",
  },
```

(This seed is used on first boot; existing deployments without this key fall back to the system constant added in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/controllers/siteDataKeys.ts src/lib/server/db/seedSiteData.ts
git commit -m "feat: register pageDefaults site data key and seed"
```

---

### Task 3: `SYSTEM_PAGE_DEFAULTS`, `resolvePageSettings`, and dashboard loading

**Files:**
- Modify: `src/lib/server/controllers/dashboardController.ts`

- [ ] **Step 1: Replace hardcoded `defaultPageSettings` with `SYSTEM_PAGE_DEFAULTS`**

In `src/lib/server/controllers/dashboardController.ts`, add to the existing imports:

```typescript
import type { SitePageDefaults } from "../../types/site.js";
import { GetSiteDataByKey } from "./siteDataController.js";
```

Then replace lines 23–29 (the `defaultPageSettings` const) with:

```typescript
// System-level fallback — matches the previous hardcoded values
const SYSTEM_PAGE_DEFAULTS: SitePageDefaults = {
  monitor_status_history_days: { desktop: 90, mobile: 30 },
  monitor_layout_style: "default-list",
};

async function getSitePageDefaults(): Promise<SitePageDefaults> {
  try {
    const raw = await GetSiteDataByKey("pageDefaults");
    if (raw && typeof raw === "object") {
      return { ...SYSTEM_PAGE_DEFAULTS, ...(raw as Partial<SitePageDefaults>) };
    }
  } catch {}
  return { ...SYSTEM_PAGE_DEFAULTS };
}

function resolvePageSettings(
  pageSettings: PageSettingsType | null,
  siteDefaults: SitePageDefaults
): PageSettingsType {
  return {
    monitor_status_history_days: {
      desktop: pageSettings?.monitor_status_history_days?.desktop ?? siteDefaults.monitor_status_history_days.desktop,
      mobile: pageSettings?.monitor_status_history_days?.mobile ?? siteDefaults.monitor_status_history_days.mobile,
    },
    monitor_layout_style: pageSettings?.monitor_layout_style ?? siteDefaults.monitor_layout_style,
    ...(pageSettings?.metaPageTitle !== undefined && { metaPageTitle: pageSettings.metaPageTitle }),
    ...(pageSettings?.metaPageDescription !== undefined && { metaPageDescription: pageSettings.metaPageDescription }),
    ...(pageSettings?.socialPagePreviewImage !== undefined && { socialPagePreviewImage: pageSettings.socialPagePreviewImage }),
  };
}
```

- [ ] **Step 2: Load site defaults at the top of `GetDashboardData`**

Find the `GetDashboardData` function (or the exported function that calls `GetPageByPathWithMonitors`). Near the start of that function, before any page-level code, add:

```typescript
const siteDefaults = await getSitePageDefaults();
```

- [ ] **Step 3: Fix the locked-page settings (around line 343)**

Find `const settings: PageSettingsType = defaultPageSettings;` in the locked-page early-return branch. Replace it with:

```typescript
const settings = resolvePageSettings(null, siteDefaults);
```

- [ ] **Step 4: Fix the main page settings loading (around lines 393–404)**

Replace the block:

```typescript
let settings: PageSettingsType = defaultPageSettings;
if (pageDetails.page_settings_json) {
  try {
    const parsed =
      typeof pageDetails.page_settings_json === "string"
        ? JSON.parse(pageDetails.page_settings_json)
        : pageDetails.page_settings_json;
    settings = { ...defaultPageSettings, ...parsed };
  } catch {
    settings = defaultPageSettings;
  }
}
```

With:

```typescript
let rawSettings: PageSettingsType | null = null;
if (pageDetails.page_settings_json) {
  try {
    rawSettings =
      typeof pageDetails.page_settings_json === "string"
        ? JSON.parse(pageDetails.page_settings_json)
        : pageDetails.page_settings_json;
  } catch {}
}
const settings = resolvePageSettings(rawSettings, siteDefaults);
```

- [ ] **Step 5: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no errors in dashboardController.ts. Remaining errors should only be in `pages/[page_id]/+page.svelte` (fixed in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/controllers/dashboardController.ts
git commit -m "feat: resolvePageSettings with configurable site defaults"
```

---

### Task 4: `applyPageDefaults` API action

**Files:**
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Add the `applyPageDefaults` handler**

In `src/routes/(manage)/manage/api/+server.ts`, find the `updatePage` / `deletePage` block (around line 469). After `deletePage`, add:

```typescript
    } else if (action == "applyPageDefaults") {
      // Load current site defaults (or system fallback)
      const SYSTEM_DEFAULTS = {
        monitor_status_history_days: { desktop: 90, mobile: 30 },
        monitor_layout_style: "default-list" as const,
      };
      let siteDefaults = { ...SYSTEM_DEFAULTS };
      try {
        const raw = await GetSiteDataByKey("pageDefaults");
        if (raw && typeof raw === "object") {
          siteDefaults = { ...SYSTEM_DEFAULTS, ...(raw as typeof SYSTEM_DEFAULTS) };
        }
      } catch {}

      const pages = await GetAllPages();
      for (const p of pages) {
        let raw: Record<string, unknown> = {};
        if (p.page_settings_json) {
          try {
            const parsed =
              typeof p.page_settings_json === "string"
                ? JSON.parse(p.page_settings_json)
                : p.page_settings_json;
            if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
          } catch {}
        }

        let changed = false;
        const historyDays = (raw.monitor_status_history_days as Record<string, unknown>) ?? {};

        if (data.force) {
          raw.monitor_status_history_days = {
            ...historyDays,
            desktop: siteDefaults.monitor_status_history_days.desktop,
            mobile: siteDefaults.monitor_status_history_days.mobile,
          };
          raw.monitor_layout_style = siteDefaults.monitor_layout_style;
          changed = true;
        } else {
          const needsDesktop = historyDays.desktop === null || historyDays.desktop === undefined;
          const needsMobile = historyDays.mobile === null || historyDays.mobile === undefined;
          const needsLayout = raw.monitor_layout_style === null || raw.monitor_layout_style === undefined;
          if (needsDesktop || needsMobile) {
            raw.monitor_status_history_days = {
              ...historyDays,
              ...(needsDesktop && { desktop: siteDefaults.monitor_status_history_days.desktop }),
              ...(needsMobile && { mobile: siteDefaults.monitor_status_history_days.mobile }),
            };
            changed = true;
          }
          if (needsLayout) {
            raw.monitor_layout_style = siteDefaults.monitor_layout_style;
            changed = true;
          }
        }

        if (changed) {
          const { id, ...rest } = p;
          await UpdatePage(id, { ...rest, page_settings_json: JSON.stringify(raw) });
        }
      }
      resp = { success: true };
```

Note: `GetSiteDataByKey` and `GetAllPages`, `UpdatePage` are already imported at the top of this file.

- [ ] **Step 2: Run type check**

```bash
npm run check 2>&1 | grep "manage/api" | head -20
```

Expected: no errors in `+server.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(manage\)/manage/api/+server.ts
git commit -m "feat: applyPageDefaults API action (force and unset modes)"
```

---

### Task 5: Site-configurations — Global Page Defaults card

**Files:**
- Modify: `src/routes/(manage)/manage/app/site-configurations/+page.svelte`

- [ ] **Step 1: Add imports**

In the `<script>` block, add to the existing imports:

```typescript
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import type { SitePageDefaults } from "$lib/types/site.js";
```

- [ ] **Step 2: Add state variables**

After the `maintenanceNotificationSettings` state declaration, add:

```typescript
  const SYSTEM_PAGE_DEFAULTS: SitePageDefaults = {
    monitor_status_history_days: { desktop: 90, mobile: 30 },
    monitor_layout_style: "default-list",
  };

  let pageDefaults = $state<SitePageDefaults>(structuredClone(SYSTEM_PAGE_DEFAULTS));
  let savingPageDefaults = $state(false);
  let applyingPageDefaults = $state(false);
  let showApplyAllConfirm = $state(false);
```

- [ ] **Step 3: Load pageDefaults in `fetchSiteData`**

In the `fetchSiteData` function, after the `maintenanceNotificationSettings` loading block, add:

```typescript
        if (data.pageDefaults) {
          try {
            const parsed =
              typeof data.pageDefaults === "string"
                ? JSON.parse(data.pageDefaults)
                : data.pageDefaults;
            pageDefaults = {
              monitor_status_history_days: {
                desktop: parsed?.monitor_status_history_days?.desktop ?? SYSTEM_PAGE_DEFAULTS.monitor_status_history_days.desktop,
                mobile: parsed?.monitor_status_history_days?.mobile ?? SYSTEM_PAGE_DEFAULTS.monitor_status_history_days.mobile,
              },
              monitor_layout_style: parsed?.monitor_layout_style ?? SYSTEM_PAGE_DEFAULTS.monitor_layout_style,
            };
          } catch {
            pageDefaults = structuredClone(SYSTEM_PAGE_DEFAULTS);
          }
        } else {
          pageDefaults = structuredClone(SYSTEM_PAGE_DEFAULTS);
        }
```

- [ ] **Step 4: Add `savePageDefaults` and `applyPageDefaults` functions**

Before the closing `</script>` tag, add:

```typescript
  async function savePageDefaults() {
    savingPageDefaults = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeSiteData",
          data: { pageDefaults: JSON.stringify(pageDefaults) }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.site_config.page_defaults_save") + " ✓");
      }
    } catch {
      toast.error("Failed to save page defaults");
    } finally {
      savingPageDefaults = false;
    }
  }

  async function applyPageDefaults(force: boolean) {
    applyingPageDefaults = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "applyPageDefaults",
          data: { force }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.site_config.page_defaults_apply_success"));
      }
    } catch {
      toast.error("Failed to apply page defaults");
    } finally {
      applyingPageDefaults = false;
      showApplyAllConfirm = false;
    }
  }
```

- [ ] **Step 5: Add the card HTML**

At the very end of the page markup (after the last existing `</Card.Root>`), add:

```svelte
  <!-- Global Page Defaults Card -->
  <Card.Root>
    <Card.Header>
      <Card.Title>{$t("manage.site_config.page_defaults_title")}</Card.Title>
      <Card.Description>{$t("manage.site_config.page_defaults_desc")}</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-6">
      <!-- Monitor History Days -->
      <div class="space-y-3">
        <Label class="text-base font-medium">{$t("manage.site_config.page_defaults_history_label")}</Label>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="pd-history-desktop">{$t("manage.site_config.page_defaults_history_desktop")}</Label>
            <Input
              id="pd-history-desktop"
              type="number"
              min="1"
              max="365"
              bind:value={pageDefaults.monitor_status_history_days.desktop}
            />
          </div>
          <div class="space-y-2">
            <Label for="pd-history-mobile">{$t("manage.site_config.page_defaults_history_mobile")}</Label>
            <Input
              id="pd-history-mobile"
              type="number"
              min="1"
              max="365"
              bind:value={pageDefaults.monitor_status_history_days.mobile}
            />
          </div>
        </div>
      </div>

      <hr class="border-muted" />

      <!-- Monitor Layout Style -->
      <div class="space-y-2">
        <Label class="text-base font-medium">{$t("manage.site_config.page_defaults_layout_label")}</Label>
        <Select.Root type="single" bind:value={pageDefaults.monitor_layout_style}>
          <Select.Trigger class="w-full">
            {#if pageDefaults.monitor_layout_style === "default-list"}
              Default List
            {:else if pageDefaults.monitor_layout_style === "default-grid"}
              Default Grid
            {:else if pageDefaults.monitor_layout_style === "compact-list"}
              Compact List
            {:else}
              Compact Grid
            {/if}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="default-list">Default List</Select.Item>
            <Select.Item value="default-grid">Default Grid</Select.Item>
            <Select.Item value="compact-list">Compact List</Select.Item>
            <Select.Item value="compact-grid">Compact Grid</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </Card.Content>
    <Card.Footer class="flex justify-between">
      <Button onclick={savePageDefaults} disabled={savingPageDefaults}>
        {#if savingPageDefaults}
          <Loader class="mr-2 h-4 w-4 animate-spin" />
        {:else}
          <SaveIcon class="mr-2 h-4 w-4" />
        {/if}
        {$t("manage.site_config.page_defaults_save")}
      </Button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button variant="outline" {...props} disabled={applyingPageDefaults}>
              {#if applyingPageDefaults}
                <Loader class="mr-2 h-4 w-4 animate-spin" />
              {/if}
              Apply to pages
              <ChevronDownIcon class="ml-2 h-4 w-4" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          <DropdownMenu.Item onclick={() => applyPageDefaults(false)}>
            {$t("manage.site_config.page_defaults_apply_unset")}
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => (showApplyAllConfirm = true)} class="text-destructive">
            {$t("manage.site_config.page_defaults_apply_all")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Card.Footer>
  </Card.Root>

  <!-- Force-apply confirmation dialog -->
  <AlertDialog.Root bind:open={showApplyAllConfirm}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>{$t("manage.site_config.page_defaults_apply_all")}</AlertDialog.Title>
        <AlertDialog.Description>
          {$t("manage.site_config.page_defaults_apply_all_confirm")}
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>{$t("manage.common_cancel") ?? "Cancel"}</AlertDialog.Cancel>
        <AlertDialog.Action onclick={() => applyPageDefaults(true)}>
          {$t("manage.site_config.page_defaults_apply_all")}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
```

Note: check the existing i18n key for "Cancel" — search for `"cancel"` in `en.json` to find the right key. Adjust `manage.common_cancel` if the key differs.

- [ ] **Step 6: Check the cancel i18n key**

```bash
grep -n '"cancel"\|"Cancel"\|common_cancel' src/lib/locales/en.json | head -5
```

Use whatever cancel key exists in the project. If none, use the literal string `"Cancel"` temporarily and add a proper key in Task 7.

- [ ] **Step 7: Run type check**

```bash
npm run check 2>&1 | grep "site-configurations" | head -20
```

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(manage\)/manage/app/site-configurations/+page.svelte
git commit -m "feat: Global Page Defaults card in site-configurations"
```

---

### Task 6: Page edit — Display Settings UI with null/badge support

**Files:**
- Modify: `src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte`

- [ ] **Step 1: Add import for `SitePageDefaults`**

In the `<script>` block, update the existing import from `$lib/server/types/db.js`:

```typescript
  import type { PageRecord, MonitorRecord, PageSettingsType } from "$lib/server/types/db.js";
```

Add a new import:

```typescript
  import type { SitePageDefaults } from "$lib/types/site.js";
```

- [ ] **Step 2: Replace `defaultPageSettings` with null-based initial state**

Replace the current `defaultPageSettings` const (lines 36–42) and `pageSettings` state (line 92) with:

```typescript
  // Null = use site default; explicit value = override
  const NULL_PAGE_SETTINGS: PageSettingsType = {
    monitor_status_history_days: { desktop: null, mobile: null },
    monitor_layout_style: null,
  };

  const SYSTEM_PAGE_DEFAULTS: SitePageDefaults = {
    monitor_status_history_days: { desktop: 90, mobile: 30 },
    monitor_layout_style: "default-list",
  };

  let siteDefaults = $state<SitePageDefaults>(structuredClone(SYSTEM_PAGE_DEFAULTS));
```

And change the `pageSettings` state initialization:

```typescript
  let pageSettings = $state<PageSettingsType>(structuredClone(NULL_PAGE_SETTINGS));
```

- [ ] **Step 3: Add `fetchSiteDefaults` function**

After `fetchPage`, add:

```typescript
  async function fetchSiteDefaults() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getAllSiteData" })
      });
      const data = await response.json();
      if (data.pageDefaults) {
        const parsed =
          typeof data.pageDefaults === "string"
            ? JSON.parse(data.pageDefaults)
            : data.pageDefaults;
        siteDefaults = {
          monitor_status_history_days: {
            desktop: parsed?.monitor_status_history_days?.desktop ?? SYSTEM_PAGE_DEFAULTS.monitor_status_history_days.desktop,
            mobile: parsed?.monitor_status_history_days?.mobile ?? SYSTEM_PAGE_DEFAULTS.monitor_status_history_days.mobile,
          },
          monitor_layout_style: parsed?.monitor_layout_style ?? SYSTEM_PAGE_DEFAULTS.monitor_layout_style,
        };
      }
    } catch {}
  }
```

- [ ] **Step 4: Update page settings loading to preserve nulls**

In `fetchPage`, replace the page settings loading block (currently around lines 133–145):

```typescript
        // Load page settings — null fields mean "use site default"
        if (foundPage.page_settings_json) {
          try {
            const parsed =
              typeof foundPage.page_settings_json === "string"
                ? JSON.parse(foundPage.page_settings_json)
                : foundPage.page_settings_json;
            pageSettings = {
              monitor_status_history_days: {
                desktop: parsed?.monitor_status_history_days?.desktop ?? null,
                mobile: parsed?.monitor_status_history_days?.mobile ?? null,
              },
              monitor_layout_style: parsed?.monitor_layout_style ?? null,
              metaPageTitle: parsed?.metaPageTitle,
              metaPageDescription: parsed?.metaPageDescription,
              socialPagePreviewImage: parsed?.socialPagePreviewImage,
            };
          } catch {
            pageSettings = structuredClone(NULL_PAGE_SETTINGS);
          }
        } else {
          pageSettings = structuredClone(NULL_PAGE_SETTINGS);
        }
```

- [ ] **Step 5: Call `fetchSiteDefaults` from `onMount`**

In the `onMount` block (or wherever `fetchPage` and `fetchMonitors` are called), add:

```typescript
    fetchSiteDefaults();
```

alongside the existing calls.

- [ ] **Step 6: Replace the Display Settings card HTML**

Replace the entire `<!-- Page Settings Card -->` block (from `<Card.Root>` to `</Card.Root>` around lines 816–901) with:

```svelte
      <!-- Page Settings Card -->
      <Card.Root>
        <Card.Header>
          <Card.Title>{$t("manage.page_detail.display_title")}</Card.Title>
          <Card.Description>{$t("manage.page_detail.display_desc")}</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-6">
          <!-- Monitor Status History Days -->
          <div class="space-y-4">
            <div>
              <Label class="text-base font-medium">{$t("manage.page_detail.history_label")}</Label>
              <p class="text-muted-foreground text-sm">{$t("manage.page_detail.history_helper")}</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <!-- Desktop -->
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Label for="history-desktop">{$t("manage.page_detail.history_desktop_label")}</Label>
                  {#if pageSettings.monitor_status_history_days?.desktop === null || pageSettings.monitor_status_history_days?.desktop === undefined}
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
                      onclick={() => {
                        if (!pageSettings.monitor_status_history_days) {
                          pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                        } else {
                          pageSettings.monitor_status_history_days.desktop = null;
                        }
                      }}
                    >
                      {$t("manage.page_detail.reset_to_default")}
                    </Button>
                  {/if}
                </div>
                <Input
                  id="history-desktop"
                  type="number"
                  min="1"
                  max="365"
                  value={pageSettings.monitor_status_history_days?.desktop ?? ""}
                  placeholder={String(siteDefaults.monitor_status_history_days.desktop)}
                  oninput={(e) => {
                    const v = parseInt((e.currentTarget as HTMLInputElement).value);
                    if (!pageSettings.monitor_status_history_days) {
                      pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                    }
                    pageSettings.monitor_status_history_days.desktop = isNaN(v) ? null : v;
                  }}
                />
                <p class="text-muted-foreground text-xs">{$t("manage.page_detail.history_desktop_helper")}</p>
              </div>

              <!-- Mobile -->
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Label for="history-mobile">{$t("manage.page_detail.history_mobile_label")}</Label>
                  {#if pageSettings.monitor_status_history_days?.mobile === null || pageSettings.monitor_status_history_days?.mobile === undefined}
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
                      onclick={() => {
                        if (!pageSettings.monitor_status_history_days) {
                          pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                        } else {
                          pageSettings.monitor_status_history_days.mobile = null;
                        }
                      }}
                    >
                      {$t("manage.page_detail.reset_to_default")}
                    </Button>
                  {/if}
                </div>
                <Input
                  id="history-mobile"
                  type="number"
                  min="1"
                  max="365"
                  value={pageSettings.monitor_status_history_days?.mobile ?? ""}
                  placeholder={String(siteDefaults.monitor_status_history_days.mobile)}
                  oninput={(e) => {
                    const v = parseInt((e.currentTarget as HTMLInputElement).value);
                    if (!pageSettings.monitor_status_history_days) {
                      pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                    }
                    pageSettings.monitor_status_history_days.mobile = isNaN(v) ? null : v;
                  }}
                />
                <p class="text-muted-foreground text-xs">{$t("manage.page_detail.history_mobile_helper")}</p>
              </div>
            </div>
          </div>

          <hr class="border-muted" />

          <!-- Monitor Layout Style -->
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <Label class="text-base font-medium">{$t("manage.page_detail.layout_label")}</Label>
              {#if pageSettings.monitor_layout_style === null}
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
                  onclick={() => { pageSettings.monitor_layout_style = null; }}
                >
                  {$t("manage.page_detail.reset_to_default")}
                </Button>
              {/if}
            </div>
            <p class="text-muted-foreground text-sm">{$t("manage.page_detail.layout_helper")}</p>
            <Select.Root
              type="single"
              value={pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style}
              onValueChange={(v) => {
                pageSettings.monitor_layout_style = v as PageSettingsType["monitor_layout_style"];
              }}
            >
              <Select.Trigger class="w-full">
                {#if (pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style) === "default-list"}
                  Default List
                {:else if (pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style) === "default-grid"}
                  Default Grid
                {:else if (pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style) === "compact-list"}
                  Compact List
                {:else}
                  Compact Grid
                {/if}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="default-list">Default List</Select.Item>
                <Select.Item value="default-grid">Default Grid</Select.Item>
                <Select.Item value="compact-list">Compact List</Select.Item>
                <Select.Item value="compact-grid">Compact Grid</Select.Item>
              </Select.Content>
            </Select.Root>
            <p class="text-muted-foreground text-xs">
              {$t("manage.page_detail.site_default_badge")}: <code class="bg-muted rounded px-1 font-mono">{siteDefaults.monitor_layout_style}</code>
            </p>
          </div>
        </Card.Content>
        <Card.Footer class="flex justify-end">
          <Button onclick={() => savePageSettings("display")} disabled={savingDisplaySettings}>
            {#if savingDisplaySettings}
              <Loader class="h-4 w-4 animate-spin" />
              {$t("manage.page_detail.saving")}
            {:else}
              <SaveIcon class="h-4 w-4" />
              {$t("manage.page_detail.save_prefs")}
            {/if}
          </Button>
        </Card.Footer>
      </Card.Root>
```

- [ ] **Step 7: Run type check**

```bash
npm run check 2>&1 | head -60
```

Expected: no errors. Fix any type issues — most likely the `PageSettingsType["monitor_layout_style"]` cast for the Select `onValueChange`.

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(manage\)/manage/app/pages/\[page_id\]/+page.svelte
git commit -m "feat: page edit Display Settings with site default badges and reset"
```

---

### Task 7: i18n keys across all 22 locales

**Files:**
- Modify: `src/lib/locales/en.json` and all 21 other locales
- Locales: `cs de dk en es fa fr hi it ja ko nb-NO nl pl pt-BR ru sk tr uk vi zh-CN zh-TW`

- [ ] **Step 1: Add keys to `en.json`**

In `src/lib/locales/en.json`:

After `"manage.site_config.maint_notif_desc"` (currently line 379), add:

```json
    "manage.site_config.page_defaults_title": "Global Page Defaults",
    "manage.site_config.page_defaults_desc": "Default values applied to pages that have no explicit setting",
    "manage.site_config.page_defaults_history_label": "Monitor History Days",
    "manage.site_config.page_defaults_history_desktop": "Desktop",
    "manage.site_config.page_defaults_history_mobile": "Mobile",
    "manage.site_config.page_defaults_layout_label": "Monitor Layout Style",
    "manage.site_config.page_defaults_save": "Save Defaults",
    "manage.site_config.page_defaults_apply_unset": "Apply to pages without override",
    "manage.site_config.page_defaults_apply_all": "Force apply to all pages",
    "manage.site_config.page_defaults_apply_all_confirm": "This will overwrite explicit display settings on all pages. Pages will no longer track the site defaults dynamically. Are you sure?",
    "manage.site_config.page_defaults_apply_success": "Defaults applied successfully",
```

After `"manage.page_detail.settings_error"` (currently line 869), add:

```json
    "manage.page_detail.site_default_badge": "Site default",
    "manage.page_detail.custom_badge": "Custom",
    "manage.page_detail.reset_to_default": "Reset to default",
```

- [ ] **Step 2: Add keys to all other 21 locales**

For each non-English locale file, add the same keys with English values as placeholders. The app will show English text until native translations are added.

Add after `"manage.site_config.maint_notif_desc"` in each file:

```json
    "manage.site_config.page_defaults_title": "Global Page Defaults",
    "manage.site_config.page_defaults_desc": "Default values applied to pages that have no explicit setting",
    "manage.site_config.page_defaults_history_label": "Monitor History Days",
    "manage.site_config.page_defaults_history_desktop": "Desktop",
    "manage.site_config.page_defaults_history_mobile": "Mobile",
    "manage.site_config.page_defaults_layout_label": "Monitor Layout Style",
    "manage.site_config.page_defaults_save": "Save Defaults",
    "manage.site_config.page_defaults_apply_unset": "Apply to pages without override",
    "manage.site_config.page_defaults_apply_all": "Force apply to all pages",
    "manage.site_config.page_defaults_apply_all_confirm": "This will overwrite explicit display settings on all pages. Pages will no longer track the site defaults dynamically. Are you sure?",
    "manage.site_config.page_defaults_apply_success": "Defaults applied successfully",
```

Add after `"manage.page_detail.settings_error"` in each file:

```json
    "manage.page_detail.site_default_badge": "Site default",
    "manage.page_detail.custom_badge": "Custom",
    "manage.page_detail.reset_to_default": "Reset to default",
```

To do this efficiently, use a script or sed for each locale. Example using sed for one file:

```bash
# For site_config keys — insert after the maint_notif_desc line in each locale
for locale in cs de dk es fa fr hi it ja ko nb-NO nl pl pt-BR ru sk tr uk vi zh-CN zh-TW; do
  file="src/lib/locales/${locale}.json"
  # Check line number of maint_notif_desc in this file
  line=$(grep -n "maint_notif_desc" "$file" | head -1 | cut -d: -f1)
  echo "Locale $locale: maint_notif_desc at line $line"
done
```

Then insert the block after that line in each file. Given the file structure is the same across locales (same keys, different values), use Python or Node for a safe JSON manipulation:

```bash
node -e "
const fs = require('fs');
const locales = ['cs','de','dk','es','fa','fr','hi','it','ja','ko','nb-NO','nl','pl','pt-BR','ru','sk','tr','uk','vi','zh-CN','zh-TW'];
const siteConfigKeys = {
  'manage.site_config.page_defaults_title': 'Global Page Defaults',
  'manage.site_config.page_defaults_desc': 'Default values applied to pages that have no explicit setting',
  'manage.site_config.page_defaults_history_label': 'Monitor History Days',
  'manage.site_config.page_defaults_history_desktop': 'Desktop',
  'manage.site_config.page_defaults_history_mobile': 'Mobile',
  'manage.site_config.page_defaults_layout_label': 'Monitor Layout Style',
  'manage.site_config.page_defaults_save': 'Save Defaults',
  'manage.site_config.page_defaults_apply_unset': 'Apply to pages without override',
  'manage.site_config.page_defaults_apply_all': 'Force apply to all pages',
  'manage.site_config.page_defaults_apply_all_confirm': 'This will overwrite explicit display settings on all pages. Are you sure?',
  'manage.site_config.page_defaults_apply_success': 'Defaults applied successfully',
};
const pageDetailKeys = {
  'manage.page_detail.site_default_badge': 'Site default',
  'manage.page_detail.custom_badge': 'Custom',
  'manage.page_detail.reset_to_default': 'Reset to default',
};
for (const locale of locales) {
  const path = \`src/lib/locales/\${locale}.json\`;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  Object.assign(data, siteConfigKeys, pageDetailKeys);
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log('Updated', locale);
}
"
```

**Important:** The Node script above merges keys at the end of the JSON object (key order in JSON objects is insertion order in JS). After running, verify that the JSON is still valid and the keys appear somewhere in the file.

- [ ] **Step 3: Verify JSON validity**

```bash
for f in src/lib/locales/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" && echo "OK: $f" || echo "INVALID: $f"; done
```

Expected: all files print `OK`.

- [ ] **Step 4: Verify new keys present in all locales**

```bash
grep -l "page_defaults_title" src/lib/locales/*.json | wc -l
```

Expected: `22`

- [ ] **Step 5: Commit**

```bash
git add src/lib/locales/
git commit -m "feat: i18n keys for Global Page Defaults (en + 21 placeholder locales)"
```

---

## Final Verification

- [ ] **Run full type check**

```bash
npm run check
```

Expected: zero errors.

- [ ] **Start dev server and manually test**

```bash
npm run dev
```

1. Go to `/manage/app/site-configurations` — verify new "Global Page Defaults" card appears at bottom
2. Change Desktop history days to 45, save — should show success toast
3. Go to `/manage/app/pages/[any-page-id]` — verify Display Settings shows "Site default" badges
4. Change Desktop days to 60 — badge should switch to "Custom"
5. Click "Reset to default" — badge should return to "Site default", input should show 45 as placeholder
6. Save — saves with null in DB
7. Go back to site-configurations, click "Apply to pages without override" — should apply 45 to that page's null fields
8. Re-open page edit — should now show 45 as an explicit custom value (no longer null)
9. Go to a status page — verify monitor history bar uses the correct day count

- [ ] **Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: post-review corrections for page defaults feature"
```
