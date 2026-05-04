# Quick Wins Design Spec

**Date:** 2026-05-04

## Overview

Five targeted UI and backend improvements to Kener's admin interface, each independently small and low-risk.

---

## Feature 1: SVG/WebP Logo & Favicon Support (#3a)

### Problem

Admins cannot upload SVG logos or favicons. The backend explicitly throws `"SVG uploads are not allowed"` and the MIME whitelist omits `image/svg+xml`.

### Design

**Backend (`src/routes/(manage)/manage/api/+server.ts`):**

- Add `"image/svg+xml"` to `allowedMimeTypes` array (~line 706).
- Remove the SVG-detection block (~lines 725–727) that throws for SVG.
- When MIME is `image/svg+xml`: skip `sharp` processing entirely (SVGs are XML text); write the raw buffer to disk and return its path.

**Frontend (`src/routes/(manage)/manage/app/site-configurations/+page.svelte`):**

- Add `"image/svg+xml"` to the `allowedTypes` array (~line 599).
- Add `image/svg+xml` to every file `<input accept="...">` attribute (logo, favicon, og-image inputs — 4 occurrences).

### Constraints

- WebP is already supported; no change needed there.
- SVG files must not be run through `sharp` (sharp cannot reliably process all SVGs and would lose vector quality).
- Existing PNG/JPEG/WebP flow is unchanged.

---

## Feature 2: Sortable Navigation Menu (#3b)

### Problem

Admins can add and delete nav items but cannot reorder them.

### Design

Add **↑ Up** and **↓ Down** buttons to each navigation item row in the site-configurations page.

**Frontend only (`src/routes/(manage)/manage/app/site-configurations/+page.svelte`):**

- The nav items are stored as a `$state<NavItem[]>` array.
- Add `moveNavItem(index: number, direction: 'up' | 'down')` function that swaps `nav[index]` with `nav[index-1]` or `nav[index+1]`.
- Disable the Up button on the first item and the Down button on the last item.
- No backend changes needed — saving nav already serializes the full array via `storeSiteData`.

---

## Feature 3: Manual Timezone Setting (#4)

### Problem

Kener shows times in the server's local timezone with no way to override it from the admin UI.

### Design

Add a **searchable timezone dropdown** under the Internationalization section of site-configurations.

**Backend (`src/routes/(manage)/manage/api/+server.ts`):**

- The existing `storeSiteData` action already accepts arbitrary key-value pairs. No schema change needed.
- New key: `manualTimezone` (string — IANA timezone ID, e.g. `"America/New_York"`; empty string = server default).

**Frontend (`src/routes/(manage)/manage/app/site-configurations/+page.svelte`):**

- Add `let manualTimezone = $state("")` initialized from `data.site_data.manualTimezone ?? ""`.
- Use the existing shadcn-svelte `Command` component (already in `src/lib/components/ui/command/`) for a searchable popover.
- Timezone list: use `Intl.supportedValuesOf("timeZone")` (built-in browser API, no extra package needed).
- Save alongside other i18n settings via `storeSiteData({ ..., manualTimezone })`.

---

## Feature 4: Monitor Type Filter (#6)

### Problem

The monitors list has a status filter but no way to filter by monitor type (API, Ping, TCP, etc.).

### Design

Add a **Type** dropdown filter to the monitors management page, following the existing `statusFilter` pattern.

**Frontend (`src/routes/(manage)/manage/app/monitors/+page.svelte`):**

- Add `let typeFilter = $state("")` (empty = all types).
- Add a `<Select>` dropdown (same component as the status filter) populated with all monitor types: `["API", "PING", "TCP", "DNS", "SSL", "SQL", "HEARTBEAT", "GAMEDIG", "GROUP", "GRPC", "NONE"]`.
- Pass `type: typeFilter || undefined` alongside `status: statusFilter` when calling the `getMonitors` API action.

**Backend (`src/routes/(manage)/manage/api/+server.ts`):**

- The `getMonitors` action already filters by `status`; extend it to also filter by `type` when the `type` parameter is present.
- Pass `type` down to `db.getMonitors({ ..., type })`.

**DB layer (`src/lib/server/db/repositories/monitors.ts` or equivalent):**

- Add `type?: string` to the `getMonitors` options and add `.where("type", type)` when provided.

---

## Feature 5: Menu Reorder + Distinct Icons (#10)

### Problem

In `src/routes/(manage)/+layout.svelte`, the nav order is currently Users → Roles → Groups. It should be Users → Groups → Roles with distinct icons: a single-person icon for Users and a multi-person icon for Groups.

### Design

**Frontend (`src/routes/(manage)/+layout.svelte`):**

- Reorder nav entries: Users first, Groups second, Roles third.
- Users icon: `UserIcon` from `@lucide/svelte/icons/user` (single person).
- Groups icon: `UsersRoundIcon` from `@lucide/svelte/icons/users-round` (already imported in the last session).
- Roles icon: keep existing (e.g. `ShieldIcon`).

---

## Implementation Order

1. **Feature 5** (layout reorder + icons) — pure cosmetic, ~5 lines
2. **Feature 2** (sortable nav) — frontend only, ~10 lines
3. **Feature 4** (monitor type filter) — small full-stack change
4. **Feature 1** (SVG support) — backend + frontend MIME changes
5. **Feature 3** (timezone dropdown) — new UI component wiring

Each feature is independently committable.
