# Admin UI i18n — Design Spec

**Date:** 2026-05-05
**Status:** Approved

---

## Goal

Make the Kener admin interface (`/manage/...`) translatable, with each admin user able to choose their own language independently from the public status page language.

Currently the admin UI is 100% hardcoded English. The public status page already uses a reactive i18n store (`src/lib/stores/i18n.ts`) with 23 locale files. This spec extends that same system to the manage routes.

---

## Section 1 — Data Model

### New column

```sql
ALTER TABLE users ADD COLUMN preferred_locale VARCHAR(10) NULL DEFAULT NULL;
```

- `NULL` = fall back to site default locale
- Value is an IANA-style locale code matching keys in `src/lib/locales/*.json` (e.g. `"en"`, `"de"`, `"fr"`)

### Fallback chain

1. User's `preferred_locale` from DB (if set and valid)
2. Site default locale from `seedSiteData.defaultLocale`
3. Hardcoded `"en"` if site default is also missing

### No migration data needed

All existing users get `NULL`, which resolves to the site default — no behavior change.

---

## Section 2 — i18n Initialization in Manage Layout

### New file: `src/routes/(manage)/+layout.ts`

```typescript
import { i18n } from "$lib/stores/i18n";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, fetch }) => {
  const { userLocale, availableLocales, defaultLocale } = data;

  // Write DB preference to localStorage before i18n.init() reads it,
  // so DB wins over any stale localStorage value from a previous session.
  if (userLocale && typeof localStorage !== "undefined") {
    localStorage.setItem("locale", userLocale);
  }

  await i18n.init(availableLocales, defaultLocale, fetch);
  return {};
};
```

### Extended: `src/routes/(manage)/+layout.server.ts`

Add to the existing `load` return value:

```typescript
userLocale: userDb?.preferred_locale ?? null,
availableLocales: /* array of locale codes from seedSiteData / locales.json */,
defaultLocale: seedSiteData?.defaultLocale ?? "en",
```

`availableLocales` is derived the same way the public layout does it — reading `src/lib/locales/locales.json` via the existing helper.

### New API action: `updateUserLocale`

In `src/routes/(manage)/manage/api/+server.ts`, new action case:

```typescript
} else if (action === "updateUserLocale") {
  const { locale } = data;
  if (!locale || typeof locale !== "string") throw new Error("locale is required");
  // validate against available locales list before saving
  await db.updateUser(session.userId, { preferred_locale: locale });
  resp = { success: true };
}
```

---

## Section 3 — Language Picker

**Location:** Sidebar footer of `src/routes/(manage)/+layout.svelte`, above the current logged-in user display.

**Component:** shadcn-svelte `<Select>` (same pattern as the status filter in Monitors page).

**Layout:**
```
┌─────────────────────────────┐
│  ⚙ Settings                │
│  👥 Users                  │
│  ...                        │
├─────────────────────────────┤
│  🌐 Deutsch          ▼     │  ← language picker
│  paul@wobcom.de            │  ← existing user display
└─────────────────────────────┘
```

**Behavior on selection:**
1. Call `updateUserLocale(locale)` API action
2. `localStorage.setItem("locale", locale)`
3. `i18n.setLocale(locale)` — admin UI switches instantly, no reload required

Options are populated from `availableLocales` (passed from layout server data). The current locale is shown as the selected value.

---

## Section 4 — Translation Scope

### What gets translated

All static text in `.svelte` files under `src/routes/(manage)/` — labels, buttons, error messages, table headers, placeholders, toast messages.

### What does NOT get translated

- Dynamic content: monitor names, page titles, user emails, role names from DB
- Log/debug output
- Values sourced from the database (displayed as-is)

### Key naming scheme

Prefix: `manage.{page}.{element}`

Examples:
- `manage.monitors.title` → `"Monitors"`
- `manage.monitors.add_button` → `"Add Monitor"`
- `manage.common.save` → `"Save"`
- `manage.common.cancel` → `"Cancel"`
- `manage.common.delete_confirm` → `"Are you sure?"`

Shared strings (Save, Cancel, Delete, etc.) live under `manage.common.*`.

### Estimated key count

| Page | Keys (approx.) |
|------|----------------|
| `site-configurations` | ~80 |
| `monitors` | ~60 |
| `incidents` + `maintenances` | ~50 |
| `users` + `roles` + `groups` | ~60 |
| `subscriptions` | ~30 |
| `layout` (sidebar, nav) | ~20 |
| `pages` + badges + generic | ~60 |
| **Total** | **~360** |

### Starting language

English (`src/lib/locales/en.json`) is extended with all new keys. Other languages translate only what they know — missing keys fall back to English via the existing `$t()` fallback logic in the i18n store. No tooling changes needed.

### Migration strategy

Each `.svelte` file under `(manage)/` is migrated page-by-page:
1. Extract all string literals → add to `en.json` under `manage.*` namespace
2. Replace literals with `$t("manage....")` calls
3. Each page is independently committable

---

## Out of Scope

- Translating the public status page (already done)
- Bulk-translating all 23 existing locale files (community contribution)
- Per-organization locale (all users share available locales from the same locale files)
- RTL layout support
- Admin locale affecting email notifications
