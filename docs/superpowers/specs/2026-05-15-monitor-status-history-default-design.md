# Monitor Status History — Default/Custom Badge Design

## Goal

Add the same "Site Default" / "Custom" badge and "Reset to Default" button pattern to the Monitor Status History card that already exists in the Pages Display Settings.

## Context

There are two independent default hierarchies in Kener:

- **Global Page Defaults** (`pageDefaults` DB key): sets site-wide defaults for pages, including `monitor_status_history_days { desktop, mobile }`.
- **Global Monitor Defaults** (`monitorDefaults` DB key): sets site-wide defaults for monitors, including its own `monitor_status_history_days { desktop, mobile }`.

Per-page `monitor_status_history_days` already supports `null` (= use Global Page Default). Per-monitor does not — it always stores explicit numbers, defaulting to 90/30 at load time. This feature adds `null` support to per-monitor settings.

## Behaviour

For each of the two fields (Desktop days, Mobile days) in `StatusHistoryDaysCard.svelte`:

- **`null` stored** → show "Site Default" badge; no editable input; placeholder text shows the resolved Global Monitor Default value.
- **Number stored** → show "Custom" badge + "Reset to Default" button; clicking reset sets the value back to `null`.

The badge and button styling exactly mirrors the existing Pages implementation (`manage.page_detail.site_default_badge`, `manage.page_detail.custom_badge`, `manage.page_detail.reset_to_default` i18n keys).

## Files Changed

| File | Change |
|------|--------|
| `src/lib/server/types/db.ts` | `MonitorSettings.monitor_status_history_days` → `{ desktop: number \| null; mobile: number \| null }` |
| `src/routes/(manage)/manage/app/monitors/[tag]/components/StatusHistoryDaysCard.svelte` | Add badge/reset UI per field; accept/emit `null`; receive Global Monitor Default as prop for placeholder display |
| `src/routes/(manage)/manage/app/monitors/[tag]/+page.svelte` | Pass `null` through on load instead of `?? 90` / `?? 30`; pass Global Monitor Default values as props to `StatusHistoryDaysCard` |

## Data Flow

**Load:** `monitor_settings_json.monitor_status_history_days` is parsed; `null` (or missing key) → field stays `null`, not coerced to 90/30.

**Save:** `null` is written as `null` into `monitor_settings_json`, not replaced with a number.

**Render (unchanged):** The status bar rendering already has a fallback chain to Global Monitor Default when the per-monitor value is absent — this is not modified.

## Out of Scope

- Cascading from page-level settings to per-monitor (a monitor appears on multiple pages; this would be ambiguous).
- Changing the actual render/fallback logic.
- Any other Monitor settings fields.
