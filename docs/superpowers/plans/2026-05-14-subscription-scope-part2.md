# Subscription Scope Enhancement — Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend subscription scope to support page-level references (dynamic, auto-includes new monitors added to that page) and filter the scope picker to only show pages/monitors the subscriber has view permission for.

**Architecture:** Add a `scope_type` column to the existing `subscription_monitor_scopes` table; rows with `scope_type='page'` store page slugs instead of monitor tags. The notification query expands page scopes at send time via a join on `pages_monitors`. Two new controller functions and one new API action support the admin and self-service UIs.

**Tech Stack:** Knex.js migrations (SQLite/PG/MySQL), TypeScript, SvelteKit 5 Svelte runes, Tailwind CSS v4, shadcn-svelte.

**Spec:** `docs/superpowers/specs/2026-05-14-subscription-scope-part2-design.md`

---

## File Map

| File | Change |
|---|---|
| `migrations/20260514120000_add_scope_type_to_subscription_scopes.ts` | **Create** — add `scope_type`, update unique constraint |
| `src/lib/server/db/repositories/subscriptionSystem.ts` | **Modify** — rename+extend `upsert/get` scope functions, update notification query |
| `src/lib/server/db/dbimpl.ts` | **Modify** — rename bound method declarations |
| `src/lib/server/controllers/userSubscriptionsController.ts` | **Modify** — new `GetAccessibleScopesForSubscriber`, update `AdminUpdateSubscriptionScope`, `GetAdminSubscribersPaginated`, `UpdateSubscriberPreferences` |
| `src/lib/allPerms.ts` | **Modify** — add `getSubscriberAccessibleScopes` to permission map |
| `src/routes/(manage)/manage/api/+server.ts` | **Modify** — update `adminUpdateSubscriptionScope` handler, add `getSubscriberAccessibleScopes` handler |
| `src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts` | **Modify** — extend response to include pages |
| `src/lib/server/api-server/subscription/post.ts` | **Modify** — handle page scopes in get/update preferences |
| `src/routes/(manage)/manage/app/subscriptions/+page.svelte` | **Modify** — grouped scope dialog with page-level selection |
| `src/lib/components/SubscribeMenu.svelte` | **Modify** — grouped page/monitor picker |

---

## Task 1: DB Migration — add `scope_type` to `subscription_monitor_scopes`

**Files:**
- Create: `migrations/20260514120000_add_scope_type_to_subscription_scopes.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// migrations/20260514120000_add_scope_type_to_subscription_scopes.ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
    // Drop old unique on (subscription_id, monitor_tag) — will be replaced
    table.dropUnique(["subscription_id", "monitor_tag"]);
    // Add scope_type; default 'monitor' covers all existing rows
    table.string("scope_type", 20).notNullable().defaultTo("monitor");
    // New unique: same scope_identifier (monitor tag or page slug) + scope_type per subscription
    table.unique(["subscription_id", "scope_type", "monitor_tag"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
    table.dropUnique(["subscription_id", "scope_type", "monitor_tag"]);
    table.dropColumn("scope_type");
    table.unique(["subscription_id", "monitor_tag"]);
  });
}
```

- [ ] **Step 2: Run the migration**

```bash
npm run migrate
```

Expected: migration runs without error. If it errors on `dropUnique`, the constraint name may differ by DB engine — in that case replace `table.dropUnique(...)` with a raw call:

```typescript
// SQLite fallback — raw table recreation via renaming:
await knex.schema.alterTable("subscription_monitor_scopes", (table) => {
  table.dropUnique(["subscription_id", "monitor_tag"]);
  table.string("scope_type", 20).notNullable().defaultTo("monitor");
  table.unique(["subscription_id", "scope_type", "monitor_tag"]);
});
```

- [ ] **Step 3: Verify schema**

```bash
# SQLite:
node -e "
const Database = require('better-sqlite3');
const db = new Database('./kener.db');
console.log(db.prepare(\"PRAGMA table_info(subscription_monitor_scopes)\").all());
"
```

Expected: columns `id`, `subscription_id`, `monitor_tag`, `scope_type`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260514120000_add_scope_type_to_subscription_scopes.ts
git commit -m "feat: add scope_type column to subscription_monitor_scopes"
```

---

## Task 2: Repository — rename and extend scope functions

**Files:**
- Modify: `src/lib/server/db/repositories/subscriptionSystem.ts:509-522, 288-321`
- Modify: `src/lib/server/db/dbimpl.ts:377-378`

- [ ] **Step 1: Replace `upsertSubscriptionMonitorScopes` (line 509)**

Replace the existing function at lines 509-516:

```typescript
async upsertSubscriptionScopes(
  subscriptionId: number,
  monitorTags: string[],
  pageSlugs: string[],
): Promise<void> {
  await this.knex("subscription_monitor_scopes")
    .where("subscription_id", subscriptionId)
    .del();
  const rows: { subscription_id: number; monitor_tag: string; scope_type: string }[] = [];
  for (const tag of monitorTags) {
    rows.push({ subscription_id: subscriptionId, monitor_tag: tag, scope_type: "monitor" });
  }
  for (const slug of pageSlugs) {
    rows.push({ subscription_id: subscriptionId, monitor_tag: slug, scope_type: "page" });
  }
  if (rows.length > 0) {
    await this.knex("subscription_monitor_scopes").insert(rows);
  }
}
```

- [ ] **Step 2: Replace `getSubscriptionMonitorScopes` (line 518)**

Replace the existing function at lines 518-522:

```typescript
async getSubscriptionScopes(subscriptionId: number): Promise<{ monitors: string[]; pages: string[] }> {
  const rows = await this.knex("subscription_monitor_scopes")
    .where("subscription_id", subscriptionId)
    .select("monitor_tag", "scope_type");
  return {
    monitors: rows.filter((r) => r.scope_type === "monitor").map((r) => r.monitor_tag),
    pages: rows.filter((r) => r.scope_type === "page").map((r) => r.monitor_tag),
  };
}
```

- [ ] **Step 3: Update `getSubscribersForEvent` to handle page scopes (lines 306-321)**

Replace the `if (monitorTags.length > 0)` block at lines 306-321. The page-scope branch joins through the `pages` table (which has `page_path`) to reach `pages_monitors` (which links `page_id` to `monitor_tag`):

```typescript
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
          .where("scope_type", "monitor")
          .whereIn("monitor_tag", monitorTags),
      )
      .orWhereExists(
        this.knex("subscription_monitor_scopes as sms")
          .select(1)
          .whereRaw("sms.subscription_id = us.id")
          .where("sms.scope_type", "page")
          .join("pages as p", "p.page_path", "sms.monitor_tag")
          .join("pages_monitors as pm", "pm.page_id", "p.id")
          .whereIn("pm.monitor_tag", monitorTags),
      );
  });
}
```

- [ ] **Step 4: Update `dbimpl.ts` declarations (lines 377-378)**

In `src/lib/server/db/dbimpl.ts`, replace:

```typescript
upsertSubscriptionMonitorScopes!: SubscriptionSystemRepository["upsertSubscriptionMonitorScopes"];
getSubscriptionMonitorScopes!: SubscriptionSystemRepository["getSubscriptionMonitorScopes"];
```

with:

```typescript
upsertSubscriptionScopes!: SubscriptionSystemRepository["upsertSubscriptionScopes"];
getSubscriptionScopes!: SubscriptionSystemRepository["getSubscriptionScopes"];
```

- [ ] **Step 5: Update dbimpl binding in `bindSubscriptionSystemMethods`**

Search for the two binding lines that reference the old names. They look like:
```typescript
this.upsertSubscriptionMonitorScopes = this.subscriptionSystem.upsertSubscriptionMonitorScopes.bind(this.subscriptionSystem);
this.getSubscriptionMonitorScopes = this.subscriptionSystem.getSubscriptionMonitorScopes.bind(this.subscriptionSystem);
```

Replace with:
```typescript
this.upsertSubscriptionScopes = this.subscriptionSystem.upsertSubscriptionScopes.bind(this.subscriptionSystem);
this.getSubscriptionScopes = this.subscriptionSystem.getSubscriptionScopes.bind(this.subscriptionSystem);
```

- [ ] **Step 6: Type-check**

```bash
npm run check
```

Expected: errors only for the call sites in the controller and post.ts (which use the old names) — those are fixed in Tasks 3 and 5. If there are other errors, fix them now.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db/repositories/subscriptionSystem.ts src/lib/server/db/dbimpl.ts
git commit -m "feat: extend subscription scope repository to support page-level scopes"
```

---

## Task 3: Controller — GetAccessibleScopesForSubscriber, AdminUpdateSubscriptionScope, GetAdminSubscribersPaginated

**Files:**
- Modify: `src/lib/server/controllers/userSubscriptionsController.ts:122-133, 138-191, 369-386`

- [ ] **Step 1: Add `incident_pages`/`maintenance_pages` to `AdminSubscriberRecord` (line 122)**

Replace the interface at lines 122-133:

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
  incident_pages: string[];
  maintenance_pages: string[];
  created_at: Date;
}
```

- [ ] **Step 2: Update `GetAdminSubscribersPaginated` to call `getSubscriptionScopes` (lines 165-181)**

Replace the scope-fetching block (lines 165-181) inside the `for` loop:

```typescript
const [incScopes, mntScopes] = await Promise.all([
  incidentsSub ? db.getSubscriptionScopes(incidentsSub.id) : Promise.resolve({ monitors: [], pages: [] }),
  maintenancesSub ? db.getSubscriptionScopes(maintenancesSub.id) : Promise.resolve({ monitors: [], pages: [] }),
]);

subscribers.push({
  user_id: item.id,
  method_id: item.method_id,
  email: item.email,
  incidents_enabled: incidentsSub?.status === "ACTIVE",
  maintenances_enabled: maintenancesSub?.status === "ACTIVE",
  incidents_subscription_id: incidentsSub?.id || null,
  maintenances_subscription_id: maintenancesSub?.id || null,
  incident_monitors: incScopes.monitors,
  maintenance_monitors: mntScopes.monitors,
  incident_pages: incScopes.pages,
  maintenance_pages: mntScopes.pages,
  created_at: item.created_at,
});
```

- [ ] **Step 3: Update `AdminUpdateSubscriptionScope` to accept `pageSlugs` (lines 369-386)**

Replace the entire function:

```typescript
export async function AdminUpdateSubscriptionScope(
  methodId: number,
  eventType: SubscriptionEventType,
  monitorTags: string[],
  pageSlugs: string[],
): Promise<{ success: boolean; error?: string }> {
  const subs = await db.getUserSubscriptionsV2({
    subscriber_method_id: methodId,
    event_type: eventType,
  });
  if (subs.length === 0) {
    return { success: false, error: "Subscription not found" };
  }
  if (subs.length > 1) {
    console.warn(`AdminUpdateSubscriptionScope: found ${subs.length} subscriptions for method ${methodId} / ${eventType}, using first`);
  }
  await db.upsertSubscriptionScopes(subs[0].id, monitorTags, pageSlugs);
  return { success: true };
}
```

- [ ] **Step 4: Add imports for `GetAccessibleScopesForSubscriber`**

At the top of the controller file, the existing imports include `GetMonitorsParsed`. Verify it is already imported (it is used in `UpdateSubscriberPreferences`). Also ensure `GetAllPages` is importable:

Add this import near the top (alongside other controller imports):

```typescript
import { GetMonitorsParsed } from "$lib/server/controllers/monitorsController.js";
import { GetAllPages } from "$lib/server/controllers/pagesController.js";
```

If `GetMonitorsParsed` is already imported, only add `GetAllPages`.

- [ ] **Step 5: Add `GetAccessibleScopesForSubscriber` function**

Insert this new function after `AdminUpdateSubscriptionScope` (after line 386):

```typescript
/**
 * Returns pages and monitors accessible to a specific subscriber.
 * Used to populate the admin scope picker with permission-filtered content.
 * For linked subscribers: public + role-accessible content.
 * For anonymous (no linked_user_id): public content only.
 */
export async function GetAccessibleScopesForSubscriber(methodId: number): Promise<{
  pages: Array<{ slug: string; name: string }>;
  monitors: Array<{ tag: string; name: string; page_slug: string }>;
}> {
  // Resolve the subscriber's linked app user (if any)
  const method = await db.getSubscriberMethodById(methodId);
  if (!method) return { pages: [], monitors: [] };
  const subscriberUser = await db.getSubscriberUserById(method.subscriber_user_id);
  const linkedUserId = subscriberUser?.linked_user_id ?? null;

  // Build allowed monitors set
  const publicMonitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO", is_public: 1 });
  const allowedMonitors = new Map<string, string>(publicMonitors.map((m) => [m.tag, m.name]));

  if (linkedUserId) {
    const accessible = await db.getAccessibleResources(linkedUserId);
    if (accessible.monitorTags.size > 0) {
      const roleMonitors = await GetMonitorsParsed({
        status: "ACTIVE",
        is_hidden: "NO",
        tags: [...accessible.monitorTags],
      });
      for (const m of roleMonitors) allowedMonitors.set(m.tag, m.name);
    }
  }

  // Build pages list — include only pages that have at least one allowed monitor
  const allPages = await GetAllPages();
  const resultPages: Array<{ slug: string; name: string }> = [];
  const resultMonitors: Array<{ tag: string; name: string; page_slug: string }> = [];

  for (const p of allPages) {
    const pageMonitors = await db.getPageMonitorsExcludeHidden(p.id);
    const accessible = pageMonitors.filter((pm) => allowedMonitors.has(pm.monitor_tag));
    if (accessible.length > 0) {
      resultPages.push({ slug: p.page_path, name: p.page_title });
      for (const pm of accessible) {
        resultMonitors.push({
          tag: pm.monitor_tag,
          name: allowedMonitors.get(pm.monitor_tag)!,
          page_slug: p.page_path,
        });
      }
    }
  }

  return { pages: resultPages, monitors: resultMonitors };
}
```

- [ ] **Step 6: Type-check**

```bash
npm run check
```

Expected: remaining errors only in `post.ts` and `+server.ts` call sites (fixed in Tasks 5 and 6).

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/controllers/userSubscriptionsController.ts
git commit -m "feat: add GetAccessibleScopesForSubscriber, extend AdminUpdateSubscriptionScope with page slugs"
```

---

## Task 4: Controller — UpdateSubscriberPreferences with page scopes

**Files:**
- Modify: `src/lib/server/controllers/userSubscriptionsController.ts:654-764`

- [ ] **Step 1: Extend the preferences parameter type and page filtering (lines 654-687)**

Replace the function signature and allowedTags block:

```typescript
export async function UpdateSubscriberPreferences(
  token: string,
  preferences: {
    incidents?: boolean;
    incident_monitors?: string[];
    incident_pages?: string[];
    maintenances?: boolean;
    maintenance_monitors?: string[];
    maintenance_pages?: string[];
  },
): Promise<{ success: boolean; error?: string }> {
  const verifyResult = await VerifySubscriberToken(token);
  if (!verifyResult.success || !verifyResult.user || !verifyResult.method) {
    return { success: false, error: verifyResult.error || "Invalid token" };
  }

  const { user, method } = verifyResult;

  // Build allowed monitors set
  const publicMonitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO", is_public: 1 });
  const allowedTags = new Set(publicMonitors.map((m) => m.tag));

  // Build allowed pages set (pages that have at least one allowed monitor)
  const allPages = await GetAllPages();
  const allowedPageSlugs = new Set<string>();

  if (verifyResult.linked_user_id) {
    const accessible = await db.getAccessibleResources(verifyResult.linked_user_id);
    if (accessible.monitorTags.size > 0) {
      const roleMonitors = await GetMonitorsParsed({
        status: "ACTIVE",
        is_hidden: "NO",
        tags: [...accessible.monitorTags],
      });
      for (const m of roleMonitors) allowedTags.add(m.tag);
    }
  }

  // All pages that have at least one monitor in allowedTags are allowed page slugs
  for (const p of allPages) {
    const pageMonitors = await db.getPageMonitorsExcludeHidden(p.id);
    if (pageMonitors.some((pm) => allowedTags.has(pm.monitor_tag))) {
      allowedPageSlugs.add(p.page_path);
    }
  }

  const filterTags = (tags: string[]) => tags.filter((t) => allowedTags.has(t));
  const filterPages = (slugs: string[]) => slugs.filter((s) => allowedPageSlugs.has(s));
```

- [ ] **Step 2: Update the incidents scope call (line 721-723)**

Replace:
```typescript
if (preferences.incident_monitors !== undefined && incidentSubId !== null) {
  await db.upsertSubscriptionMonitorScopes(incidentSubId, filterTags(preferences.incident_monitors));
}
```

With:
```typescript
if ((preferences.incident_monitors !== undefined || preferences.incident_pages !== undefined) && incidentSubId !== null) {
  await db.upsertSubscriptionScopes(
    incidentSubId,
    filterTags(preferences.incident_monitors ?? []),
    filterPages(preferences.incident_pages ?? []),
  );
}
```

- [ ] **Step 3: Update the maintenances scope call (lines 758-760)**

Replace:
```typescript
if (preferences.maintenance_monitors !== undefined && maintenanceSubId !== null) {
  await db.upsertSubscriptionMonitorScopes(maintenanceSubId, filterTags(preferences.maintenance_monitors));
}
```

With:
```typescript
if ((preferences.maintenance_monitors !== undefined || preferences.maintenance_pages !== undefined) && maintenanceSubId !== null) {
  await db.upsertSubscriptionScopes(
    maintenanceSubId,
    filterTags(preferences.maintenance_monitors ?? []),
    filterPages(preferences.maintenance_pages ?? []),
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npm run check
```

Expected: controller is clean. Remaining errors in API layer only.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/controllers/userSubscriptionsController.ts
git commit -m "feat: UpdateSubscriberPreferences supports incident_pages/maintenance_pages"
```

---

## Task 5: Public subscription API — extend monitors endpoint and post.ts

**Files:**
- Modify: `src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts`
- Modify: `src/lib/server/api-server/subscription/post.ts:115-191`

- [ ] **Step 1: Extend the monitors GET endpoint to return pages**

Replace the entire content of `src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts`:

```typescript
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetMonitorsParsed } from "$lib/server/controllers/monitorsController.js";
import { GetAllPages } from "$lib/server/controllers/pagesController.js";
import { GetLoggedInSession } from "$lib/server/controllers/userController.js";
import db from "$lib/server/db/db.js";

export const GET: RequestHandler = async ({ cookies }) => {
  const publicMonitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO", is_public: 1 });
  const allowedMonitors = new Map<string, string>(publicMonitors.map((m) => [m.tag, m.name]));

  const session = await GetLoggedInSession(cookies);
  if (session) {
    const accessible = await db.getAccessibleResources(session.id);
    if (accessible.monitorTags.size > 0) {
      const roleMonitors = await GetMonitorsParsed({
        status: "ACTIVE",
        is_hidden: "NO",
        tags: [...accessible.monitorTags],
      });
      for (const m of roleMonitors) allowedMonitors.set(m.tag, m.name);
    }
  }

  // Build grouped pages (only pages with at least one allowed monitor)
  const allPages = await GetAllPages();
  const pages: Array<{ slug: string; name: string; monitors: Array<{ tag: string; name: string }> }> = [];

  for (const p of allPages) {
    const pageMonitors = await db.getPageMonitorsExcludeHidden(p.id);
    const accessible = pageMonitors
      .filter((pm) => allowedMonitors.has(pm.monitor_tag))
      .map((pm) => ({ tag: pm.monitor_tag, name: allowedMonitors.get(pm.monitor_tag)! }));
    if (accessible.length > 0) {
      pages.push({ slug: p.page_path, name: p.page_title, monitors: accessible });
    }
  }

  // Keep flat monitors list for backwards compat
  return json({
    monitors: [...allowedMonitors.entries()].map(([tag, name]) => ({ tag, name })),
    pages,
  });
};
```

- [ ] **Step 2: Update `handleGetPreferences` in post.ts (lines 115-145)**

Replace the scope-fetching block (lines 129-144):

```typescript
const [incidentScopes, maintenanceScopes] = await Promise.all([
  incidentSub ? db.getSubscriptionScopes(incidentSub.id) : Promise.resolve({ monitors: [], pages: [] }),
  maintenanceSub ? db.getSubscriptionScopes(maintenanceSub.id) : Promise.resolve({ monitors: [], pages: [] }),
]);

return json({
  success: true,
  email: result.user?.email,
  subscriptions: result.subscriptions,
  availableSubscriptions: {
    incidents: config.methods?.emails?.incidents === true,
    maintenances: config.methods?.emails?.maintenances === true,
  },
  incident_monitors: incidentScopes.monitors,
  incident_pages: incidentScopes.pages,
  maintenance_monitors: maintenanceScopes.monitors,
  maintenance_pages: maintenanceScopes.pages,
});
```

- [ ] **Step 3: Update `handleUpdatePreferences` signature and body (lines 147-191)**

Replace the entire function:

```typescript
async function handleUpdatePreferences(
  token: string,
  incidents: boolean | undefined,
  incidentMonitors: string[] | undefined,
  incidentPages: string[] | undefined,
  maintenances: boolean | undefined,
  maintenanceMonitors: string[] | undefined,
  maintenancePages: string[] | undefined,
  config: SubscriptionsConfig,
): Promise<Response> {
  const preferences: {
    incidents?: boolean;
    incident_monitors?: string[];
    incident_pages?: string[];
    maintenances?: boolean;
    maintenance_monitors?: string[];
    maintenance_pages?: string[];
  } = {};

  if (config.methods?.emails?.incidents) {
    if (incidents !== undefined) preferences.incidents = incidents;
    if (incidentMonitors !== undefined) {
      if (!Array.isArray(incidentMonitors)) return error(400, { message: "incident_monitors must be an array" });
      preferences.incident_monitors = incidentMonitors.slice(0, 500).map(String);
    }
    if (incidentPages !== undefined) {
      if (!Array.isArray(incidentPages)) return error(400, { message: "incident_pages must be an array" });
      preferences.incident_pages = incidentPages.slice(0, 100).map(String);
    }
  }
  if (config.methods?.emails?.maintenances) {
    if (maintenances !== undefined) preferences.maintenances = maintenances;
    if (maintenanceMonitors !== undefined) {
      if (!Array.isArray(maintenanceMonitors)) return error(400, { message: "maintenance_monitors must be an array" });
      preferences.maintenance_monitors = maintenanceMonitors.slice(0, 500).map(String);
    }
    if (maintenancePages !== undefined) {
      if (!Array.isArray(maintenancePages)) return error(400, { message: "maintenance_pages must be an array" });
      preferences.maintenance_pages = maintenancePages.slice(0, 100).map(String);
    }
  }

  const result = await UpdateSubscriberPreferences(token, preferences);
  if (!result.success) return error(400, { message: result.error || "Failed to update preferences" });
  return json({ success: true });
}
```

- [ ] **Step 4: Update the call to `handleUpdatePreferences` in the main router**

Find the call site (around line 74-83) that calls `handleUpdatePreferences`. It currently passes 5 arguments. Add the two new page arrays extracted from `body`:

```typescript
// In the "updatePreferences" action branch, extract the new fields:
const incidentPages = (body as UpdatePreferencesRequest).incident_pages;
const maintenancePages = (body as UpdatePreferencesRequest).maintenance_pages;

return handleUpdatePreferences(
  token,
  (body as UpdatePreferencesRequest).incidents,
  (body as UpdatePreferencesRequest).incident_monitors,
  incidentPages,
  (body as UpdatePreferencesRequest).maintenances,
  (body as UpdatePreferencesRequest).maintenance_monitors,
  maintenancePages,
  config,
);
```

Also update the `UpdatePreferencesRequest` interface (defined near the top of post.ts) to include the new fields:

```typescript
interface UpdatePreferencesRequest {
  action: "updatePreferences";
  token: string;
  incidents?: boolean;
  incident_monitors?: string[];
  incident_pages?: string[];
  maintenances?: boolean;
  maintenance_monitors?: string[];
  maintenance_pages?: string[];
}
```

- [ ] **Step 5: Type-check**

```bash
npm run check
```

Expected: only manage API server errors remain.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(kener)/dashboard-apis/subscription/monitors/+server.ts" \
        src/lib/server/api-server/subscription/post.ts
git commit -m "feat: extend subscription public API with page scope support"
```

---

## Task 6: Manage API — new action + updated adminUpdateSubscriptionScope

**Files:**
- Modify: `src/lib/allPerms.ts:224`
- Modify: `src/routes/(manage)/manage/api/+server.ts:849-864` (adminUpdateSubscriptionScope handler + new action)

- [ ] **Step 1: Add permission entry in `allPerms.ts` (after line 224)**

In `src/lib/allPerms.ts`, after line 224 (`adminUpdateSubscriptionScope: "subscribers.write",`), add:

```typescript
getSubscriberAccessibleScopes: "subscribers.read",
```

- [ ] **Step 2: Add import for `GetAccessibleScopesForSubscriber` in manage API server**

In `src/routes/(manage)/manage/api/+server.ts`, find the import line for subscription controller functions (search for `AdminUpdateSubscriptionScope`). Add `GetAccessibleScopesForSubscriber` to that import:

```typescript
import {
  // ...existing imports...
  AdminUpdateSubscriptionScope,
  GetAccessibleScopesForSubscriber,
  // ...
} from "$lib/server/controllers/userSubscriptionsController.js";
```

- [ ] **Step 3: Update the `adminUpdateSubscriptionScope` handler (lines 849-864)**

Replace the handler block:

```typescript
} else if (action == "adminUpdateSubscriptionScope") {
  const { methodId, eventType, monitorTags, pageSlugs } = data;
  if (!methodId || !eventType) {
    throw new Error("Method ID and event type are required");
  }
  if (!["incidents", "maintenances"].includes(eventType)) {
    throw new Error("eventType must be 'incidents' or 'maintenances'");
  }
  if (monitorTags !== undefined && monitorTags !== null && !Array.isArray(monitorTags)) {
    throw new Error("monitorTags must be an array");
  }
  if (pageSlugs !== undefined && pageSlugs !== null && !Array.isArray(pageSlugs)) {
    throw new Error("pageSlugs must be an array");
  }
  const safeTags: string[] = Array.isArray(monitorTags) ? monitorTags.slice(0, 500) : [];
  const safePages: string[] = Array.isArray(pageSlugs) ? pageSlugs.slice(0, 100) : [];
  resp = await AdminUpdateSubscriptionScope(methodId, eventType, safeTags, safePages);
  if (!resp.success) {
    throw new Error(resp.error);
  }
```

- [ ] **Step 4: Add `getSubscriberAccessibleScopes` action handler** (insert after the updated `adminUpdateSubscriptionScope` block, before `getSubscriptionsConfig`):

```typescript
} else if (action == "getSubscriberAccessibleScopes") {
  const { methodId } = data;
  if (!methodId) {
    throw new Error("methodId is required");
  }
  resp = await GetAccessibleScopesForSubscriber(methodId);
```

- [ ] **Step 5: Type-check**

```bash
npm run check
```

Expected: clean (or only UI-related type errors from the not-yet-updated Svelte components).

- [ ] **Step 6: Commit**

```bash
git add src/lib/allPerms.ts "src/routes/(manage)/manage/api/+server.ts"
git commit -m "feat: add getSubscriberAccessibleScopes API action, extend adminUpdateSubscriptionScope"
```

---

## Task 7: Admin UI — grouped scope dialog in subscriptions page

**Files:**
- Modify: `src/routes/(manage)/manage/app/subscriptions/+page.svelte`

This task updates the scope dialog to show pages as groups with page-level checkboxes, and call `getSubscriberAccessibleScopes` instead of the flat monitors endpoint.

- [ ] **Step 1: Update the `Subscriber` interface and state (lines 47-92)**

Replace the `Subscriber` interface and scope-related state declarations:

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
  incident_pages: string[];
  maintenance_pages: string[];
  created_at: string;
}

// Scope dialog state
interface PageOption { slug: string; name: string; monitors: Array<{ tag: string; name: string }> }
let showScopeDialog = $state(false);
let scopeDialogSubscriber = $state<Subscriber | null>(null);
let allPages = $state<PageOption[]>([]);
let allMonitorsFlat = $state<Array<{ tag: string; name: string; page_slug: string }>>([]);
let fetchingScopes = $state(false);
let fetchScopesError = $state("");
let editingScope = $state<"incidents" | "maintenances" | null>(null);
let editPageSelections = $state<Record<string, boolean>>({});
let editMonitorSelections = $state<Record<string, boolean>>({});
let savingScope = $state(false);
```

- [ ] **Step 2: Replace `fetchAllMonitors` with `fetchScopeOptions` (lines 285-302)**

Replace `fetchAllMonitors`:

```typescript
async function fetchScopeOptions(methodId: number) {
  fetchingScopes = true;
  fetchScopesError = "";
  try {
    const res = await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getSubscriberAccessibleScopes", data: { methodId } })
    });
    if (res.ok) {
      const data = await res.json();
      // data.pages: [{slug, name, monitors: [{tag, name}]}] — but our controller returns
      // pages: [{slug, name}] and monitors: [{tag, name, page_slug}]
      // Build allPages with nested monitors from the flat monitors list
      const monitorsByPage = new Map<string, Array<{ tag: string; name: string }>>();
      for (const m of (data.monitors || [])) {
        if (!monitorsByPage.has(m.page_slug)) monitorsByPage.set(m.page_slug, []);
        monitorsByPage.get(m.page_slug)!.push({ tag: m.tag, name: m.name });
      }
      allPages = (data.pages || []).map((p: { slug: string; name: string }) => ({
        slug: p.slug,
        name: p.name,
        monitors: monitorsByPage.get(p.slug) || [],
      }));
      allMonitorsFlat = data.monitors || [];
    } else {
      fetchScopesError = "Failed to load scope options";
    }
  } catch (_e) {
    fetchScopesError = "Failed to load scope options";
  } finally {
    fetchingScopes = false;
  }
}
```

- [ ] **Step 3: Update `openScopeDialog` (lines 304-310)**

Replace:

```typescript
async function openScopeDialog(subscriber: Subscriber) {
  scopeDialogSubscriber = subscriber;
  editingScope = null;
  editPageSelections = {};
  editMonitorSelections = {};
  showScopeDialog = true;
  await fetchScopeOptions(subscriber.method_id);
}
```

- [ ] **Step 4: Replace `startEditScope` (lines 312-321)**

Replace:

```typescript
function startEditScope(type: "incidents" | "maintenances") {
  if (!scopeDialogSubscriber) return;
  editingScope = type;
  const currentPages = type === "incidents"
    ? scopeDialogSubscriber.incident_pages
    : scopeDialogSubscriber.maintenance_pages;
  const currentTags = type === "incidents"
    ? scopeDialogSubscriber.incident_monitors
    : scopeDialogSubscriber.maintenance_monitors;
  // Initialize page selections
  editPageSelections = Object.fromEntries(allPages.map((p) => [p.slug, currentPages.includes(p.slug)]));
  // Initialize monitor selections (only for monitors not covered by a page)
  editMonitorSelections = Object.fromEntries(
    allMonitorsFlat.map((m) => [m.tag, currentTags.includes(m.tag)])
  );
}
```

- [ ] **Step 5: Replace `saveScope` (lines 323-353)**

Replace:

```typescript
async function saveScope() {
  if (!scopeDialogSubscriber || !editingScope) return;
  savingScope = true;
  const pageSlugs = Object.entries(editPageSelections).filter(([, v]) => v).map(([k]) => k);
  // Monitors that belong to a selected page are excluded from explicit monitor tags
  const coveredByPage = new Set(
    allPages
      .filter((p) => pageSlugs.includes(p.slug))
      .flatMap((p) => p.monitors.map((m) => m.tag))
  );
  const monitorTags = Object.entries(editMonitorSelections)
    .filter(([k, v]) => v && !coveredByPage.has(k))
    .map(([k]) => k);
  try {
    const res = await fetch(clientResolver(resolve, "/manage/api"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "adminUpdateSubscriptionScope",
        data: { methodId: scopeDialogSubscriber.method_id, eventType: editingScope, monitorTags, pageSlugs }
      })
    });
    const result = await res.json();
    if (result.error) {
      toast.error(result.error);
    } else {
      if (editingScope === "incidents") {
        scopeDialogSubscriber.incident_monitors = monitorTags;
        scopeDialogSubscriber.incident_pages = pageSlugs;
      } else {
        scopeDialogSubscriber.maintenance_monitors = monitorTags;
        scopeDialogSubscriber.maintenance_pages = pageSlugs;
      }
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

- [ ] **Step 6: Update the scope dialog template (lines 690-779)**

Replace the entire scope dialog `Dialog.Content` body (lines 690-761) with the grouped UI:

```svelte
{#if fetchingScopes}
  <div class="flex justify-center py-6"><Spinner /></div>
{:else if fetchScopesError}
  <p class="text-destructive text-sm">{fetchScopesError}</p>
{:else if scopeDialogSubscriber}
  {#each (["incidents", "maintenances"] as const) as eventType}
    {@const isEnabled = eventType === "incidents"
      ? scopeDialogSubscriber.incidents_enabled
      : scopeDialogSubscriber.maintenances_enabled}
    {#if isEnabled}
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm font-medium">
            {#if eventType === "incidents"}
              <AlertTriangle class="h-4 w-4 text-orange-500" />
              Incidents
            {:else}
              <Wrench class="h-4 w-4 text-blue-500" />
              Maintenances
            {/if}
          </div>
          {#if editingScope !== eventType}
            <Button size="sm" variant="outline" onclick={() => startEditScope(eventType)}>
              <Pencil class="mr-1 h-3 w-3" />
              Edit
            </Button>
          {/if}
        </div>

        {#if editingScope === eventType}
          <div class="max-h-64 space-y-2 overflow-y-auto pl-2">
            {#each allPages as pageOpt (pageOpt.slug)}
              <div class="space-y-1">
                <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" bind:checked={editPageSelections[pageOpt.slug]} />
                  <span class="text-muted-foreground text-xs uppercase tracking-wide">[Page]</span>
                  {pageOpt.name}
                </label>
                {#if !editPageSelections[pageOpt.slug]}
                  {#each pageOpt.monitors as mon (mon.tag)}
                    <label class="ml-5 flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" bind:checked={editMonitorSelections[mon.tag]} />
                      {mon.name}
                    </label>
                  {/each}
                {:else}
                  {#each pageOpt.monitors as mon (mon.tag)}
                    <label class="text-muted-foreground ml-5 flex items-center gap-2 text-sm">
                      <input type="checkbox" disabled checked />
                      {mon.name} <span class="text-xs">(via page)</span>
                    </label>
                  {/each}
                {/if}
              </div>
            {/each}
            <p class="text-muted-foreground text-xs">Leave all unchecked for all monitors</p>
          </div>
        {:else}
          <p class="text-muted-foreground pl-2 text-sm">
            {#if (eventType === "incidents" ? scopeDialogSubscriber.incident_pages : scopeDialogSubscriber.maintenance_pages).length > 0 || (eventType === "incidents" ? scopeDialogSubscriber.incident_monitors : scopeDialogSubscriber.maintenance_monitors).length > 0}
              {#if (eventType === "incidents" ? scopeDialogSubscriber.incident_pages : scopeDialogSubscriber.maintenance_pages).length > 0}
                {(eventType === "incidents" ? scopeDialogSubscriber.incident_pages : scopeDialogSubscriber.maintenance_pages).length} page(s){(eventType === "incidents" ? scopeDialogSubscriber.incident_monitors : scopeDialogSubscriber.maintenance_monitors).length > 0 ? ", " : ""}
              {/if}
              {#if (eventType === "incidents" ? scopeDialogSubscriber.incident_monitors : scopeDialogSubscriber.maintenance_monitors).length > 0}
                {(eventType === "incidents" ? scopeDialogSubscriber.incident_monitors : scopeDialogSubscriber.maintenance_monitors).length} monitor(s)
              {/if}
            {:else}
              All monitors
            {/if}
          </p>
        {/if}
      </div>
    {/if}
  {/each}

  {#if !scopeDialogSubscriber.incidents_enabled && !scopeDialogSubscriber.maintenances_enabled}
    <p class="text-muted-foreground text-sm">No active subscriptions to configure scope for.</p>
  {/if}
{/if}
```

- [ ] **Step 7: Update the `fetchSubscribers` result mapping**

In `fetchSubscribers` (line 144-148), after `subscribers = result.subscribers || []`, the subscriber objects from the API now include `incident_pages` and `maintenance_pages`. The local `Subscriber` interface already has these. No code change needed here — the spread assignment works.

- [ ] **Step 8: Type-check**

```bash
npm run check
```

Expected: clean or only SubscribeMenu errors.

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(manage)/manage/app/subscriptions/+page.svelte"
git commit -m "feat: subscription scope dialog with grouped page/monitor selection"
```

---

## Task 8: Self-service UI — grouped scope picker in SubscribeMenu

**Files:**
- Modify: `src/lib/components/SubscribeMenu.svelte`

- [ ] **Step 1: Add `availablePages` state and update monitor scope state (lines 54-63)**

Replace the scope state block:

```typescript
// Monitor/page scope state
interface PageScopeOption {
  slug: string;
  name: string;
  monitors: Array<{ tag: string; name: string }>;
}
let availableMonitors = $state<{ tag: string; name: string }[]>([]);
let availablePages = $state<PageScopeOption[]>([]);

let incidentScope = $state<"all" | "specific">("all");
let incidentPageSelections = $state<Record<string, boolean>>({});
let incidentMonitorSelections = $state<Record<string, boolean>>({});

let maintenanceScope = $state<"all" | "specific">("all");
let maintenancePageSelections = $state<Record<string, boolean>>({});
let maintenanceMonitorSelections = $state<Record<string, boolean>>({});

let incidentScopeError = $state("");
let maintenanceScopeError = $state("");
let savingIncidentScope = $state(false);
let savingMaintenanceScope = $state(false);
```

- [ ] **Step 2: Update `fetchAvailableMonitors` to also load pages (lines 294-304)**

Replace:

```typescript
async function fetchAvailableMonitors() {
  try {
    const res = await fetch(clientResolver(resolve, "/dashboard-apis/subscription/monitors"));
    if (res.ok) {
      const data = await res.json();
      availableMonitors = data.monitors || [];
      // Build grouped pages from the extended response
      if (Array.isArray(data.pages)) {
        availablePages = data.pages;
      }
    }
  } catch (_err) {
    // scope picker simply won't show monitor list
  }
}
```

- [ ] **Step 3: Update preferences loading to restore page selections**

In the `handleGetPreferences` result handler (find the place where `incidentScope` and monitor selections are initialized after fetching preferences — it should be in the `loadPreferences` or `handleGetPreferences` callback), add page scope restoration. Search for where `incidentScope` is set to `"specific"`. It will look something like:

```typescript
// When loading preferences, restore page scope selections
if (prefs.incident_pages?.length > 0) {
  incidentScope = "specific";
  incidentPageSelections = Object.fromEntries(prefs.incident_pages.map((s: string) => [s, true]));
}
if (prefs.incident_monitors?.length > 0) {
  incidentScope = "specific";
  incidentMonitorSelections = Object.fromEntries(prefs.incident_monitors.map((t: string) => [t, true]));
}
if (prefs.maintenance_pages?.length > 0) {
  maintenanceScope = "specific";
  maintenancePageSelections = Object.fromEntries(prefs.maintenance_pages.map((s: string) => [s, true]));
}
if (prefs.maintenance_monitors?.length > 0) {
  maintenanceScope = "specific";
  maintenanceMonitorSelections = Object.fromEntries(prefs.maintenance_monitors.map((t: string) => [t, true]));
}
```

Find the existing code that does `incidentMonitorSelections = ...` and extend it with the above.

- [ ] **Step 4: Update `saveMonitorScope` to send page slugs (lines 306-349)**

Replace:

```typescript
async function saveMonitorScope(type: "incidents" | "maintenances") {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) { currentView = "login"; return; }

  const setError = (msg: string) => {
    if (type === "incidents") incidentScopeError = msg;
    else maintenanceScopeError = msg;
  };
  setError("");

  const scope = type === "incidents" ? incidentScope : maintenanceScope;
  const pageSelections = type === "incidents" ? incidentPageSelections : maintenancePageSelections;
  const monitorSelections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
  const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";
  const pageKey = type === "incidents" ? "incident_pages" : "maintenance_pages";

  let pages: string[] = [];
  let monitors: string[] = [];

  if (scope === "specific") {
    pages = Object.entries(pageSelections).filter(([, v]) => v).map(([k]) => k);
    // Exclude monitors that are covered by a selected page
    const coveredTags = new Set(
      availablePages
        .filter((p) => pages.includes(p.slug))
        .flatMap((p) => p.monitors.map((m) => m.tag))
    );
    monitors = Object.entries(monitorSelections)
      .filter(([k, v]) => v && !coveredTags.has(k))
      .map(([k]) => k);
    if (pages.length === 0 && monitors.length === 0) {
      setError($t("Select at least one page or monitor"));
      return;
    }
  }

  if (type === "incidents") savingIncidentScope = true;
  else savingMaintenanceScope = true;

  try {
    const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updatePreferences",
        token,
        [monitorKey]: monitors,
        [pageKey]: pages,
      })
    });
    if (!response.ok) {
      setError($t("Failed to save scope"));
    } else {
      trackEvent("subscribe_pref_toggled", { source: "subscribe_menu", type, scope });
    }
  } catch (_err) {
    setError($t("Network error. Please try again."));
  } finally {
    if (type === "incidents") savingIncidentScope = false;
    else savingMaintenanceScope = false;
  }
}
```

- [ ] **Step 5: Replace the incidents scope picker template (lines 514-547)**

Replace the scope picker block for incidents (inside `{#if incidentsEnabled && availableMonitors.length > 0}`):

```svelte
{#if incidentsEnabled && (availableMonitors.length > 0 || availablePages.length > 0)}
  <div class="bg-muted/50 ml-8 space-y-3 rounded-md p-3">
    <p class="text-muted-foreground text-xs font-medium">{$t("Notify me about:")}</p>
    <div class="flex flex-col gap-1">
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name="incident-scope" value="all" bind:group={incidentScope} />
        {$t("All monitors")}
      </label>
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name="incident-scope" value="specific" bind:group={incidentScope} />
        {$t("Specific pages / monitors")}
      </label>
    </div>
    {#if incidentScope === "specific"}
      <div class="ml-4 flex max-h-48 flex-col gap-2 overflow-y-auto pt-1">
        {#each availablePages as pageOpt (pageOpt.slug)}
          <div class="space-y-1">
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" bind:checked={incidentPageSelections[pageOpt.slug]} />
              <span class="text-muted-foreground text-xs">[{pageOpt.name}]</span>
            </label>
            {#if !incidentPageSelections[pageOpt.slug]}
              {#each pageOpt.monitors as mon (mon.tag)}
                <label class="ml-5 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" bind:checked={incidentMonitorSelections[mon.tag]} />
                  {mon.name}
                </label>
              {/each}
            {:else}
              {#each pageOpt.monitors as mon (mon.tag)}
                <label class="text-muted-foreground ml-5 flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled checked />
                  {mon.name}
                </label>
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if incidentScopeError}
      <p class="text-destructive text-xs">{incidentScopeError}</p>
    {/if}
    <Button size="sm" class="w-full" onclick={() => saveMonitorScope("incidents")} disabled={savingIncidentScope}>
      {#if savingIncidentScope}<Loader2 class="mr-2 h-3 w-3 animate-spin" />{/if}
      {$t("Save")}
    </Button>
  </div>
{/if}
```

- [ ] **Step 6: Replace the maintenances scope picker template (lines 566-601)**

Apply the same grouped pattern for the maintenances block (same structure, substituting `maintenance*` state variables and the `maintenance-scope` radio group name):

```svelte
{#if maintenancesEnabled && (availableMonitors.length > 0 || availablePages.length > 0)}
  <div class="bg-muted/50 ml-8 space-y-3 rounded-md p-3">
    <p class="text-muted-foreground text-xs font-medium">{$t("Notify me about:")}</p>
    <div class="flex flex-col gap-1">
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name="maintenance-scope" value="all" bind:group={maintenanceScope} />
        {$t("All monitors")}
      </label>
      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name="maintenance-scope" value="specific" bind:group={maintenanceScope} />
        {$t("Specific pages / monitors")}
      </label>
    </div>
    {#if maintenanceScope === "specific"}
      <div class="ml-4 flex max-h-48 flex-col gap-2 overflow-y-auto pt-1">
        {#each availablePages as pageOpt (pageOpt.slug)}
          <div class="space-y-1">
            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" bind:checked={maintenancePageSelections[pageOpt.slug]} />
              <span class="text-muted-foreground text-xs">[{pageOpt.name}]</span>
            </label>
            {#if !maintenancePageSelections[pageOpt.slug]}
              {#each pageOpt.monitors as mon (mon.tag)}
                <label class="ml-5 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" bind:checked={maintenanceMonitorSelections[mon.tag]} />
                  {mon.name}
                </label>
              {/each}
            {:else}
              {#each pageOpt.monitors as mon (mon.tag)}
                <label class="text-muted-foreground ml-5 flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled checked />
                  {mon.name}
                </label>
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    {#if maintenanceScopeError}
      <p class="text-destructive text-xs">{maintenanceScopeError}</p>
    {/if}
    <Button size="sm" class="w-full" onclick={() => saveMonitorScope("maintenances")} disabled={savingMaintenanceScope}>
      {#if savingMaintenanceScope}<Loader2 class="mr-2 h-3 w-3 animate-spin" />{/if}
      {$t("Save")}
    </Button>
  </div>
{/if}
```

- [ ] **Step 7: Type-check**

```bash
npm run check
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/SubscribeMenu.svelte
git commit -m "feat: SubscribeMenu scope picker with grouped page/monitor selection"
```

---

## Verification

- [ ] **Start dev server**

```bash
npm run dev
```

- [ ] **Admin UI smoke test**
  1. Go to `/manage/app/subscriptions`
  2. Open the scope dialog for a subscriber — verify pages and grouped monitors appear (filtered to subscriber's permissions)
  3. Select a whole page → individual monitors show as disabled with "(via page)"
  4. Select individual monitors on another page
  5. Save → toast success; re-open dialog → selections persist

- [ ] **Self-service smoke test**
  1. Go to status page, open the subscribe menu
  2. Enable incidents → scope picker shows "All monitors" / "Specific pages / monitors"
  3. Select "Specific pages / monitors" → grouped pages with monitors appear
  4. Select a page → child monitors become disabled
  5. Save → no error

- [ ] **Notification expansion smoke test** (manual DB check)
  1. Set a subscriber's incidents scope to a whole page slug (e.g. `home`)
  2. Open a DB browser, confirm `subscription_monitor_scopes` has one row with `scope_type='page'` and `monitor_tag='home'`
  3. Trigger a test incident on a monitor that belongs to that page
  4. Confirm the subscriber receives the email notification

- [ ] **Permission filter smoke test**
  1. Create a subscriber with no linked account → scope dialog should show only public pages/monitors
  2. Create a subscriber linked to a user with role access to a private page → scope dialog should also show that private page
