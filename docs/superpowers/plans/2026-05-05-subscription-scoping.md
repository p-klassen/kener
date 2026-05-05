# Subscription Scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow visitors to subscribe to specific monitors per event type (incidents and maintenances independently), with existing global subscriptions continuing to work unchanged.

**Architecture:** New `subscription_monitor_scopes` table scopes existing `user_subscriptions_v2` rows. Empty scopes = all monitors (backward compatible). Notification path gains `monitor_tags` throughout; the subscriber queue filters recipients by the affected monitors. Public SubscribeMenu gains a scope picker; the admin subscriptions page gains a scope badge and edit dialog.

**Tech Stack:** TypeScript, Knex.js (migration + query builder), BullMQ (queues), SvelteKit 5 (Svelte 5 runes), shadcn-svelte, Tailwind CSS v4

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `migrations/20260505120000_add_subscription_monitor_scopes.ts` | Create | `subscription_monitor_scopes` table |
| `src/lib/server/db/repositories/subscriptionSystem.ts` | Modify | Add scope CRUD + extend `getSubscribersForEvent` |
| `src/lib/server/db/dbimpl.ts` | Modify | Expose 2 new repo methods |
| `src/lib/server/notification/types.ts` | Modify | Add `monitor_tags` to `SubscriptionVariableMap` |
| `src/lib/server/notification/notification_utils.ts` | Modify | Add `monitorTags` param to `maintenanceToVariables` |
| `src/lib/server/controllers/maintenanceController.ts` | Modify | Pass monitor tags at 5 `maintenanceToVariables` call sites |
| `src/lib/server/queues/alertingQueue.ts` | Modify | Add `monitor_tags: [monitorTag]` at 2 subscriber pushes |
| `src/lib/server/controllers/userSubscriptionsController.ts` | Modify | Rename `GetActiveEmailsForEventType` → `GetActiveEmailsForEvent`, extend `UpdateSubscriberPreferences`, extend `AdminSubscriberRecord`, add `AdminUpdateSubscriptionScope` |
| `src/lib/server/queues/subscriberQueue.ts` | Modify | Pass `monitor_tags` to `GetActiveEmailsForEvent` |
| `src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts` | Create | Public monitors list endpoint |
| `src/lib/server/api-server/subscription/post.ts` | Modify | Extend `updatePreferences` + `getPreferences` response |
| `src/lib/components/SubscribeMenu.svelte` | Modify | Add per-event-type monitor scope picker |
| `src/routes/(manage)/manage/api/+server.ts` | Modify | Add `adminUpdateSubscriptionScope` action |
| `src/routes/(manage)/manage/app/subscriptions/+page.svelte` | Modify | Add Scope column with badge and edit dialog |

---

### Task 1: DB Migration + scope CRUD methods

**Files:**
- Create: `migrations/20260505120000_add_subscription_monitor_scopes.ts`
- Modify: `src/lib/server/db/repositories/subscriptionSystem.ts`
- Modify: `src/lib/server/db/dbimpl.ts`

- [ ] **Step 1: Create the migration file**

Create `migrations/20260505120000_add_subscription_monitor_scopes.ts`:

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("subscription_monitor_scopes"))) {
    await knex.schema.createTable("subscription_monitor_scopes", (table) => {
      table.increments("id").primary();
      table.integer("subscription_id").unsigned().notNullable();
      table.string("monitor_tag", 255).notNullable();
      table.unique(["subscription_id", "monitor_tag"]);
    });
  }
  try {
    await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
      table.index(["subscription_id"]);
    });
  } catch (_e) {
    /* index already exists */
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("subscription_monitor_scopes");
}
```

- [ ] **Step 2: Add `upsertSubscriptionMonitorScopes` and `getSubscriptionMonitorScopes` to the repository**

In `src/lib/server/db/repositories/subscriptionSystem.ts`, add these two methods to the `SubscriptionSystemRepository` class right before the closing brace of the class (after `getSubscriberDetailsByMethodId`):

```typescript
  async upsertSubscriptionMonitorScopes(subscriptionId: number, monitorTags: string[]): Promise<void> {
    await this.knex("subscription_monitor_scopes").where("subscription_id", subscriptionId).del();
    if (monitorTags.length > 0) {
      await this.knex("subscription_monitor_scopes").insert(
        monitorTags.map((tag) => ({ subscription_id: subscriptionId, monitor_tag: tag })),
      );
    }
  }

  async getSubscriptionMonitorScopes(subscriptionId: number): Promise<string[]> {
    return await this.knex("subscription_monitor_scopes")
      .where("subscription_id", subscriptionId)
      .pluck("monitor_tag");
  }
```

- [ ] **Step 3: Register the new methods in `dbimpl.ts`**

In `src/lib/server/db/dbimpl.ts`, add these two lines after the `getSubscriberDetailsByMethodId!` declaration (around line 369):

```typescript
  upsertSubscriptionMonitorScopes!: SubscriptionSystemRepository["upsertSubscriptionMonitorScopes"];
  getSubscriptionMonitorScopes!: SubscriptionSystemRepository["getSubscriptionMonitorScopes"];
```

- [ ] **Step 4: Verify type check passes**

```bash
cd /Users/pklassen/git/kener && npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 5: Commit**

```bash
git add migrations/20260505120000_add_subscription_monitor_scopes.ts \
        src/lib/server/db/repositories/subscriptionSystem.ts \
        src/lib/server/db/dbimpl.ts
git commit -m "feat: add subscription_monitor_scopes table and repository methods"
```

---

### Task 2: Notification path wiring

**Files:**
- Modify: `src/lib/server/notification/types.ts`
- Modify: `src/lib/server/notification/notification_utils.ts`
- Modify: `src/lib/server/controllers/maintenanceController.ts`
- Modify: `src/lib/server/queues/alertingQueue.ts`
- Modify: `src/lib/server/db/repositories/subscriptionSystem.ts`
- Modify: `src/lib/server/controllers/userSubscriptionsController.ts`
- Modify: `src/lib/server/queues/subscriberQueue.ts`

- [ ] **Step 1: Add `monitor_tags` to `SubscriptionVariableMap`**

In `src/lib/server/notification/types.ts`, replace the `SubscriptionVariableMap` interface:

```typescript
export interface SubscriptionVariableMap {
  title: string;
  cta_url: string;
  cta_text: string;
  update_text: string;
  update_subject: string;
  update_id: string;
  event_type: SubscriptionEventType;
  monitor_tags: string[];
}
```

- [ ] **Step 2: Add `monitorTags` parameter to `maintenanceToVariables`**

In `src/lib/server/notification/notification_utils.ts`, replace the entire `maintenanceToVariables` function:

```typescript
export function maintenanceToVariables(
  event: MaintenanceEventRecordDetailed,
  monitorNames: string,
  monitorTags: string[],
  statusMessage: string,
  updateIdSuffix: string,
  subjectPrefix: string,
  siteUrl: string = "",
): SubscriptionVariableMap {
  const template = formatMaintenanceMarkdown(monitorNames, event, statusMessage);
  return {
    title: `${subjectPrefix}: ${event.title}`,
    event_type: "maintenances",
    cta_url: siteUrl + "maintenances/" + event.maintenance_id,
    cta_text: "View Maintenance Details",
    update_id: `maintenance_${event.id}_${updateIdSuffix}`,
    update_subject: `${subjectPrefix}: ${event.title}`,
    update_text: template,
    monitor_tags: monitorTags,
  };
}
```

- [ ] **Step 3: Update `CreateMaintenanceEventWithNotification` call site in `maintenanceController.ts`**

In `src/lib/server/controllers/maintenanceController.ts`, around line 136, replace the `maintenanceToVariables` call:

```typescript
      const update = maintenanceToVariables(
        eventDetailed,
        monitorNames,
        monitors.map((m) => m.monitor_tag),
        "**has been created**",
        "created",
        "Maintenance Created",
        siteUrl,
      );
```

- [ ] **Step 4: Update the 4 remaining `maintenanceToVariables` call sites in the scheduler section of `maintenanceController.ts`**

There are 4 more call sites in `maintenanceController.ts` (around lines 632, 653, 674, 695). In each case, `monitors` is already available from `await db.getMonitorsByMaintenanceId(event.maintenance_id)` on the preceding line. Add `monitors.map((m) => m.monitor_tag)` as the third argument in each call.

Replace around line 632:
```typescript
        const update = maintenanceToVariables(
          event,
          monitorNames,
          monitors.map((m) => m.monitor_tag),
          `**is starting in ${timeUntilStart}**`,
          "starting_soon",
          "Maintenance Starting Soon",
          siteUrl,
        );
```

Replace around line 653:
```typescript
        const update = maintenanceToVariables(
          event,
          monitorNames,
          monitors.map((m) => m.monitor_tag),
          "**is now in progress**",
          "ongoing",
          "Maintenance In Progress",
          siteUrl,
        );
```

Replace around line 674 (second ONGOING call):
```typescript
        const update = maintenanceToVariables(
          event,
          monitorNames,
          monitors.map((m) => m.monitor_tag),
          "**is now in progress**",
          "ongoing",
          "Maintenance In Progress",
          siteUrl,
        );
```

Replace around line 695:
```typescript
        const update = maintenanceToVariables(
          event,
          monitorNames,
          monitors.map((m) => m.monitor_tag),
          "**has been completed**",
          "completed",
          "Maintenance Completed",
          siteUrl,
        );
```

- [ ] **Step 5: Add `monitor_tags` to both subscriber pushes in `alertingQueue.ts`**

In `src/lib/server/queues/alertingQueue.ts`, in `createNewIncident` (around line 85), replace the `updateVariables` object:

```typescript
  const updateVariables: SubscriptionVariableMap = {
    title: incidentInput.title,
    cta_url: siteUrl + "incidents/" + incidentCreated.incident_id,
    cta_text: "View Incident",
    update_text: mdToHTML(update),
    update_subject: `[#${incidentCreated.incident_id}:${GC.TRIGGERED}] ${incidentInput.title}`,
    update_id: String(incidentCreated.incident_id),
    event_type: "incidents",
    monitor_tags: [monitorTag],
  };
```

In `closeIncident` (around line 127), replace the `updateMessage` object:

```typescript
  const updateMessage: SubscriptionVariableMap = {
    title: incident.title,
    cta_url: `${siteUrl}incidents/${incident_id}`,
    cta_text: "View Incident",
    update_text: mdToHTML(comment),
    update_subject: `[#${incident.id}:${GC.RESOLVED}] ${incident.title}`,
    update_id: String(incident_id),
    event_type: "incidents",
    monitor_tags: [monitorTag],
  };
```

- [ ] **Step 6: Extend `getSubscribersForEvent` to filter by monitor tags**

In `src/lib/server/db/repositories/subscriptionSystem.ts`, replace the `getSubscribersForEvent` method signature and add the monitor filter:

```typescript
  async getSubscribersForEvent(
    eventType: SubscriptionEventType,
    monitorTags: string[],
  ): Promise<
    Array<{
      user: SubscriberUserRecord;
      method: SubscriberMethodRecord;
      subscription: UserSubscriptionV2Record;
    }>
  > {
    let query = this.knex("user_subscriptions_v2 as us")
      .join("subscriber_users as su", "us.subscriber_user_id", "su.id")
      .join("subscriber_methods as sm", "us.subscriber_method_id", "sm.id")
      .where("us.event_type", eventType)
      .andWhere("us.status", "ACTIVE")
      .andWhere("su.status", "ACTIVE")
      .andWhere("sm.status", "ACTIVE");

    if (monitorTags.length > 0) {
      query = query.where((builder) => {
        builder
          .whereNotExists(
            this.knex("subscription_monitor_scopes")
              .select(1)
              .whereRaw("subscription_id = us.id"),
          )
          .orWhereExists(
            this.knex("subscription_monitor_scopes")
              .select(1)
              .whereRaw("subscription_id = us.id")
              .whereIn("monitor_tag", monitorTags),
          );
      });
    }

    const rows = await query.select(
      "su.id as user_id",
      "su.email as user_email",
      "su.status as user_status",
      "su.created_at as user_created_at",
      "sm.id as method_id",
      "sm.method_type",
      "sm.method_value",
      "sm.status as method_status",
      "sm.meta as method_meta",
      "us.id as sub_id",
      "us.event_type",
      "us.status as sub_status",
      "us.created_at as sub_created_at",
    );

    return rows.map((row) => ({
      user: {
        id: row.user_id,
        email: row.user_email,
        status: row.user_status,
        verification_code: null,
        verification_expires_at: null,
        created_at: row.user_created_at,
        updated_at: row.user_created_at,
      },
      method: {
        id: row.method_id,
        subscriber_user_id: row.user_id,
        method_type: row.method_type,
        method_value: row.method_value,
        status: row.method_status,
        meta: row.method_meta,
        created_at: row.sub_created_at,
        updated_at: row.sub_created_at,
      },
      subscription: {
        id: row.sub_id,
        subscriber_user_id: row.user_id,
        subscriber_method_id: row.method_id,
        event_type: row.event_type,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        status: row.sub_status,
        created_at: row.sub_created_at,
        updated_at: row.sub_created_at,
      },
    }));
  }
```

- [ ] **Step 7: Rename `GetActiveEmailsForEventType` to `GetActiveEmailsForEvent` and add `monitorTags` parameter**

In `src/lib/server/controllers/userSubscriptionsController.ts`, replace the `GetActiveEmailsForEventType` function:

```typescript
export async function GetActiveEmailsForEvent(
  eventType: SubscriptionEventType,
  monitorTags: string[],
): Promise<string[]> {
  const subscribers = await db.getSubscribersForEvent(eventType, monitorTags);
  const emails = subscribers.filter((s) => s.method.method_type === "email").map((s) => s.method.method_value);
  return [...new Set(emails)];
}
```

- [ ] **Step 8: Update `subscriberQueue.ts` to use the renamed function and pass `monitor_tags`**

In `src/lib/server/queues/subscriberQueue.ts`, replace the import line:

```typescript
import { GetActiveEmailsForEvent } from "../controllers/userSubscriptionsController.js";
```

Then replace the call to `GetActiveEmailsForEventType`:

```typescript
      const subscriberEmails = await GetActiveEmailsForEvent(eventType, variables.monitor_tags ?? []);
```

- [ ] **Step 9: Verify type check passes**

```bash
cd /Users/pklassen/git/kener && npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/notification/types.ts \
        src/lib/server/notification/notification_utils.ts \
        src/lib/server/controllers/maintenanceController.ts \
        src/lib/server/queues/alertingQueue.ts \
        src/lib/server/db/repositories/subscriptionSystem.ts \
        src/lib/server/controllers/userSubscriptionsController.ts \
        src/lib/server/queues/subscriberQueue.ts
git commit -m "feat: wire monitor_tags through notification path for subscription scoping"
```

---

### Task 3: Public API extensions

**Files:**
- Create: `src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts`
- Modify: `src/lib/server/api-server/subscription/post.ts`
- Modify: `src/lib/server/controllers/userSubscriptionsController.ts`

- [ ] **Step 1: Create the public monitors endpoint**

Create `src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts`:

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetMonitorsParsed } from "$lib/server/controllers/controller.js";

export const GET: RequestHandler = async () => {
  const monitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO" });
  return json({
    monitors: monitors.map((m) => ({ tag: m.tag, name: m.name })),
  });
};
```

- [ ] **Step 2: Extend `UpdateSubscriberPreferences` to accept and save monitor scopes**

In `src/lib/server/controllers/userSubscriptionsController.ts`, replace the `UpdateSubscriberPreferences` function with this version that accepts and stores scope arrays:

```typescript
export async function UpdateSubscriberPreferences(
  token: string,
  preferences: {
    incidents?: boolean;
    incident_monitors?: string[];
    maintenances?: boolean;
    maintenance_monitors?: string[];
  },
): Promise<{ success: boolean; error?: string }> {
  const verifyResult = await VerifySubscriberToken(token);
  if (!verifyResult.success || !verifyResult.user || !verifyResult.method) {
    return { success: false, error: verifyResult.error || "Invalid token" };
  }

  const { user, method } = verifyResult;

  if (preferences.incidents !== undefined) {
    const existingSub = await db.getUserSubscriptionsV2({
      subscriber_user_id: user.id,
      subscriber_method_id: method.id,
      event_type: "incidents",
    });

    if (preferences.incidents) {
      if (existingSub.length === 0) {
        const created = await db.createUserSubscriptionV2({
          subscriber_user_id: user.id,
          subscriber_method_id: method.id,
          event_type: "incidents",
          status: "ACTIVE",
        });
        if (preferences.incident_monitors !== undefined) {
          await db.upsertSubscriptionMonitorScopes(created.id, preferences.incident_monitors);
        }
      } else {
        if (existingSub[0].status !== "ACTIVE") {
          await db.updateUserSubscriptionV2(existingSub[0].id, { status: "ACTIVE" });
        }
        if (preferences.incident_monitors !== undefined) {
          await db.upsertSubscriptionMonitorScopes(existingSub[0].id, preferences.incident_monitors);
        }
      }
    } else {
      if (existingSub.length > 0 && existingSub[0].status === "ACTIVE") {
        await db.updateUserSubscriptionV2(existingSub[0].id, { status: "INACTIVE" });
      }
    }
  }

  if (preferences.maintenances !== undefined) {
    const existingSub = await db.getUserSubscriptionsV2({
      subscriber_user_id: user.id,
      subscriber_method_id: method.id,
      event_type: "maintenances",
    });

    if (preferences.maintenances) {
      if (existingSub.length === 0) {
        const created = await db.createUserSubscriptionV2({
          subscriber_user_id: user.id,
          subscriber_method_id: method.id,
          event_type: "maintenances",
          status: "ACTIVE",
        });
        if (preferences.maintenance_monitors !== undefined) {
          await db.upsertSubscriptionMonitorScopes(created.id, preferences.maintenance_monitors);
        }
      } else {
        if (existingSub[0].status !== "ACTIVE") {
          await db.updateUserSubscriptionV2(existingSub[0].id, { status: "ACTIVE" });
        }
        if (preferences.maintenance_monitors !== undefined) {
          await db.upsertSubscriptionMonitorScopes(existingSub[0].id, preferences.maintenance_monitors);
        }
      }
    } else {
      if (existingSub.length > 0 && existingSub[0].status === "ACTIVE") {
        await db.updateUserSubscriptionV2(existingSub[0].id, { status: "INACTIVE" });
      }
    }
  }

  return { success: true };
}
```

- [ ] **Step 3: Extend `post.ts` — `UpdatePreferencesRequest` type and handler**

In `src/lib/server/api-server/subscription/post.ts`, replace the `UpdatePreferencesRequest` interface:

```typescript
interface UpdatePreferencesRequest {
  action: "updatePreferences";
  token: string;
  incidents?: boolean;
  incident_monitors?: string[];
  maintenances?: boolean;
  maintenance_monitors?: string[];
}
```

Then replace `handleUpdatePreferences` and its call site in the switch:

Switch case update:
```typescript
    case "updatePreferences":
      return handleUpdatePreferences(
        (body as UpdatePreferencesRequest).token,
        (body as UpdatePreferencesRequest).incidents,
        (body as UpdatePreferencesRequest).incident_monitors,
        (body as UpdatePreferencesRequest).maintenances,
        (body as UpdatePreferencesRequest).maintenance_monitors,
        config,
      );
```

Replace `handleUpdatePreferences`:
```typescript
async function handleUpdatePreferences(
  token: string,
  incidents: boolean | undefined,
  incidentMonitors: string[] | undefined,
  maintenances: boolean | undefined,
  maintenanceMonitors: string[] | undefined,
  config: SubscriptionsConfig,
): Promise<Response> {
  const preferences: {
    incidents?: boolean;
    incident_monitors?: string[];
    maintenances?: boolean;
    maintenance_monitors?: string[];
  } = {};

  if (incidents !== undefined && config.methods?.emails?.incidents) {
    preferences.incidents = incidents;
    if (incidentMonitors !== undefined) {
      preferences.incident_monitors = incidentMonitors;
    }
  }
  if (maintenances !== undefined && config.methods?.emails?.maintenances) {
    preferences.maintenances = maintenances;
    if (maintenanceMonitors !== undefined) {
      preferences.maintenance_monitors = maintenanceMonitors;
    }
  }

  const result = await UpdateSubscriberPreferences(token, preferences);
  if (!result.success) {
    return error(400, { message: result.error || "Failed to update preferences" });
  }

  return json({ success: true });
}
```

- [ ] **Step 4: Extend `handleGetPreferences` to return scope arrays**

In `src/lib/server/api-server/subscription/post.ts`, add an import for `db` at the top of the file:

```typescript
import db from "$lib/server/db/db.js";
```

Then replace `handleGetPreferences`:

```typescript
async function handleGetPreferences(token: string, config: SubscriptionsConfig): Promise<Response> {
  const result = await VerifySubscriberToken(token);
  if (!result.success || !result.user || !result.method) {
    return error(401, { message: result.error || "Invalid token" });
  }

  const allSubs = await db.getUserSubscriptionsV2({
    subscriber_user_id: result.user.id,
    subscriber_method_id: result.method.id,
  });

  const incidentSub = allSubs.find((s) => s.event_type === "incidents" && s.status === "ACTIVE");
  const maintenanceSub = allSubs.find((s) => s.event_type === "maintenances" && s.status === "ACTIVE");

  const [incidentMonitors, maintenanceMonitors] = await Promise.all([
    incidentSub ? db.getSubscriptionMonitorScopes(incidentSub.id) : Promise.resolve([]),
    maintenanceSub ? db.getSubscriptionMonitorScopes(maintenanceSub.id) : Promise.resolve([]),
  ]);

  return json({
    success: true,
    email: result.user?.email,
    subscriptions: result.subscriptions,
    availableSubscriptions: {
      incidents: config.methods?.emails?.incidents === true,
      maintenances: config.methods?.emails?.maintenances === true,
    },
    incident_monitors: incidentMonitors,
    maintenance_monitors: maintenanceMonitors,
  });
}
```

- [ ] **Step 5: Verify type check passes**

```bash
cd /Users/pklassen/git/kener && npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(kener\)/dashboard-apis/subscription/monitors/+server.ts \
        src/lib/server/api-server/subscription/post.ts \
        src/lib/server/controllers/userSubscriptionsController.ts
git commit -m "feat: add monitors endpoint and extend subscription preferences API with scope arrays"
```

---

### Task 4: Public UI — SubscribeMenu scope picker

**Files:**
- Modify: `src/lib/components/SubscribeMenu.svelte`

- [ ] **Step 1: Add scope state variables**

In `src/lib/components/SubscribeMenu.svelte`, after the existing `availableSubscriptions` state variable, add:

```typescript
  // Scope state
  let availableMonitors = $state<{ tag: string; name: string }[]>([]);
  let incidentScope = $state<"all" | "specific">("all");
  let incidentMonitorSelections = $state<Record<string, boolean>>({});
  let maintenanceScope = $state<"all" | "specific">("all");
  let maintenanceMonitorSelections = $state<Record<string, boolean>>({});
  let scopeError = $state("");
```

- [ ] **Step 2: Add `fetchAvailableMonitors` function**

After `handleClose`, add:

```typescript
  async function fetchAvailableMonitors() {
    try {
      const res = await fetch(clientResolver(resolve, "/dashboard-apis/subscription/monitors"));
      if (res.ok) {
        const data = await res.json();
        availableMonitors = data.monitors || [];
      }
    } catch (_err) {
      // scope picker simply won't show monitor list
    }
  }
```

- [ ] **Step 3: Update `checkExistingToken` to load scopes and fetch monitors**

Replace `checkExistingToken` with a version that initializes scope state from the API response:

```typescript
  async function checkExistingToken() {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      currentView = "login";
      return;
    }

    currentView = "loading";
    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPreferences", token })
      });

      if (!response.ok) {
        localStorage.removeItem(STORAGE_KEY);
        currentView = "login";
        return;
      }

      const data = await response.json();
      subscriberEmail = data.email || "";
      incidentsEnabled = data.subscriptions?.incidents || false;
      maintenancesEnabled = data.subscriptions?.maintenances || false;
      availableSubscriptions = data.availableSubscriptions || { incidents: false, maintenances: false };

      // Initialize scope state
      const incMons: string[] = data.incident_monitors || [];
      const mntMons: string[] = data.maintenance_monitors || [];
      incidentScope = incMons.length > 0 ? "specific" : "all";
      maintenanceScope = mntMons.length > 0 ? "specific" : "all";

      // Fetch monitors list then initialize checkbox state
      await fetchAvailableMonitors();
      const initSelections = (tags: string[]) =>
        Object.fromEntries(availableMonitors.map((m) => [m.tag, tags.includes(m.tag)]));
      incidentMonitorSelections = initSelections(incMons);
      maintenanceMonitorSelections = initSelections(mntMons);

      currentView = "preferences";
    } catch (_err) {
      localStorage.removeItem(STORAGE_KEY);
      currentView = "login";
    }
  }
```

- [ ] **Step 4: Add `saveMonitorScope` function**

Add this function after `handlePreferenceChange`:

```typescript
  async function saveMonitorScope(type: "incidents" | "maintenances") {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) { currentView = "login"; return; }

    scopeError = "";
    const scope = type === "incidents" ? incidentScope : maintenanceScope;
    const selections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
    const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";

    let monitors: string[] = [];
    if (scope === "specific") {
      monitors = Object.entries(selections).filter(([, v]) => v).map(([k]) => k);
      if (monitors.length === 0) {
        scopeError = $t("Select at least one monitor");
        return;
      }
    }

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePreferences", token, [monitorKey]: monitors })
      });
      if (!response.ok) {
        scopeError = $t("Failed to save scope");
      }
    } catch (_err) {
      scopeError = $t("Network error. Please try again.");
    }
  }
```

- [ ] **Step 5: Update `handlePreferenceChange` to include current scope when toggling a switch**

Replace `handlePreferenceChange`:

```typescript
  async function handlePreferenceChange(type: "incidents" | "maintenances", value: boolean) {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) { currentView = "login"; return; }

    const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";
    const scope = type === "incidents" ? incidentScope : maintenanceScope;
    const selections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
    const monitors = scope === "specific"
      ? Object.entries(selections).filter(([, v]) => v).map(([k]) => k)
      : [];

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePreferences", token, [type]: value, [monitorKey]: monitors })
      });

      if (!response.ok) {
        errorMessage = $t("Failed to update preference");
        if (type === "incidents") incidentsEnabled = !value;
        else maintenancesEnabled = !value;
        return;
      }

      if (type === "incidents") incidentsEnabled = value;
      else maintenancesEnabled = value;

      trackEvent("subscribe_pref_toggled", { source: "subscribe_menu", type, value });
    } catch (_err) {
      errorMessage = $t("Network error. Please try again.");
      if (type === "incidents") incidentsEnabled = !value;
      else maintenancesEnabled = !value;
    }
  }
```

- [ ] **Step 6: Add scope picker UI below each event-type switch in the preferences view**

In `SubscribeMenu.svelte`, in the `{:else if currentView === "preferences"}` block, after the incidents switch section (after the `{/if}` that closes `{#if availableSubscriptions.incidents}`), add this scope picker snippet for incidents. Then add an equivalent for maintenances. Replace the entire preferences section's `<div class="flex flex-col gap-4">` content:

```svelte
          <div class="flex flex-col gap-4">
            {#if availableSubscriptions.incidents}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <AlertTriangle class="h-5 w-5 text-orange-500" />
                    <div>
                      <Label class="font-medium">{$t("Incident Updates")}</Label>
                      <p class="text-muted-foreground text-xs">{$t("Get notified about incidents updates")}</p>
                    </div>
                  </div>
                  <Switch
                    checked={incidentsEnabled}
                    onCheckedChange={(value) => handlePreferenceChange("incidents", value)}
                  />
                </div>
                {#if incidentsEnabled && availableMonitors.length > 0}
                  <div class="bg-muted/50 ml-8 space-y-2 rounded-md p-3">
                    <p class="text-muted-foreground text-xs font-medium">{$t("Notify me about:")}</p>
                    <div class="flex flex-col gap-1">
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="incident-scope"
                          value="all"
                          bind:group={incidentScope}
                          onchange={() => saveMonitorScope("incidents")}
                        />
                        {$t("All monitors")}
                      </label>
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="incident-scope"
                          value="specific"
                          bind:group={incidentScope}
                          onchange={() => saveMonitorScope("incidents")}
                        />
                        {$t("Specific monitors")}
                      </label>
                    </div>
                    {#if incidentScope === "specific"}
                      <div class="ml-4 flex flex-col gap-1 pt-1">
                        {#each availableMonitors as monitor (monitor.tag)}
                          <label class="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              bind:checked={incidentMonitorSelections[monitor.tag]}
                              onchange={() => saveMonitorScope("incidents")}
                            />
                            {monitor.name}
                          </label>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}

            {#if availableSubscriptions.maintenances}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Wrench class="h-5 w-5 text-blue-500" />
                    <div>
                      <Label class="font-medium">{$t("Maintenance Updates")}</Label>
                      <p class="text-muted-foreground text-xs">{$t("Get notified about scheduled maintenance")}</p>
                    </div>
                  </div>
                  <Switch
                    checked={maintenancesEnabled}
                    onCheckedChange={(value) => handlePreferenceChange("maintenances", value)}
                  />
                </div>
                {#if maintenancesEnabled && availableMonitors.length > 0}
                  <div class="bg-muted/50 ml-8 space-y-2 rounded-md p-3">
                    <p class="text-muted-foreground text-xs font-medium">{$t("Notify me about:")}</p>
                    <div class="flex flex-col gap-1">
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="maintenance-scope"
                          value="all"
                          bind:group={maintenanceScope}
                          onchange={() => saveMonitorScope("maintenances")}
                        />
                        {$t("All monitors")}
                      </label>
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="maintenance-scope"
                          value="specific"
                          bind:group={maintenanceScope}
                          onchange={() => saveMonitorScope("maintenances")}
                        />
                        {$t("Specific monitors")}
                      </label>
                    </div>
                    {#if maintenanceScope === "specific"}
                      <div class="ml-4 flex flex-col gap-1 pt-1">
                        {#each availableMonitors as monitor (monitor.tag)}
                          <label class="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              bind:checked={maintenanceMonitorSelections[monitor.tag]}
                              onchange={() => saveMonitorScope("maintenances")}
                            />
                            {monitor.name}
                          </label>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}

            {#if scopeError}
              <p class="text-destructive text-sm">{scopeError}</p>
            {/if}
          </div>
```

- [ ] **Step 7: Verify type check passes**

```bash
cd /Users/pklassen/git/kener && npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/SubscribeMenu.svelte
git commit -m "feat: add per-event-type monitor scope picker to SubscribeMenu"
```

---

### Task 5: Admin API — `adminUpdateSubscriptionScope` + extended subscriber record

**Files:**
- Modify: `src/lib/server/controllers/userSubscriptionsController.ts`
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Extend `AdminSubscriberRecord` and `GetAdminSubscribersPaginated`**

In `src/lib/server/controllers/userSubscriptionsController.ts`, replace the `AdminSubscriberRecord` interface:

```typescript
export interface AdminSubscriberRecord {
  user_id: number;
  method_id: number;
  email: string;
  incidents_enabled: boolean;
  maintenances_enabled: boolean;
  incidents_subscription_id: number | null;
  maintenances_subscription_id: number | null;
  incident_monitors: string[];
  maintenance_monitors: string[];
  created_at: Date;
}
```

In `GetAdminSubscribersPaginated`, after building `incidentsSub` and `maintenancesSub`, add scope lookups and include them in the push:

Replace the `subscribers.push(...)` call with:

```typescript
    const [incMonitors, mntMonitors] = await Promise.all([
      incidentsSub ? db.getSubscriptionMonitorScopes(incidentsSub.id) : Promise.resolve([]),
      maintenancesSub ? db.getSubscriptionMonitorScopes(maintenancesSub.id) : Promise.resolve([]),
    ]);

    subscribers.push({
      user_id: item.id,
      method_id: item.method_id,
      email: item.email,
      incidents_enabled: incidentsSub?.status === "ACTIVE",
      maintenances_enabled: maintenancesSub?.status === "ACTIVE",
      incidents_subscription_id: incidentsSub?.id || null,
      maintenances_subscription_id: maintenancesSub?.id || null,
      incident_monitors: incMonitors,
      maintenance_monitors: mntMonitors,
      created_at: item.created_at,
    });
```

- [ ] **Step 2: Add `AdminUpdateSubscriptionScope` function**

After `AdminAddSubscriber` in `userSubscriptionsController.ts`, add:

```typescript
export async function AdminUpdateSubscriptionScope(
  methodId: number,
  eventType: SubscriptionEventType,
  monitorTags: string[],
): Promise<{ success: boolean; error?: string }> {
  const subs = await db.getUserSubscriptionsV2({
    subscriber_method_id: methodId,
    event_type: eventType,
  });
  if (subs.length === 0) {
    return { success: false, error: "Subscription not found" };
  }
  await db.upsertSubscriptionMonitorScopes(subs[0].id, monitorTags);
  return { success: true };
}
```

- [ ] **Step 3: Add the `adminUpdateSubscriptionScope` action to `manage/api/+server.ts`**

In `src/routes/(manage)/manage/api/+server.ts`, add `AdminUpdateSubscriptionScope` to the existing import block from `userSubscriptionsController.js`. It currently imports `AdminAddSubscriber` — add after it:

```typescript
  AdminUpdateSubscriptionScope,
```

Then in the action handler, add this block after the `adminAddSubscriber` block:

```typescript
    } else if (action == "adminUpdateSubscriptionScope") {
      const { methodId, eventType, monitorTags } = data;
      if (!methodId || !eventType) {
        throw new Error("Method ID and event type are required");
      }
      resp = await AdminUpdateSubscriptionScope(methodId, eventType, monitorTags ?? []);
      if (!resp.success) {
        throw new Error(resp.error);
      }
```

- [ ] **Step 4: Verify type check passes**

```bash
cd /Users/pklassen/git/kener && npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/controllers/userSubscriptionsController.ts \
        src/routes/\(manage\)/manage/api/+server.ts
git commit -m "feat: add adminUpdateSubscriptionScope action and extend admin subscriber record with scope arrays"
```

---

### Task 6: Admin UI — scope badge and edit dialog

**Files:**
- Modify: `src/routes/(manage)/manage/app/subscriptions/+page.svelte`

- [ ] **Step 1: Extend the `Subscriber` interface and add scope dialog state**

In `src/routes/(manage)/manage/app/subscriptions/+page.svelte`, replace the `Subscriber` interface:

```typescript
  interface Subscriber {
    user_id: number;
    method_id: number;
    email: string;
    incidents_enabled: boolean;
    maintenances_enabled: boolean;
    incidents_subscription_id: number | null;
    maintenances_subscription_id: number | null;
    incident_monitors: string[];
    maintenance_monitors: string[];
    created_at: string;
  }
```

Add these state variables after `updatingToggle`:

```typescript
  // Scope dialog state
  interface MonitorOption { tag: string; name: string; }
  let showScopeDialog = $state(false);
  let scopeDialogSubscriber = $state<Subscriber | null>(null);
  let allMonitors = $state<MonitorOption[]>([]);
  let editingScope = $state<"incidents" | "maintenances" | null>(null);
  let editScopeSelections = $state<Record<string, boolean>>({});
  let savingScope = $state(false);
```

- [ ] **Step 2: Add `fetchAllMonitors` and `openScopeDialog` helper functions**

After `confirmDelete`, add:

```typescript
  async function fetchAllMonitors() {
    if (allMonitors.length > 0) return;
    try {
      const res = await fetch(clientResolver(resolve, "/dashboard-apis/subscription/monitors"));
      if (res.ok) {
        const data = await res.json();
        allMonitors = data.monitors || [];
      }
    } catch (_e) {}
  }

  async function openScopeDialog(subscriber: Subscriber) {
    scopeDialogSubscriber = subscriber;
    editingScope = null;
    showScopeDialog = true;
    await fetchAllMonitors();
  }

  function startEditScope(type: "incidents" | "maintenances") {
    if (!scopeDialogSubscriber) return;
    editingScope = type;
    const currentTags = type === "incidents"
      ? scopeDialogSubscriber.incident_monitors
      : scopeDialogSubscriber.maintenance_monitors;
    editScopeSelections = Object.fromEntries(
      allMonitors.map((m) => [m.tag, currentTags.includes(m.tag)])
    );
  }

  async function saveScope() {
    if (!scopeDialogSubscriber || !editingScope) return;
    savingScope = true;
    const monitorTags = editScopeSelections
      ? Object.entries(editScopeSelections).filter(([, v]) => v).map(([k]) => k)
      : [];
    try {
      const res = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adminUpdateSubscriptionScope",
          data: { methodId: scopeDialogSubscriber.method_id, eventType: editingScope, monitorTags }
        })
      });
      const result = await res.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        // Update local state
        if (editingScope === "incidents") {
          scopeDialogSubscriber.incident_monitors = monitorTags;
        } else {
          scopeDialogSubscriber.maintenance_monitors = monitorTags;
        }
        // Reflect in subscribers array
        const idx = subscribers.findIndex(s => s.method_id === scopeDialogSubscriber!.method_id);
        if (idx !== -1) subscribers[idx] = { ...scopeDialogSubscriber };
        editingScope = null;
        toast.success("Scope updated");
      }
    } catch (_e) {
      toast.error("Failed to save scope");
    } finally {
      savingScope = false;
    }
  }
```

- [ ] **Step 3: Add imports for icons needed in the new UI**

At the top of the script, add these icon imports after the existing ones:

```typescript
  import Filter from "@lucide/svelte/icons/filter";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Loader from "@lucide/svelte/icons/loader";
```

- [ ] **Step 4: Add the "Scope" column header to the table**

In the `<Table.Header>` section, add a new `<Table.Head>` after the Maintenances column:

```svelte
              <Table.Head>Scope</Table.Head>
```

Also update all `colspan={5}` values to `colspan={6}` (there are 2: the loading row and the empty row).

- [ ] **Step 5: Add the scope badge cell to each subscriber row**

In `{#each subscribers as subscriber (subscriber.method_id)}`, add a new `<Table.Cell>` after the Maintenances cell and before the Subscribed At cell:

```svelte
                  <Table.Cell>
                    {@const isScoped =
                      subscriber.incident_monitors.length > 0 ||
                      subscriber.maintenance_monitors.length > 0}
                    <button
                      onclick={() => openScopeDialog(subscriber)}
                      class={[
                        "rounded px-2 py-0.5 text-xs font-medium",
                        isScoped
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                      ].join(" ")}
                    >
                      <Filter class="mr-1 inline h-3 w-3" />
                      {isScoped ? "Scoped" : "All"}
                    </button>
                  </Table.Cell>
```

- [ ] **Step 6: Add the scope edit dialog**

After the existing delete dialog, add the scope dialog:

```svelte
<!-- Scope Dialog -->
<Dialog.Root bind:open={showScopeDialog}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Monitor Scope</Dialog.Title>
      <Dialog.Description>
        Configure which monitors trigger notifications for {scopeDialogSubscriber?.email}
      </Dialog.Description>
    </Dialog.Header>

    {#if scopeDialogSubscriber}
      <div class="space-y-4 py-2">
        <!-- Incidents scope -->
        {#if scopeDialogSubscriber.incidents_enabled}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle class="h-4 w-4 text-orange-500" />
                Incidents
              </div>
              {#if editingScope !== "incidents"}
                <Button size="sm" variant="outline" onclick={() => startEditScope("incidents")}>
                  <Pencil class="mr-1 h-3 w-3" />
                  Edit
                </Button>
              {/if}
            </div>
            {#if editingScope === "incidents"}
              <div class="space-y-1 pl-2">
                {#each allMonitors as monitor (monitor.tag)}
                  <label class="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" bind:checked={editScopeSelections[monitor.tag]} />
                    {monitor.name}
                  </label>
                {/each}
                <p class="text-muted-foreground text-xs">Leave all unchecked for all monitors</p>
              </div>
            {:else}
              <p class="text-muted-foreground pl-2 text-sm">
                {scopeDialogSubscriber.incident_monitors.length === 0
                  ? "All monitors"
                  : scopeDialogSubscriber.incident_monitors.join(", ")}
              </p>
            {/if}
          </div>
        {/if}

        <!-- Maintenances scope -->
        {#if scopeDialogSubscriber.maintenances_enabled}
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-sm font-medium">
                <Wrench class="h-4 w-4 text-blue-500" />
                Maintenances
              </div>
              {#if editingScope !== "maintenances"}
                <Button size="sm" variant="outline" onclick={() => startEditScope("maintenances")}>
                  <Pencil class="mr-1 h-3 w-3" />
                  Edit
                </Button>
              {/if}
            </div>
            {#if editingScope === "maintenances"}
              <div class="space-y-1 pl-2">
                {#each allMonitors as monitor (monitor.tag)}
                  <label class="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" bind:checked={editScopeSelections[monitor.tag]} />
                    {monitor.name}
                  </label>
                {/each}
                <p class="text-muted-foreground text-xs">Leave all unchecked for all monitors</p>
              </div>
            {:else}
              <p class="text-muted-foreground pl-2 text-sm">
                {scopeDialogSubscriber.maintenance_monitors.length === 0
                  ? "All monitors"
                  : scopeDialogSubscriber.maintenance_monitors.join(", ")}
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      {#if editingScope}
        <Button variant="outline" onclick={() => { editingScope = null; }} disabled={savingScope}>
          Cancel
        </Button>
        <Button onclick={saveScope} disabled={savingScope}>
          {#if savingScope}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
          {/if}
          Save
        </Button>
      {:else}
        <Button onclick={() => { showScopeDialog = false; }}>Close</Button>
      {/if}
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 7: Verify type check passes**

```bash
cd /Users/pklassen/git/kener && npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(manage\)/manage/app/subscriptions/+page.svelte
git commit -m "feat: add scope badge and edit dialog to admin subscriptions table"
```
