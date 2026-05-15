# Global Page Defaults — Design Spec

## Goal

Add a "Global Page Defaults" card to `/manage/app/site-configurations` where admins can configure fallback values for per-page display settings. Individual pages can override any default explicitly. When a page has no explicit value for a field, the site default applies automatically.

## Scope

Settings covered initially (extensible):
- `monitor_status_history_days.desktop` — how many days of monitor history to show on desktop (hardcoded fallback: 90)
- `monitor_status_history_days.mobile` — how many days on mobile (hardcoded fallback: 30)
- `monitor_layout_style` — monitor display style: `default-list`, `default-grid`, `compact-list`, `compact-grid` (hardcoded fallback: `"default-list"`)

---

## Data Model

### New site-data key: `pageDefaults`

Stored via existing `storeSiteData` / `InsertKeyValue` mechanism as a JSON object.

```typescript
// src/lib/types/site.ts
export interface SitePageDefaults {
  monitor_status_history_days: {
    desktop: number;
    mobile: number;
  };
  monitor_layout_style: "default-list" | "default-grid" | "compact-list" | "compact-grid";
}
```

Added to `SiteDataTransformed` as `pageDefaults?: SitePageDefaults`.

Hardcoded system fallback (used when `pageDefaults` is not yet in DB):
```typescript
const SYSTEM_PAGE_DEFAULTS: SitePageDefaults = {
  monitor_status_history_days: { desktop: 90, mobile: 30 },
  monitor_layout_style: "default-list",
};
```

### Updated `PageSettingsType`

Fields become nullable — `null` means "no explicit override, use site default":

```typescript
// src/lib/server/types/db.ts
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

No DB migration required — the `page_settings_json` column already stores flexible JSON.

### Resolution logic

A shared helper merges page settings with site defaults:

```typescript
// src/lib/server/controllers/dashboardController.ts
function resolvePageSettings(
  pageSettings: PageSettingsType | null,
  siteDefaults: SitePageDefaults
): ResolvedPageSettings {
  return {
    monitor_status_history_days: {
      desktop: pageSettings?.monitor_status_history_days?.desktop ?? siteDefaults.monitor_status_history_days.desktop,
      mobile:  pageSettings?.monitor_status_history_days?.mobile  ?? siteDefaults.monitor_status_history_days.mobile,
    },
    monitor_layout_style: pageSettings?.monitor_layout_style ?? siteDefaults.monitor_layout_style,
  };
}
```

`ResolvedPageSettings` is the same shape as `SitePageDefaults` (all fields non-nullable).

---

## Backend

### New `siteDataKeys` entry

```typescript
{ key: "pageDefaults", isValid: (v) => typeof v === "string", data_type: "object" }
```

### New API actions in `/manage/api/+server.ts`

**`applyPageDefaults`**

```typescript
// data: { force: boolean }
// force=false → only update pages where the field value is null
// force=true  → update ALL pages (confirmation required in UI)
```

Implementation:
1. Load current `pageDefaults` from site_data (or system fallback)
2. Load all pages from DB
3. For each page, parse `page_settings_json`
4. `force=false`: update only fields that are currently `null` in the page's JSON
5. `force=true`: set all relevant fields to the site-default values (explicit)
6. Write updated `page_settings_json` back to DB for each changed page

---

## UI: Site-Configurations — New Card

Location: `/manage/app/site-configurations` — appended after existing cards.

Card title: `manage.site_config.page_defaults_title`
Card description: `manage.site_config.page_defaults_desc`

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Global Page Defaults                                    │
│ Default values for pages without explicit settings      │
├─────────────────────────────────────────────────────────┤
│ Monitor History Days                                    │
│  Desktop [90]    Mobile [30]                            │
│                                                         │
│ Monitor Layout Style                                    │
│  [Default List ▾]                                       │
├─────────────────────────────────────────────────────────┤
│ [Save Defaults]    [Apply to unset ▾]                   │
│                     → Apply to pages without override   │
│                     → Force apply to all pages          │
└─────────────────────────────────────────────────────────┘
```

- **Save Defaults**: calls `storeSiteData({ pageDefaults: JSON.stringify({...}) })`. Does not touch any pages.
- **Apply to unset pages** (dropdown option): calls `applyPageDefaults({ force: false })`. Updates pages with null fields only.
- **Force apply to all pages** (dropdown option): shows a confirmation dialog, then calls `applyPageDefaults({ force: true })`. Overwrites all pages including those with explicit values.

### i18n keys (all 22 locales)

```
manage.site_config.page_defaults_title
manage.site_config.page_defaults_desc
manage.site_config.page_defaults_history_label
manage.site_config.page_defaults_history_desktop
manage.site_config.page_defaults_history_mobile
manage.site_config.page_defaults_layout_label
manage.site_config.page_defaults_save
manage.site_config.page_defaults_apply_unset
manage.site_config.page_defaults_apply_all
manage.site_config.page_defaults_apply_all_confirm
manage.site_config.page_defaults_apply_success
```

---

## UI: Page Edit — Default vs. Override Indicators

Location: Display Settings card in `/manage/app/pages/[page_id]`.

### Loading

The page edit fetches site defaults once on mount alongside page settings. Site defaults are passed as a separate reactive state variable.

### Per-field rendering

For each field that supports defaults:

**When null (using site default):**
- Input shows the effective value (from site default) as placeholder or pre-filled value
- Badge next to input: "Site default" (muted style)
- No reset button shown

**When explicitly set:**
- Input shows the explicit value
- Badge: "Custom" (accent or outlined style)
- "Reset to default" button (small, ghost variant) — clicking sets the field to `null` in state; saving writes `null` to DB

### Save behavior

`savePageSettings` serializes the current state including null values. The backend accepts null for nullable fields and stores them as-is in `page_settings_json`.

---

## Backwards Compatibility

- Existing pages with `page_settings_json` already set keep their explicit values — no change.
- Pages with `page_settings_json = null` already had the hardcoded defaults; they now use the configurable site defaults. System fallback values match the previous hardcoded values (90/30/default-list), so behavior is unchanged until the admin configures different defaults.
- The public status page loading path (`dashboardController`) is updated to use `resolvePageSettings` with the site defaults loaded from DB.
