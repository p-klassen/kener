# Subscription Scope Enhancement — Part 2 Design Spec

**Date:** 2026-05-14

## Goal

Extend the existing subscription scope system (from `2026-05-05-subscription-scoping-design.md`) with two capabilities:

1. **Page-level scope selection** — users and admins can subscribe to an entire page (all current and future monitors on that page), not just individual monitors.
2. **Permission-based filtering** — the scope picker only shows pages and monitors the subscriber actually has view permission for on the status page.

This builds on the `subscription_monitor_scopes` table and the existing controller/repository layer introduced in Part 1.

---

## Backwards Compatibility

All existing `scope_type='monitor'` rows continue to function unchanged. The migration adds a column with a default, so existing data requires no transformation. All existing API contracts are backwards-compatible (new fields are additive).

---

## Data Model

### Migration: `subscription_monitor_scopes` extension

```sql
ALTER TABLE subscription_monitor_scopes
  RENAME COLUMN monitor_tag TO scope_identifier;

ALTER TABLE subscription_monitor_scopes
  ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'monitor';
```

**Semantics:**

| `scope_type` | `scope_identifier` value | Meaning |
|---|---|---|
| `'monitor'` | a monitor tag (e.g. `"api-gateway"`) | Subscribe to that specific monitor |
| `'page'` | a page slug (e.g. `"home"`) | Subscribe to all monitors on that page, dynamically |

The "no rows = all monitors" semantic from Part 1 is unchanged.

All existing rows receive `scope_type = 'monitor'` via the migration default — no data changes needed.

---

## Repository (`subscriptionSystem.ts`)

### Renamed / updated functions

**`upsertSubscriptionScopes(subscriptionId, monitorTags, pageSlugs)`**

Replaces `upsertSubscriptionMonitorScopes`. Atomically deletes all existing scope rows for the subscription, then inserts:
- One row per entry in `monitorTags` with `scope_type = 'monitor'`
- One row per entry in `pageSlugs` with `scope_type = 'page'`

Empty arrays for both = clears scopes (reverts to "all monitors").

**`getSubscriptionScopes(subscriptionId)`**

Replaces `getSubscriptionMonitorScopes`. Returns:
```typescript
{ monitors: string[], pages: string[] }
```

### Updated notification query: `getSubscribersForEvent`

Signature: `getSubscribersForEvent(eventType, triggeredMonitorTags[])`

The query gains additional logic to expand page-level scopes. For each triggered monitor, its parent page slug must be resolved (via a join on the `pages` → `monitor_pages` relationship). A subscriber matches if:

```sql
-- No scopes → all monitors (existing behaviour)
NOT EXISTS (SELECT 1 FROM subscription_monitor_scopes WHERE subscription_id = us.id)
OR
-- Direct monitor scope match (existing behaviour, renamed column)
EXISTS (
  SELECT 1 FROM subscription_monitor_scopes
  WHERE subscription_id = us.id
    AND scope_type = 'monitor'
    AND scope_identifier IN (:triggeredMonitorTags)
)
OR
-- Page scope match: monitor belongs to a subscribed page
EXISTS (
  SELECT 1 FROM subscription_monitor_scopes sms
  JOIN monitor_pages mp ON mp.page_slug = sms.scope_identifier
  WHERE sms.subscription_id = us.id
    AND sms.scope_type = 'page'
    AND mp.monitor_tag IN (:triggeredMonitorTags)
)
```

> **Note:** The join table name (`monitor_pages`) and exact column names must be verified against the actual schema during implementation. The intent is: resolve which page(s) each triggered monitor belongs to, then check if the subscriber has a page-scope entry for any of those pages.

---

## Controller (`userSubscriptionsController.ts`)

### New function: `GetAccessibleScopesForSubscriber(methodId)`

Used by the admin UI to populate the scope picker with only content the subscriber can view.

```typescript
async function GetAccessibleScopesForSubscriber(methodId: number): Promise<{
  pages: Array<{ slug: string; name: string }>;
  monitors: Array<{ tag: string; name: string; page_slug: string }>;
}>
```

Logic:
1. Load subscriber via `methodId` → get `linked_user_id`
2. If `linked_user_id` is set: call `getAccessibleResources(linked_user_id)` to get accessible page IDs and monitor tags
3. If no `linked_user_id`: fetch all public pages and public monitors
4. Return pages (with slug + name) and monitors (with tag + name + `page_slug` for grouping)

### Updated: `AdminUpdateSubscriptionScope`

Signature change:
```typescript
AdminUpdateSubscriptionScope(
  methodId: number,
  eventType: SubscriptionEventType,
  monitorTags: string[],
  pageSlugs: string[]   // NEW
): Promise<void>
```

Delegates to `upsertSubscriptionScopes(subscriptionId, monitorTags, pageSlugs)`.

### Updated: `UpdateSubscriberPreferences`

The existing `incident_monitors` / `maintenance_monitors` fields remain. Two new optional fields are added:

```typescript
incident_pages?: string[]     // page slugs for incident subscription scope
maintenance_pages?: string[]  // page slugs for maintenance subscription scope
```

The permission validation step that already filters `incident_monitors` / `maintenance_monitors` against accessible resources is extended to also filter `incident_pages` / `maintenance_pages` against accessible page slugs.

Calls `upsertSubscriptionScopes(subscriptionId, monitorTags, pageSlugs)` instead of the old upsert.

### Updated: `GetAdminSubscribersPaginated`

The returned record per subscriber gains:
```typescript
incident_pages: string[]      // [] = no page scopes
maintenance_pages: string[]   // [] = no page scopes
```

These are read from `subscription_monitor_scopes` where `scope_type = 'page'`.

---

## API (`manage/api` actions)

### Updated: `adminUpdateSubscriptionScope`

Request body gains `pageSlugs: string[]`. Passed through to `AdminUpdateSubscriptionScope`.

### New: `getSubscriberAccessibleScopes`

```typescript
// Request
{ action: "getSubscriberAccessibleScopes", data: { methodId: number } }

// Response
{
  pages: Array<{ slug: string; name: string }>;
  monitors: Array<{ tag: string; name: string; page_slug: string }>;
}
```

Permission: `subscriptions.read`

Calls `GetAccessibleScopesForSubscriber(methodId)`.

---

## Public API (`/dashboard-apis/subscription`)

### Updated: `updatePreferences` action

Request body gains:
```typescript
incident_pages?: string[]
maintenance_pages?: string[]
```

### Updated: `GET /dashboard-apis/subscription`

Response gains:
```typescript
incident_pages: string[]
maintenance_pages: string[]
```

### Updated: `GET /dashboard-apis/subscription/monitors`

Extended (same URL, backwards-compatible response superset). Returns pages and monitors grouped, filtered by the current user's session permissions:

```typescript
{
  pages: Array<{ slug: string; name: string }>;
  monitors: Array<{ tag: string; name: string; page_slug: string }>;
}
```

If the request has no subscriber token: returns only public pages and public monitors.
If the request has a valid subscriber token with a `linked_user_id`: returns public + role-accessible pages and monitors.

---

## Admin UI (`/manage/app/subscriptions`)

### Scope dialog

The existing "Monitor Scope" dialog is replaced with a **"Subscription Scope" dialog**. It opens when the admin clicks the scope indicator for a subscriber (for Incidents or Maintenances separately).

**On open:** Calls `getSubscriberAccessibleScopes(methodId)`. Groups monitors by `page_slug`.

**Layout:**

```
☐  [Page]  API Status
       ☐  API Gateway
       ☐  Auth Service

☑  [Page]  Web Frontend       ← whole page selected
       —   Web App            ← disabled (covered by page scope)
       —   CDN

☐  [Page]  Infrastructure
       ☑  Database            ← individual monitor selected
       ☐  Redis
```

Rules:
- Checking a page checkbox selects the page as a unit (`scope_type='page'`). Individual monitor checkboxes beneath it are disabled and shown with a "(via Page)" indicator.
- Unchecking a page reveals individual monitor checkboxes again (preserving their previous state).
- A page and individual monitors can be mixed across different pages.
- Checking zero items is valid — it means "all monitors" (no scope rows).

**Save:** Collects selected page slugs and selected monitor tags separately; sends `{ methodId, eventType, monitorTags, pageSlugs }` to `adminUpdateSubscriptionScope`.

### Scope indicator in the table

The existing scope badge is updated to reflect page scopes:

| State | Badge |
|---|---|
| No scope (all monitors) | grey "All" |
| Only monitor scopes | amber "N monitors" |
| Any page scopes | amber "N pages [+ M monitors]" |

---

## Self-Service UI (`SubscribeMenu.svelte`)

### Scope options loading

On mount, after token resolution, call `GET /dashboard-apis/subscription/scope-options` instead of the existing monitors endpoint. Store `availablePages` and `availableMonitors` (grouped).

### Scope picker

Same grouped layout as the admin dialog, rendered inline below the event-type switch when it is ON:

```
[Incident Updates]  ●──────  ON

  Notify me about:
  ○ All monitors
  ● Specific pages / monitors
      ☐ [Page]  API Status
           ☐  API Gateway
      ☑ [Page]  Web Frontend
           —   Web App
      ☐ [Page]  Infrastructure
           ☑  Database
```

- If the subscriber has no accessible private content (anonymous / no linked account), only public pages and monitors appear.
- Selecting zero items while "Specific pages / monitors" is active is invalid — inline error: "Select at least one page or monitor."

### `updatePreferences` call

Sends `incident_pages`, `maintenance_pages` alongside the existing `incident_monitors`, `maintenance_monitors`.

---

## Constraints

- If a page is later deleted, its `scope_type='page'` rows remain. The notification query simply finds no monitors matching that page slug — no error, no cleanup required.
- If a monitor is added to a page after a subscriber selected that page, the new monitor is automatically included (dynamic expansion at notification time).
- The admin scope picker only shows pages/monitors the subscriber can view — it is not possible for an admin to subscribe someone to content they cannot see.
- `is_hidden = true` monitors are excluded from both the admin and self-service scope pickers.
- The monitor-pages join in the notification query must handle monitors that belong to multiple pages (many-to-many). A subscriber with any matching page scope receives the notification.
