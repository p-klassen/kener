# Global Monitor Defaults — Design Spec

## Goal

Add a "Global Monitor Defaults" card to `/manage/app/site-configurations` where admins can configure fallback values for per-monitor settings. Individual monitors can override any default explicitly. When a monitor has no explicit value for a field, the site default applies automatically.

## Scope

Settings covered:
- `uptime_formula_numerator` — uptime formula numerator (hardcoded fallback: `"up + maintenance"`)
- `uptime_formula_denominator` — uptime formula denominator (hardcoded fallback: `"up + maintenance + down + degraded"`)
- `monitor_status_history_days.desktop` — history days on desktop (hardcoded fallback: 90)
- `monitor_status_history_days.mobile` — history days on mobile (hardcoded fallback: 30)
- `sharing_options.showShareBadgeMonitor` — share badge toggle (hardcoded fallback: `false`)
- `sharing_options.showShareEmbedMonitor` — share embed toggle (hardcoded fallback: `false`)

---

## Data Model

### New type: `SiteMonitorDefaults`

```typescript
// src/lib/types/site.ts
export interface SiteMonitorDefaults {
  uptime_formula_numerator: string;
  uptime_formula_denominator: string;
  monitor_status_history_days: { desktop: number; mobile: number };
  sharing_options: { showShareBadgeMonitor: boolean; showShareEmbedMonitor: boolean };
}
```

Added to `SiteDataTransformed` as `monitorDefaults?: SiteMonitorDefaults`.

System fallback (used when `monitorDefaults` is not yet in DB):
```typescript
const SYSTEM_MONITOR_DEFAULTS: SiteMonitorDefaults = {
  uptime_formula_numerator: "up + maintenance",
  uptime_formula_denominator: "up + maintenance + down + degraded",
  monitor_status_history_days: { desktop: 90, mobile: 30 },
  sharing_options: { showShareBadgeMonitor: false, showShareEmbedMonitor: false },
};
```

### Updated `MonitorSettings`

Fields become nullable — `null` means "no explicit override, use site default":

```typescript
// src/lib/server/types/db.ts
export interface MonitorSettings {
  uptime_formula_numerator?: string | null;
  uptime_formula_denominator?: string | null;
  monitor_status_history_days?: { desktop: number | null; mobile: number | null } | null;
  sharing_options?: {
    showShareBadgeMonitor: boolean | null;
    showShareEmbedMonitor: boolean | null;
  } | null;
}
```

No DB migration required — `monitor_settings_json` is already flexible JSON.

### Resolution logic

```typescript
// src/lib/server/controllers/monitorSettingsController.ts  (new file)
export async function getSiteMonitorDefaults(): Promise<SiteMonitorDefaults>
// Loads "monitorDefaults" from DB via GetSiteDataByKey, deep-merges with SYSTEM_MONITOR_DEFAULTS

export function resolveMonitorSettings(
  raw: MonitorSettings | null,
  siteDefaults: SiteMonitorDefaults
): ResolvedMonitorSettings
// Fills all null/undefined fields with siteDefaults via ??
```

`ResolvedMonitorSettings` has the same shape as `SiteMonitorDefaults` (all fields non-nullable).

---

## Backend

### New `siteDataKeys` entry

```typescript
{ key: "monitorDefaults", isValid: IsValidJSONString, data_type: "object" }
```

### New API action `applyMonitorDefaults`

```typescript
// data: { force: boolean }
// force=false → only update monitors where the field value is null/undefined
// force=true  → set all relevant fields to the site-default values on ALL monitors
```

Implementation:
1. Load current `monitorDefaults` from site_data (or system fallback)
2. Load all monitors from DB
3. For each monitor, parse `monitor_settings_json`
4. `force=false`: update only fields that are currently `null` or `undefined`
5. `force=true`: set all 6 fields to the site-default values
6. Write updated `monitor_settings_json` back to DB for each changed monitor

Registered in `ACTION_PERMISSION_MAP` as `applyMonitorDefaults: "monitors.write"`.

---

## UI: Site-Configurations — New Card

Location: `/manage/app/site-configurations` — appended after Global Page Defaults card.

Card title: `manage.site_config.monitor_defaults_title`
Card description: `manage.site_config.monitor_defaults_desc`

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Global Monitor Defaults                                  │
│ Default values for monitors without explicit settings    │
├─────────────────────────────────────────────────────────┤
│ Uptime Calculation                                       │
│  Numerator   [up + maintenance              ]           │
│  Denominator [up + maintenance + down + ... ]           │
│                                                         │
│ Status History Days                                      │
│  Desktop [90]    Mobile [30]                            │
│                                                         │
│ Sharing Options                                          │
│  [ ] Share Badge    [ ] Share Embed                     │
├─────────────────────────────────────────────────────────┤
│ [Apply to ▾]                          [Save]            │
└─────────────────────────────────────────────────────────┘
```

- **Save**: calls `storeSiteData({ monitorDefaults: JSON.stringify({...}) })`. Does not touch any monitors.
- **Apply to (dropdown)**: same two-option pending pattern as Global Page Defaults card.
  - Selecting an option stores `pendingApplyMode` state; a dot indicator appears on the button.
  - Clicking Save triggers save, then executes the pending apply action.
  - "Apply to monitors without override" (`force=false`): calls `applyMonitorDefaults({ force: false })`.
  - "Force apply to all monitors" (`force=true`): shows confirmation dialog, then calls `applyMonitorDefaults({ force: true })`.

### i18n keys (all 22 locales)

```
manage.site_config.monitor_defaults_title
manage.site_config.monitor_defaults_desc
manage.site_config.monitor_defaults_uptime_label
manage.site_config.monitor_defaults_uptime_numerator
manage.site_config.monitor_defaults_uptime_denominator
manage.site_config.monitor_defaults_history_label
manage.site_config.monitor_defaults_history_desktop
manage.site_config.monitor_defaults_history_mobile
manage.site_config.monitor_defaults_sharing_label
manage.site_config.monitor_defaults_sharing_badge
manage.site_config.monitor_defaults_sharing_embed
manage.site_config.monitor_defaults_save
manage.site_config.monitor_defaults_apply_btn
manage.site_config.monitor_defaults_apply_unset
manage.site_config.monitor_defaults_apply_all
manage.site_config.monitor_defaults_apply_all_confirm
manage.site_config.monitor_defaults_apply_success
```

---

## UI: Monitor Edit — Default vs. Override Indicators

Location: Three existing sub-components in `/manage/app/monitors/[tag]/components/`:
- `UptimeSettingsCard.svelte`
- `StatusHistoryDaysCard.svelte`
- `MonitorSharingOptionsCard.svelte`

### Loading

The monitor edit page (`+page.svelte`) fetches site monitor defaults once on mount via `getSiteMonitorDefaults()` (API call to `getAllSiteData`). The result is passed as a `siteDefaults` prop to each of the three sub-components.

The page initializes monitor settings state with `null` for all overridable fields (not the hardcoded values). Parsed `monitor_settings_json` values are loaded preserving `null` where fields are absent.

### Per-field rendering (in each sub-component)

**When null (using site default):**
- Input/Switch shows the effective value (from `siteDefaults` prop) as its displayed value
- Badge next to label: "Site default" (muted style)
- No reset button

**When explicitly set:**
- Input/Switch shows the explicit value
- Badge: "Custom" (accent/outlined style)
- "Reset to default" button (small, ghost variant) — sets the field to `null` in state; saving writes `null` to DB

### Save behavior

Each sub-component serializes its state including `null` values back into `monitor_settings_json`. The backend stores nulls as-is.

The existing `manage.page_detail.site_default_badge`, `manage.page_detail.custom_badge`, and `manage.page_detail.reset_to_default` i18n keys are reused — no new keys needed for the monitor edit page.

---

## Backwards Compatibility

- Existing monitors with explicit `monitor_settings_json` values keep them — no change.
- Monitors with `monitor_settings_json = null` previously used hardcoded defaults. They now use the configurable site defaults. `SYSTEM_MONITOR_DEFAULTS` matches all previous hardcoded values exactly (except sharing options: previously defaulted to `true`, now `false` per spec). Any monitor that had no explicit sharing settings will now default to `false`.
- The `||` fallback pattern in the monitor edit page loading logic is replaced with `?? siteDefaults.field` using the resolved defaults.
