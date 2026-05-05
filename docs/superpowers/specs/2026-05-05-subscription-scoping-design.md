# Subscription Scoping — Design Spec

**Date:** 2026-05-05

## Overview

Allow visitors to subscribe to specific monitors per event type, instead of receiving all incident or maintenance notifications globally. Existing global subscriptions continue to work without any migration.

---

## Scope

- Public `SubscribeMenu` gains per-event-type monitor selection (incidents independently from maintenances).
- Admin subscriptions table gains a read/edit scope column per subscriber.
- Notification path filters recipients by the affected monitors.
- No changes to other subscription features (OTP flow, admin global toggles, method types).

---

## Database

### New migration: `subscription_monitor_scopes`

```sql
CREATE TABLE subscription_monitor_scopes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES user_subscriptions_v2(id) ON DELETE CASCADE,
  monitor_tag VARCHAR(255) NOT NULL,
  UNIQUE (subscription_id, monitor_tag)
);
CREATE INDEX idx_sms_subscription_id ON subscription_monitor_scopes(subscription_id);
```

**Semantics:** A `user_subscriptions_v2` row with **no** rows in `subscription_monitor_scopes` means "all monitors". A row with one or more scopes means "only these monitors".

No changes to `user_subscriptions_v2`. Existing rows have no scope rows → all existing subscriptions continue to receive all notifications.

---

## Notification Path

### `SubscriptionVariableMap` (types.ts)

Add one field:

```typescript
export interface SubscriptionVariableMap {
  title: string;
  cta_url: string;
  cta_text: string;
  update_text: string;
  update_subject: string;
  update_id: string;
  event_type: SubscriptionEventType;
  monitor_tags: string[];   // ← new: monitors affected by this event
}
```

If `monitor_tags` is empty, treat as "send to everyone" (safety fallback — no scoping applied).

### `alertingQueue.ts`

Both `subscriberQueue.push(...)` calls (incident creation and incident closure) gain `monitor_tags: [monitorTag]`. The `monitorTag` variable is already in scope at both call sites.

### `notification_utils.ts` — `maintenanceToVariables`

Signature gains `monitorTags: string[]`:

```typescript
export function maintenanceToVariables(
  event: MaintenanceEventRecordDetailed,
  monitorNames: string,
  monitorTags: string[],        // ← new
  statusMessage: string,
  updateIdSuffix: string,
  subjectPrefix: string,
  siteUrl: string = "",
): SubscriptionVariableMap {
  // ...existing body...
  return {
    // ...existing fields...
    monitor_tags: monitorTags,  // ← new
  };
}
```

All callers in `maintenanceController.ts` already query the maintenance monitors (to build `monitorNames`). They pass the raw `monitor_tag` array to this function.

### `subscriptionSystem.ts` — `getSubscribersForEvent`

Signature gains `monitorTags: string[]`. Query uses EXISTS subqueries to handle the "no scope = all" semantic:

```typescript
getSubscribersForEvent(eventType: SubscriptionEventType, monitorTags: string[])
```

SQL logic (Knex builder):

```
WHERE us.event_type = ? AND us.status = ACTIVE AND su.status = ACTIVE AND sm.status = ACTIVE
AND (
  -- No scope rows → subscribed to all monitors
  NOT EXISTS (SELECT 1 FROM subscription_monitor_scopes WHERE subscription_id = us.id)
  -- OR at least one scope matches an affected monitor
  OR EXISTS (
    SELECT 1 FROM subscription_monitor_scopes
    WHERE subscription_id = us.id AND monitor_tag IN (?)
  )
)
```

When `monitorTags` is empty, skip the filter entirely (return all active subscribers).

### `userSubscriptionsController.ts` — `GetActiveEmailsForEventType`

Renamed to `GetActiveEmailsForEvent(eventType, monitorTags: string[])`. Passes `monitorTags` through to the repository query.

### `subscriberQueue.ts`

Reads `variables.monitor_tags` and passes it to `GetActiveEmailsForEvent`.

---

## Public API

### `POST /dashboard-apis/subscription` — action `updatePreferences`

Extended payload:

```typescript
{
  action: "updatePreferences",
  token: string,
  incidents?: boolean,
  incident_monitors?: string[],    // [] = all, [...tags] = specific
  maintenances?: boolean,
  maintenance_monitors?: string[], // [] = all, [...tags] = specific
}
```

Server side (`src/lib/server/api-server/subscription/post.ts`):
- After updating `user_subscriptions_v2` rows, replace scope rows:
  - Delete all `subscription_monitor_scopes` rows for the updated subscription_id.
  - Insert new rows for each tag in `incident_monitors` / `maintenance_monitors`.
  - Empty array → delete all scope rows (reverts to "all monitors").

### `GET /dashboard-apis/subscription/monitors`

New lightweight endpoint returning the list of visible monitors for the scope picker:

```typescript
// Response
{ monitors: Array<{ tag: string; name: string }> }
```

Calls `GetMonitorsParsed()` and returns only `tag` and `name` fields (no sensitive config). Hidden monitors (`is_hidden = true`) are excluded.

### `GET /dashboard-apis/subscription` — existing preferences endpoint

Response gains scope arrays:

```typescript
{
  incidents: boolean,
  incident_monitors: string[],    // [] = all monitors
  maintenances: boolean,
  maintenance_monitors: string[], // [] = all monitors
}
```

---

## Admin API (manage)

### New action: `adminUpdateSubscriptionScope`

**File:** `src/routes/(manage)/manage/api/+server.ts`

Permission: `subscriptions.write`

Payload: `{ methodId: number, eventType: "incidents" | "maintenances", monitorTags: string[] }`

- Finds the `user_subscriptions_v2` row for `(subscriber_method_id = methodId, event_type = eventType)`.
- Deletes all existing scope rows for that subscription_id.
- Inserts new scope rows for each tag in `monitorTags`.
- Empty array → clears scopes (all monitors).

### `getAdminSubscribers` response

Each subscriber record gains:

```typescript
{
  // ...existing fields...
  incident_monitors: string[],    // [] = all
  maintenance_monitors: string[], // [] = all
}
```

Server joins `subscription_monitor_scopes` when building the admin subscriber list.

---

## Public UI — `SubscribeMenu.svelte`

### Monitor list loading

On mount (after login token is detected), call `GET /dashboard-apis/subscription/monitors`. Store as `availableMonitors: { tag: string; name: string }[]`.

### Preferences view changes

Below each event-type switch (when the switch is ON), render a monitor scope picker:

```
[Incident Updates]  ●──────  ON

  Notify me about:
  ○ All monitors
  ● Specific monitors
      ☑ API Gateway
      ☐ Database
      ☑ Auth Service
```

- Default: "All monitors" (radio selected, no checkboxes shown).
- Switching to "Specific monitors" reveals the checkbox list.
- Selecting zero monitors while "Specific monitors" is active is invalid — show inline error "Select at least one monitor".
- When the event-type switch is turned OFF, the scope picker is hidden (scope state preserved in memory but not sent).

### `updatePreferences` call

Sends `incident_monitors` / `maintenance_monitors` whenever the scope picker is shown, even if unchanged (server replaces scope rows idempotently).

### Token / localStorage

The existing subscriber JWT does not encode monitor selections — preferences are always loaded fresh from the server on mount. No JWT changes needed.

---

## Admin UI — `subscriptions/+page.svelte`

### Subscribers table

Add a "Scope" column after the Incidents/Maintenances toggles. Values:
- "All" — grey badge, no scoping active for either event type.
- "Scoped" — amber badge, at least one event type has a monitor filter.

Clicking the badge opens a `Dialog` with two sections (Incidents / Maintenances), each showing the current scope as a comma-separated monitor list with an Edit button. Clicking Edit shows a checkbox list of all monitors. Saving calls `adminUpdateSubscriptionScope`.

---

## Constraints

- A subscriber with specific monitors for incidents but "all" for maintenances is fully supported: the incidents subscription has scope rows, the maintenances subscription has none.
- If a monitored tag is later deleted, its scope rows remain. The subscriber simply never matches that tag again — no error, no cleanup required.
- The `subscription_monitor_scopes` table is append-replace (delete-then-insert on each save), not incremental patch, to keep the logic simple.
- `is_hidden = true` monitors are excluded from the public scope picker to avoid leaking monitor existence.
