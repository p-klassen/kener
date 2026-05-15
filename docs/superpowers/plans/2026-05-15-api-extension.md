# API v4 Extension — Triggers, Alert Configs, Images, Export/Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the public `/api/v4/` REST API with endpoints for Triggers, Alert Configs, Images (full CRUD + upload), and Export/Import — mirroring what is currently only accessible via the internal admin panel.

**Architecture:** New SvelteKit route files under `src/routes/(api)/api/v4/`. The existing `hooks.server.ts` pre-loads DB records into `event.locals` for routes with URL params; new resources follow the same pattern. All endpoints share the same Bearer-token auth already enforced by hooks. Types land in `src/lib/types/api.ts`. The OpenAPI spec at `static/api-references/v4.json` is updated last, after all routes are verified.

**Tech Stack:** SvelteKit 2 / Svelte 5, TypeScript, Knex.js via the `db` singleton, controllers in `src/lib/server/controllers/`, existing DB repository methods.

---

## File Map

**New files:**
- `src/routes/(api)/api/v4/triggers/+server.ts` — GET list, POST create
- `src/routes/(api)/api/v4/triggers/[id]/+server.ts` — GET one, PATCH, DELETE
- `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/+server.ts` — GET list, POST create
- `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/[id]/+server.ts` — GET one, PATCH, DELETE
- `src/lib/server/controllers/imageController.ts` — exported uploadImage function (extracted from manage/api)
- `src/routes/(api)/api/v4/images/+server.ts` — GET list, POST upload
- `src/routes/(api)/api/v4/images/[id]/+server.ts` — GET one, DELETE
- `src/routes/(api)/api/v4/export/+server.ts` — GET export
- `src/routes/(api)/api/v4/import/+server.ts` — POST import

**Modified files:**
- `src/app.d.ts` — add `trigger`, `alertConfig`, `image` to `App.Locals`
- `src/hooks.server.ts` — add pre-loading for trigger by id, alertConfig by id, image by id
- `src/lib/types/api.ts` — add new request/response types for all resources
- `src/routes/(manage)/manage/api/+server.ts` — replace local `uploadImage` with import from imageController
- `static/api-references/v4.json` — add all new paths and schemas

---

## Codebase Orientation (read before implementing)

**Auth pattern:** Bearer token is checked globally in `hooks.server.ts`. No per-route auth code needed.

**Pre-loading pattern (hooks.server.ts):**
```typescript
// Existing example — incident pre-loading:
const INCIDENT_ID_ROUTE_REGEX = /^\/api\/(?:v\d+\/)?incidents\/(\d+)/;
// In apiAuthHandle:
const incidentId = extractIncidentId(pathname);
if (incidentId) {
  const incident = await db.getIncidentById(incidentId);
  if (!incident) return json({ error: { code: "NOT_FOUND", message: "..." } }, { status: 404 });
  event.locals.incident = incident;
}
```

**DB singleton:** `import db from "$lib/server/db/db"` — all DB access goes here.

**Key DB methods you will use:**
- Triggers: `db.getTriggers({})`, `db.getTriggerByID(id)`, `db.createNewTrigger(data)`, `db.updateTrigger(data)`, `db.deleteTrigger(id)`
- Alert configs: `db.getMonitorAlertConfigsWithTriggersByMonitorTag(tag)`, `db.getMonitorAlertConfigWithTriggers(id)`, `db.deleteMonitorAlertConfig(id)`
- Alert config controllers: `CreateMonitorAlertConfig(data)`, `UpdateMonitorAlertConfig(data)`, `DeleteMonitorAlertConfig(id)` from `$lib/server/controllers/monitorAlertConfigController`
- Images: `db.getAllImages()`, `db.getImageById(id)`, `db.deleteImage(id)`
- Export/Import: `exportData(scope)`, `importData(payload)` from `$lib/server/controllers/exportImportController`

**Key types:**
- `TriggerRecord` — `{ id: number, name: string, trigger_type: string|null, trigger_desc: string|null, trigger_status: string|null, trigger_meta: string, created_at: Date, updated_at: Date }`
- `TriggerRecordInsert` — `{ name: string, trigger_type?, trigger_desc?, trigger_status?, trigger_meta? }`
- `MonitorAlertConfigWithTriggers` — extends `MonitorAlertConfigRecord` with `triggers: TriggerRecord[]` and `monitor_tags: string[]`
- `MonitorAlertConfigCreateInput` — `{ monitor_tags: string[], alert_for: "STATUS"|"LATENCY"|"UPTIME", alert_value: string, failure_threshold: number, success_threshold: number, alert_description?, create_incident?: "YES"|"NO", is_active?: "YES"|"NO", severity?: "CRITICAL"|"WARNING", trigger_ids?: number[] }`
- `ImageRecord` — `{ id: string, data: string, mime_type: string, original_name: string|null, width: number|null, height: number|null, size: number|null, created_at: Date, updated_at: Date }`

**Standard error response:**
```typescript
return json({ error: { code: "BAD_REQUEST", message: "..." } }, { status: 400 });
```

**Type check command:** `npm run check` (SvelteKit + TypeScript — no automated test suite exists)

---

## Task 1: Add API Types

**Files:**
- Modify: `src/lib/types/api.ts`

- [ ] **Step 1: Append new types to `src/lib/types/api.ts`**

Open `src/lib/types/api.ts` and append at the end:

```typescript
// ============ Trigger API types ============

export interface TriggerResponse {
  id: number;
  name: string;
  trigger_type: string | null;
  trigger_desc: string | null;
  trigger_status: string | null;
  trigger_meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GetTriggersListResponse {
  triggers: TriggerResponse[];
}

export interface GetTriggerResponse {
  trigger: TriggerResponse;
}

export interface CreateTriggerRequest {
  name: string;
  trigger_type: string;
  trigger_desc?: string | null;
  trigger_status?: string | null;
  trigger_meta?: Record<string, unknown>;
}

export interface CreateTriggerResponse {
  trigger: TriggerResponse;
}

export interface UpdateTriggerRequest {
  trigger_type?: string;
  trigger_desc?: string | null;
  trigger_status?: string | null;
  trigger_meta?: Record<string, unknown>;
}

export interface UpdateTriggerResponse {
  trigger: TriggerResponse;
}

// ============ Alert Config API types ============

export interface AlertConfigTriggerRef {
  id: number;
  name: string;
  trigger_type: string | null;
}

export interface AlertConfigResponse {
  id: number;
  monitor_tags: string[];
  alert_for: "STATUS" | "LATENCY" | "UPTIME";
  alert_value: string;
  failure_threshold: number;
  success_threshold: number;
  alert_description: string | null;
  create_incident: "YES" | "NO";
  is_active: "YES" | "NO";
  severity: "CRITICAL" | "WARNING";
  trigger_ids: number[];
  triggers: AlertConfigTriggerRef[];
  created_at: string;
  updated_at: string;
}

export interface GetAlertConfigsListResponse {
  alert_configs: AlertConfigResponse[];
}

export interface GetAlertConfigResponse {
  alert_config: AlertConfigResponse;
}

export interface CreateAlertConfigRequest {
  alert_for: "STATUS" | "LATENCY" | "UPTIME";
  alert_value: string;
  failure_threshold: number;
  success_threshold: number;
  alert_description?: string | null;
  create_incident?: "YES" | "NO";
  is_active?: "YES" | "NO";
  severity?: "CRITICAL" | "WARNING";
  trigger_ids?: number[];
}

export interface CreateAlertConfigResponse {
  alert_config: AlertConfigResponse;
}

export interface UpdateAlertConfigRequest {
  alert_for?: "STATUS" | "LATENCY" | "UPTIME";
  alert_value?: string;
  failure_threshold?: number;
  success_threshold?: number;
  alert_description?: string | null;
  create_incident?: "YES" | "NO";
  is_active?: "YES" | "NO";
  severity?: "CRITICAL" | "WARNING";
  trigger_ids?: number[];
}

export interface UpdateAlertConfigResponse {
  alert_config: AlertConfigResponse;
}

// ============ Image API types ============

export interface ImageMetaResponse {
  id: string;
  mime_type: string;
  original_name: string | null;
  width: number | null;
  height: number | null;
  size: number | null;
  created_at: string;
}

export interface GetImagesListResponse {
  images: ImageMetaResponse[];
}

export interface GetImageResponse {
  image: ImageMetaResponse;
}

export interface UploadImageResponse {
  image: ImageMetaResponse;
}

// ============ Export/Import API types ============

export interface ImportResultResponse {
  imported: Record<string, number>;
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npm run check 2>&1 | tail -20
```

Expected: same error count as before (pre-existing errors only — typically 2 about `monitor_layout_style`). Zero new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/api.ts
git commit -m "feat(api): add TypeScript types for triggers, alert-configs, images, export/import"
```

---

## Task 2: Triggers API — hooks + routes

**Files:**
- Modify: `src/app.d.ts`
- Modify: `src/hooks.server.ts`
- Create: `src/routes/(api)/api/v4/triggers/+server.ts`
- Create: `src/routes/(api)/api/v4/triggers/[id]/+server.ts`

- [ ] **Step 1: Add `trigger` to `App.Locals` in `src/app.d.ts`**

In `src/app.d.ts`, inside `interface Locals { ... }`, add after the `page?` line:

```typescript
      // Set by hooks.server.ts for /api/triggers/:id/* routes
      trigger?: import("$lib/server/types/db").TriggerRecord;
```

- [ ] **Step 2: Add trigger pre-loading to `src/hooks.server.ts`**

After the existing `PAGE_PATH_ROUTE_REGEX` constant (line ~25), add:

```typescript
// Regex to match routes with trigger id parameter
const TRIGGER_ID_ROUTE_REGEX = /^\/api\/(?:v\d+\/)?triggers\/(\d+)/;
```

After the existing `extractPagePath` function, add:

```typescript
function extractTriggerId(pathname: string): number | null {
  const match = pathname.match(TRIGGER_ID_ROUTE_REGEX);
  return match ? parseInt(match[1], 10) : null;
}
```

Inside `apiAuthHandle`, after the `pagePath` block (before the closing `}`), add:

```typescript
    // Validate trigger id exists for /api/(vX/)?triggers/:id/* routes
    const triggerId = extractTriggerId(pathname);
    if (triggerId) {
      const trigger = await db.getTriggerByID(triggerId);
      if (!trigger) {
        const errorResponse: NotFoundResponse = {
          error: {
            code: "NOT_FOUND",
            message: `Trigger with id '${triggerId}' not found`,
          },
        };
        return json(errorResponse, { status: 404 });
      }
      event.locals.trigger = trigger;
    }
```

- [ ] **Step 3: Create `src/routes/(api)/api/v4/triggers/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import type { TriggerRecord, TriggerRecordInsert } from "$lib/server/types/db";
import type {
  GetTriggersListResponse,
  CreateTriggerRequest,
  CreateTriggerResponse,
  BadRequestResponse,
} from "$lib/types/api";

function formatTrigger(t: TriggerRecord) {
  let meta: Record<string, unknown> = {};
  try {
    meta = t.trigger_meta ? JSON.parse(t.trigger_meta) : {};
  } catch {
    meta = {};
  }
  return {
    id: t.id,
    name: t.name,
    trigger_type: t.trigger_type,
    trigger_desc: t.trigger_desc,
    trigger_status: t.trigger_status,
    trigger_meta: meta,
    created_at: new Date(t.created_at).toISOString(),
    updated_at: new Date(t.updated_at).toISOString(),
  };
}

export const GET: RequestHandler = async () => {
  const triggers = await db.getTriggers({});
  const response: GetTriggersListResponse = { triggers: triggers.map(formatTrigger) };
  return json(response);
};

export const POST: RequestHandler = async ({ request }) => {
  let body: CreateTriggerRequest;
  try {
    body = await request.json();
  } catch {
    const err: BadRequestResponse = { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } };
    return json(err, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return json({ error: { code: "BAD_REQUEST", message: "name is required and must be a non-empty string" } }, { status: 400 });
  }
  if (!body.trigger_type || typeof body.trigger_type !== "string" || body.trigger_type.trim().length === 0) {
    return json({ error: { code: "BAD_REQUEST", message: "trigger_type is required" } }, { status: 400 });
  }

  // Check for duplicate name
  const existing = await db.getTriggers({});
  if (existing.some((t) => t.name === body.name.trim())) {
    return json({ error: { code: "BAD_REQUEST", message: `Trigger with name '${body.name}' already exists` } }, { status: 400 });
  }

  const insertData: TriggerRecordInsert = {
    name: body.name.trim(),
    trigger_type: body.trigger_type.trim(),
    trigger_desc: body.trigger_desc ?? null,
    trigger_status: body.trigger_status ?? null,
    trigger_meta: body.trigger_meta ? JSON.stringify(body.trigger_meta) : "{}",
  };

  const [id] = await db.createNewTrigger(insertData);
  const created = await db.getTriggerByID(id);

  if (!created) {
    return json({ error: { code: "INTERNAL_ERROR", message: "Failed to create trigger" } }, { status: 500 });
  }

  const response: CreateTriggerResponse = { trigger: formatTrigger(created) };
  return json(response, { status: 201 });
};
```

- [ ] **Step 4: Create `src/routes/(api)/api/v4/triggers/[id]/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import type { TriggerRecord } from "$lib/server/types/db";
import type {
  GetTriggerResponse,
  UpdateTriggerRequest,
  UpdateTriggerResponse,
  BadRequestResponse,
} from "$lib/types/api";

function formatTrigger(t: TriggerRecord) {
  let meta: Record<string, unknown> = {};
  try {
    meta = t.trigger_meta ? JSON.parse(t.trigger_meta) : {};
  } catch {
    meta = {};
  }
  return {
    id: t.id,
    name: t.name,
    trigger_type: t.trigger_type,
    trigger_desc: t.trigger_desc,
    trigger_status: t.trigger_status,
    trigger_meta: meta,
    created_at: new Date(t.created_at).toISOString(),
    updated_at: new Date(t.updated_at).toISOString(),
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  const response: GetTriggerResponse = { trigger: formatTrigger(locals.trigger!) };
  return json(response);
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const existing = locals.trigger!;

  let body: UpdateTriggerRequest;
  try {
    body = await request.json();
  } catch {
    const err: BadRequestResponse = { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } };
    return json(err, { status: 400 });
  }

  await db.updateTrigger({
    ...existing,
    trigger_type: body.trigger_type !== undefined ? body.trigger_type : existing.trigger_type,
    trigger_desc: body.trigger_desc !== undefined ? body.trigger_desc : existing.trigger_desc,
    trigger_status: body.trigger_status !== undefined ? body.trigger_status : existing.trigger_status,
    trigger_meta:
      body.trigger_meta !== undefined ? JSON.stringify(body.trigger_meta) : existing.trigger_meta,
  });

  const updated = await db.getTriggerByID(existing.id);
  if (!updated) {
    return json({ error: { code: "INTERNAL_ERROR", message: "Failed to update trigger" } }, { status: 500 });
  }

  const response: UpdateTriggerResponse = { trigger: formatTrigger(updated) };
  return json(response);
};

export const DELETE: RequestHandler = async ({ locals }) => {
  await db.deleteTrigger(locals.trigger!.id);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 5: Verify TypeScript**

```bash
npm run check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 6: Start dev server and smoke-test**

```bash
# In a terminal, start the dev server:
npm run dev

# In another terminal — replace YOUR_API_KEY with a real key from the admin UI:
export API_KEY=YOUR_API_KEY

# List triggers (expect 200 with triggers array)
curl -s -H "Authorization: Bearer $API_KEY" http://localhost:5173/api/v4/triggers | jq .

# Create a trigger (expect 201)
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"test-webhook","trigger_type":"webhook","trigger_meta":{"url":"https://example.com/hook"}}' \
  http://localhost:5173/api/v4/triggers | jq .

# Note the id from the response, e.g. 1, then:
curl -s -H "Authorization: Bearer $API_KEY" http://localhost:5173/api/v4/triggers/1 | jq .

# Patch it
curl -s -X PATCH -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"trigger_desc":"Updated desc"}' \
  http://localhost:5173/api/v4/triggers/1 | jq .

# Delete it (expect 204 empty body)
curl -s -X DELETE -H "Authorization: Bearer $API_KEY" http://localhost:5173/api/v4/triggers/1 -o /dev/null -w "%{http_code}\n"

# Verify 404 for missing trigger
curl -s -H "Authorization: Bearer $API_KEY" http://localhost:5173/api/v4/triggers/99999 | jq .
```

Expected: all responses match described shapes; 404 returns `{ error: { code: "NOT_FOUND", ... } }`.

- [ ] **Step 7: Commit**

```bash
git add src/app.d.ts src/hooks.server.ts \
  src/routes/\(api\)/api/v4/triggers/+server.ts \
  src/routes/\(api\)/api/v4/triggers/\[id\]/+server.ts
git commit -m "feat(api): add /api/v4/triggers CRUD endpoints"
```

---

## Task 3: Alert Configs API — hooks + routes

**Files:**
- Modify: `src/app.d.ts`
- Modify: `src/hooks.server.ts`
- Create: `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/+server.ts`
- Create: `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/[id]/+server.ts`

Alert configs can apply to multiple monitors (stored in a junction table). When creating via `POST /api/v4/monitors/{tag}/alert-configs`, the `monitor_tags` array is set to `[tag]` automatically. The record's `id` is numeric.

- [ ] **Step 1: Add `alertConfig` to `App.Locals` in `src/app.d.ts`**

Inside `interface Locals { ... }`, add after the `trigger?` line:

```typescript
      // Set by hooks.server.ts for /api/monitors/:tag/alert-configs/:id/* routes
      alertConfig?: import("$lib/server/types/db").MonitorAlertConfigWithTriggers;
```

- [ ] **Step 2: Add alert config pre-loading to `src/hooks.server.ts`**

After the `TRIGGER_ID_ROUTE_REGEX` constant, add:

```typescript
// Regex to match routes with alert config id under a monitor
const ALERT_CONFIG_ID_ROUTE_REGEX = /^\/api\/(?:v\d+\/)?monitors\/[^/]+\/alert-configs\/(\d+)/;
```

After the `extractTriggerId` function, add:

```typescript
function extractAlertConfigId(pathname: string): number | null {
  const match = pathname.match(ALERT_CONFIG_ID_ROUTE_REGEX);
  return match ? parseInt(match[1], 10) : null;
}
```

Inside `apiAuthHandle`, after the `triggerId` block, add:

```typescript
    // Validate alert config id for /api/(vX/)?monitors/:tag/alert-configs/:id/* routes
    const alertConfigId = extractAlertConfigId(pathname);
    if (alertConfigId) {
      const alertConfig = await db.getMonitorAlertConfigWithTriggers(alertConfigId);
      const monitorTagForCheck = extractMonitorTag(pathname);
      if (!alertConfig || (monitorTagForCheck && !alertConfig.monitor_tags.includes(monitorTagForCheck))) {
        const errorResponse: NotFoundResponse = {
          error: {
            code: "NOT_FOUND",
            message: `Alert config with id '${alertConfigId}' not found`,
          },
        };
        return json(errorResponse, { status: 404 });
      }
      event.locals.alertConfig = alertConfig;
    }
```

- [ ] **Step 3: Create `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import {
  CreateMonitorAlertConfig,
} from "$lib/server/controllers/monitorAlertConfigController";
import type { MonitorAlertConfigWithTriggers } from "$lib/server/types/db";
import type {
  GetAlertConfigsListResponse,
  CreateAlertConfigRequest,
  CreateAlertConfigResponse,
  BadRequestResponse,
} from "$lib/types/api";

function formatAlertConfig(c: MonitorAlertConfigWithTriggers) {
  return {
    id: c.id,
    monitor_tags: c.monitor_tags,
    alert_for: c.alert_for,
    alert_value: c.alert_value,
    failure_threshold: c.failure_threshold,
    success_threshold: c.success_threshold,
    alert_description: c.alert_description,
    create_incident: c.create_incident,
    is_active: c.is_active,
    severity: c.severity,
    trigger_ids: c.triggers.map((t) => t.id),
    triggers: c.triggers.map((t) => ({
      id: t.id,
      name: t.name,
      trigger_type: t.trigger_type,
    })),
    created_at: new Date(c.created_at).toISOString(),
    updated_at: new Date(c.updated_at).toISOString(),
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  const monitorTag = locals.monitor!.tag;
  const configs = await db.getMonitorAlertConfigsWithTriggersByMonitorTag(monitorTag);
  const response: GetAlertConfigsListResponse = { alert_configs: configs.map(formatAlertConfig) };
  return json(response);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const monitorTag = locals.monitor!.tag;

  let body: CreateAlertConfigRequest;
  try {
    body = await request.json();
  } catch {
    const err: BadRequestResponse = { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } };
    return json(err, { status: 400 });
  }

  const validAlertFor = ["STATUS", "LATENCY", "UPTIME"];
  if (!body.alert_for || !validAlertFor.includes(body.alert_for)) {
    return json({ error: { code: "BAD_REQUEST", message: `alert_for must be one of: ${validAlertFor.join(", ")}` } }, { status: 400 });
  }
  if (body.alert_value === undefined || body.alert_value === null || String(body.alert_value).trim().length === 0) {
    return json({ error: { code: "BAD_REQUEST", message: "alert_value is required" } }, { status: 400 });
  }
  if (body.failure_threshold === undefined || typeof body.failure_threshold !== "number") {
    return json({ error: { code: "BAD_REQUEST", message: "failure_threshold must be a number" } }, { status: 400 });
  }
  if (body.success_threshold === undefined || typeof body.success_threshold !== "number") {
    return json({ error: { code: "BAD_REQUEST", message: "success_threshold must be a number" } }, { status: 400 });
  }

  try {
    const result = await CreateMonitorAlertConfig({
      monitor_tags: [monitorTag],
      alert_for: body.alert_for,
      alert_value: String(body.alert_value),
      failure_threshold: body.failure_threshold,
      success_threshold: body.success_threshold,
      alert_description: body.alert_description ?? null,
      create_incident: body.create_incident ?? "NO",
      is_active: body.is_active ?? "YES",
      severity: body.severity ?? "WARNING",
      trigger_ids: body.trigger_ids ?? [],
    });
    const response: CreateAlertConfigResponse = { alert_config: formatAlertConfig(result) };
    return json(response, { status: 201 });
  } catch (e) {
    return json({ error: { code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Failed to create alert config" } }, { status: 400 });
  }
};
```

- [ ] **Step 4: Create `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/[id]/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import {
  UpdateMonitorAlertConfig,
  DeleteMonitorAlertConfig,
} from "$lib/server/controllers/monitorAlertConfigController";
import type { MonitorAlertConfigWithTriggers } from "$lib/server/types/db";
import type {
  GetAlertConfigResponse,
  UpdateAlertConfigRequest,
  UpdateAlertConfigResponse,
  BadRequestResponse,
} from "$lib/types/api";

function formatAlertConfig(c: MonitorAlertConfigWithTriggers) {
  return {
    id: c.id,
    monitor_tags: c.monitor_tags,
    alert_for: c.alert_for,
    alert_value: c.alert_value,
    failure_threshold: c.failure_threshold,
    success_threshold: c.success_threshold,
    alert_description: c.alert_description,
    create_incident: c.create_incident,
    is_active: c.is_active,
    severity: c.severity,
    trigger_ids: c.triggers.map((t) => t.id),
    triggers: c.triggers.map((t) => ({
      id: t.id,
      name: t.name,
      trigger_type: t.trigger_type,
    })),
    created_at: new Date(c.created_at).toISOString(),
    updated_at: new Date(c.updated_at).toISOString(),
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  const response: GetAlertConfigResponse = { alert_config: formatAlertConfig(locals.alertConfig!) };
  return json(response);
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const existing = locals.alertConfig!;

  let body: UpdateAlertConfigRequest;
  try {
    body = await request.json();
  } catch {
    const err: BadRequestResponse = { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } };
    return json(err, { status: 400 });
  }

  const validAlertFor = ["STATUS", "LATENCY", "UPTIME"];
  if (body.alert_for !== undefined && !validAlertFor.includes(body.alert_for)) {
    return json({ error: { code: "BAD_REQUEST", message: `alert_for must be one of: ${validAlertFor.join(", ")}` } }, { status: 400 });
  }

  try {
    const result = await UpdateMonitorAlertConfig({
      id: existing.id,
      alert_for: body.alert_for,
      alert_value: body.alert_value !== undefined ? String(body.alert_value) : undefined,
      failure_threshold: body.failure_threshold,
      success_threshold: body.success_threshold,
      alert_description: body.alert_description,
      create_incident: body.create_incident,
      is_active: body.is_active,
      severity: body.severity,
      trigger_ids: body.trigger_ids,
    });
    const response: UpdateAlertConfigResponse = { alert_config: formatAlertConfig(result) };
    return json(response);
  } catch (e) {
    return json({ error: { code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Failed to update alert config" } }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ locals }) => {
  await DeleteMonitorAlertConfig(locals.alertConfig!.id);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 5: Verify TypeScript**

```bash
npm run check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 6: Smoke-test**

Requires a running dev server and a monitor with tag `my-monitor` to exist.

```bash
export API_KEY=YOUR_API_KEY
export TAG=my-monitor  # replace with a real monitor tag

# List alert configs for monitor (expect 200, array may be empty)
curl -s -H "Authorization: Bearer $API_KEY" \
  http://localhost:5173/api/v4/monitors/$TAG/alert-configs | jq .

# Create an alert config (expect 201)
curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"alert_for":"STATUS","alert_value":"DOWN","failure_threshold":1,"success_threshold":1}' \
  http://localhost:5173/api/v4/monitors/$TAG/alert-configs | jq .

# Note the id (e.g. 1):
curl -s -H "Authorization: Bearer $API_KEY" \
  http://localhost:5173/api/v4/monitors/$TAG/alert-configs/1 | jq .

# Patch it
curl -s -X PATCH -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"is_active":"NO"}' \
  http://localhost:5173/api/v4/monitors/$TAG/alert-configs/1 | jq .

# Delete (expect 204)
curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
  http://localhost:5173/api/v4/monitors/$TAG/alert-configs/1 -o /dev/null -w "%{http_code}\n"
```

- [ ] **Step 7: Commit**

```bash
git add src/app.d.ts src/hooks.server.ts \
  "src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/+server.ts" \
  "src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/[id]/+server.ts"
git commit -m "feat(api): add /api/v4/monitors/{tag}/alert-configs CRUD endpoints"
```

---

## Task 4: Extract Image Upload Controller

The `uploadImage` function currently lives as a local function inside `src/routes/(manage)/manage/api/+server.ts` (around line 1182). It needs to be a shared controller so the new REST endpoint can reuse it.

**Files:**
- Create: `src/lib/server/controllers/imageController.ts`
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Read the existing `uploadImage` function**

Open `src/routes/(manage)/manage/api/+server.ts` and find the `uploadImage` function (search for `async function uploadImage`). Read from its start (~line 1182) through its closing `}` (~line 1390). Also note the `ImageUploadData` interface defined just above it (~line 1170).

Note which imports the function uses at the top of the file:
- `import sharp from "sharp";`
- `import { nanoid } from "nanoid";`
- `import heicConvert from "heic-convert";` (may or may not be present)
- `import GC from "../../lib/global-constants.js";` (or similar path)
- `import db from "$lib/server/db/db";`

- [ ] **Step 2: Create `src/lib/server/controllers/imageController.ts`**

Create the file with the extracted logic. Use the exact same implementation as the existing `uploadImage` function — copy it verbatim, adjusting only the import paths for the new file location. The imports should be:

```typescript
import sharp from "sharp";
import { nanoid } from "nanoid";
import db from "../db/db.js";
import GC from "../../global-constants.js";
import type { ImageRecord } from "../types/db.js";

// heic-convert is an optional dependency — wrap import
let heicConvert: ((opts: { buffer: ArrayBuffer; format: string; quality: number }) => Promise<Uint8Array>) | undefined;
try {
  heicConvert = (await import("heic-convert")).default;
} catch {
  // heic-convert not available — HEIC uploads will fail gracefully
}

export interface ImageUploadData {
  base64: string;
  mimeType: string;
  fileName?: string;
  maxWidth?: number;
  maxHeight?: number;
  forceDimensions?: boolean;
  prefix?: string;
}

export async function uploadImage(data: ImageUploadData): Promise<{ id: string; url: string }> {
  // Copy the full function body verbatim from manage/api/+server.ts
  // Adjust only: heicConvert() calls must use the imported heicConvert variable above
  // Everything else is identical
}

export function formatImageMeta(img: ImageRecord) {
  return {
    id: img.id,
    mime_type: img.mime_type,
    original_name: img.original_name,
    width: img.width,
    height: img.height,
    size: img.size,
    created_at: new Date(img.created_at).toISOString(),
  };
}
```

**Important:** The `heicConvert` call in the original function is:
```typescript
const converted = await heicConvert({
  buffer: new Uint8Array(imageBuffer) as unknown as ArrayBuffer,
  format: "JPEG",
  quality: 0.85,
});
```
In the controller, guard this with `if (heicConvert)` before calling it. If heicConvert is undefined and the file is HEIC, throw `new Error("HEIC conversion not available")`.

- [ ] **Step 3: Update `src/routes/(manage)/manage/api/+server.ts`**

Replace the local `ImageUploadData` interface and `uploadImage` function with an import:

```typescript
import { uploadImage } from "$lib/server/controllers/imageController";
```

Remove the `interface ImageUploadData { ... }` block and the `async function uploadImage(...) { ... }` block entirely. The `uploadImage(data)` call site at line ~462 remains unchanged since the signature is identical.

Also remove the now-unused imports `sharp`, `nanoid` (and `heicConvert` if present) **only if** they are not used anywhere else in the file. Check by searching for other uses before removing.

- [ ] **Step 4: Verify TypeScript**

```bash
npm run check 2>&1 | tail -20
```

Expected: no new errors. The manage/api page must still work (same function signature, same behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/controllers/imageController.ts \
  "src/routes/(manage)/manage/api/+server.ts"
git commit -m "refactor: extract uploadImage to imageController for reuse by REST API"
```

---

## Task 5: Images API — hooks + routes

**Files:**
- Modify: `src/app.d.ts`
- Modify: `src/hooks.server.ts`
- Create: `src/routes/(api)/api/v4/images/+server.ts`
- Create: `src/routes/(api)/api/v4/images/[id]/+server.ts`

- [ ] **Step 1: Add `image` to `App.Locals` in `src/app.d.ts`**

Inside `interface Locals { ... }`, add after the `alertConfig?` line:

```typescript
      // Set by hooks.server.ts for /api/images/:id/* routes
      image?: import("$lib/server/types/db").ImageRecord;
```

- [ ] **Step 2: Add image pre-loading to `src/hooks.server.ts`**

After the `ALERT_CONFIG_ID_ROUTE_REGEX` constant, add:

```typescript
// Regex to match routes with image id parameter
const IMAGE_ID_ROUTE_REGEX = /^\/api\/(?:v\d+\/)?images\/([^/]+)/;
```

After the `extractAlertConfigId` function, add:

```typescript
function extractImageId(pathname: string): string | null {
  const match = pathname.match(IMAGE_ID_ROUTE_REGEX);
  return match ? decodeURIComponent(match[1]) : null;
}
```

Inside `apiAuthHandle`, after the `alertConfigId` block, add:

```typescript
    // Validate image id exists for /api/(vX/)?images/:id/* routes
    const imageId = extractImageId(pathname);
    if (imageId) {
      const image = await db.getImageById(imageId);
      if (!image) {
        const errorResponse: NotFoundResponse = {
          error: {
            code: "NOT_FOUND",
            message: `Image with id '${imageId}' not found`,
          },
        };
        return json(errorResponse, { status: 404 });
      }
      event.locals.image = image;
    }
```

- [ ] **Step 3: Create `src/routes/(api)/api/v4/images/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import { uploadImage, formatImageMeta } from "$lib/server/controllers/imageController";
import type { GetImagesListResponse, UploadImageResponse, BadRequestResponse } from "$lib/types/api";

export const GET: RequestHandler = async () => {
  const images = await db.getAllImages();
  const response: GetImagesListResponse = { images: images.map(formatImageMeta) };
  return json(response);
};

export const POST: RequestHandler = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const err: BadRequestResponse = { error: { code: "BAD_REQUEST", message: "Content-Type must be multipart/form-data" } };
    return json(err, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: { code: "BAD_REQUEST", message: "Invalid form data" } }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return json({ error: { code: "BAD_REQUEST", message: "A file field named 'file' is required" } }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  try {
    const result = await uploadImage({
      base64,
      mimeType: file.type,
      fileName: file.name || undefined,
    });

    const image = await db.getImageById(result.id);
    if (!image) {
      return json({ error: { code: "INTERNAL_ERROR", message: "Failed to retrieve uploaded image" } }, { status: 500 });
    }

    const response: UploadImageResponse = { image: formatImageMeta(image) };
    return json(response, { status: 201 });
  } catch (e) {
    return json({ error: { code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Upload failed" } }, { status: 400 });
  }
};
```

- [ ] **Step 4: Create `src/routes/(api)/api/v4/images/[id]/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import { formatImageMeta } from "$lib/server/controllers/imageController";
import type { GetImageResponse } from "$lib/types/api";

export const GET: RequestHandler = async ({ locals }) => {
  const response: GetImageResponse = { image: formatImageMeta(locals.image!) };
  return json(response);
};

export const DELETE: RequestHandler = async ({ locals }) => {
  await db.deleteImage(locals.image!.id);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 5: Verify TypeScript**

```bash
npm run check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 6: Smoke-test**

```bash
export API_KEY=YOUR_API_KEY

# List images
curl -s -H "Authorization: Bearer $API_KEY" http://localhost:5173/api/v4/images | jq .

# Upload an image (use any small PNG/JPEG file)
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  -F "file=@/path/to/test-image.png" \
  http://localhost:5173/api/v4/images | jq .

# Note the id from the response, e.g. "abc123.png"
curl -s -H "Authorization: Bearer $API_KEY" http://localhost:5173/api/v4/images/abc123.png | jq .

# Delete (expect 204)
curl -s -X DELETE -H "Authorization: Bearer $API_KEY" \
  http://localhost:5173/api/v4/images/abc123.png -o /dev/null -w "%{http_code}\n"

# Verify 404
curl -s -H "Authorization: Bearer $API_KEY" \
  http://localhost:5173/api/v4/images/doesnotexist.png | jq .
```

- [ ] **Step 7: Commit**

```bash
git add src/app.d.ts src/hooks.server.ts \
  src/routes/\(api\)/api/v4/images/+server.ts \
  src/routes/\(api\)/api/v4/images/\[id\]/+server.ts
git commit -m "feat(api): add /api/v4/images CRUD endpoints with multipart upload"
```

---

## Task 6: Export / Import API

**Files:**
- Create: `src/routes/(api)/api/v4/export/+server.ts`
- Create: `src/routes/(api)/api/v4/import/+server.ts`

No hooks changes needed — these routes have no URL params to pre-load.

- [ ] **Step 1: Create `src/routes/(api)/api/v4/export/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import { exportData } from "$lib/server/controllers/exportImportController";
import type { ExportScope } from "$lib/server/controllers/exportImportController";
import type { BadRequestResponse } from "$lib/types/api";

const VALID_SCOPES: ExportScope[] = ["config", "users_groups_roles", "everything"];

export const GET: RequestHandler = async ({ url }) => {
  const scopeParam = url.searchParams.get("scope") ?? "everything";

  if (!VALID_SCOPES.includes(scopeParam as ExportScope)) {
    const err: BadRequestResponse = {
      error: {
        code: "BAD_REQUEST",
        message: `scope must be one of: ${VALID_SCOPES.join(", ")}`,
      },
    };
    return json(err, { status: 400 });
  }

  const payload = await exportData(scopeParam as ExportScope);
  return json(payload);
};
```

- [ ] **Step 2: Create `src/routes/(api)/api/v4/import/+server.ts`**

```typescript
import { json, type RequestHandler } from "@sveltejs/kit";
import { importData } from "$lib/server/controllers/exportImportController";
import type { ExportPayload } from "$lib/server/controllers/exportImportController";
import type { ImportResultResponse, BadRequestResponse } from "$lib/types/api";

export const POST: RequestHandler = async ({ request }) => {
  let payload: ExportPayload;
  try {
    payload = await request.json();
  } catch {
    const err: BadRequestResponse = { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } };
    return json(err, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !payload.version || !payload.scope) {
    return json({ error: { code: "BAD_REQUEST", message: "Invalid export payload: missing version or scope" } }, { status: 400 });
  }

  try {
    const result = await importData(payload);
    const response: ImportResultResponse = { imported: result.imported };
    return json(response);
  } catch (e) {
    return json({ error: { code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : "Import failed" } }, { status: 500 });
  }
};
```

- [ ] **Step 3: Verify TypeScript**

```bash
npm run check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 4: Smoke-test**

```bash
export API_KEY=YOUR_API_KEY

# Export everything
curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:5173/api/v4/export?scope=everything" | jq '{scope: .scope, version: .version}'

# Export config only
curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:5173/api/v4/export?scope=config" | jq '{scope: .scope}'

# Invalid scope (expect 400)
curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:5173/api/v4/export?scope=invalid" | jq .

# Round-trip: export then import (expect 200 with imported counts)
curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:5173/api/v4/export?scope=config" > /tmp/export.json

curl -s -X POST -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d @/tmp/export.json \
  http://localhost:5173/api/v4/import | jq .
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(api\)/api/v4/export/+server.ts \
  src/routes/\(api\)/api/v4/import/+server.ts
git commit -m "feat(api): add /api/v4/export and /api/v4/import endpoints"
```

---

## Task 7: Update OpenAPI Spec

**Files:**
- Modify: `static/api-references/v4.json`

The spec is a large JSON file. Add new entries to both `paths` and `components/schemas`.

- [ ] **Step 1: Add schemas to `components.schemas`**

Inside the `components.schemas` object, add the following entries (after the existing schemas):

```json
"Trigger": {
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" },
    "trigger_type": { "type": "string", "nullable": true },
    "trigger_desc": { "type": "string", "nullable": true },
    "trigger_status": { "type": "string", "nullable": true },
    "trigger_meta": { "type": "object", "additionalProperties": true },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["id", "name", "trigger_meta", "created_at", "updated_at"]
},
"AlertConfig": {
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "monitor_tags": { "type": "array", "items": { "type": "string" } },
    "alert_for": { "type": "string", "enum": ["STATUS", "LATENCY", "UPTIME"] },
    "alert_value": { "type": "string" },
    "failure_threshold": { "type": "integer" },
    "success_threshold": { "type": "integer" },
    "alert_description": { "type": "string", "nullable": true },
    "create_incident": { "type": "string", "enum": ["YES", "NO"] },
    "is_active": { "type": "string", "enum": ["YES", "NO"] },
    "severity": { "type": "string", "enum": ["CRITICAL", "WARNING"] },
    "trigger_ids": { "type": "array", "items": { "type": "integer" } },
    "triggers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "integer" },
          "name": { "type": "string" },
          "trigger_type": { "type": "string", "nullable": true }
        }
      }
    },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["id", "monitor_tags", "alert_for", "alert_value", "failure_threshold", "success_threshold", "create_incident", "is_active", "severity", "trigger_ids", "triggers", "created_at", "updated_at"]
},
"ImageMeta": {
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "mime_type": { "type": "string" },
    "original_name": { "type": "string", "nullable": true },
    "width": { "type": "integer", "nullable": true },
    "height": { "type": "integer", "nullable": true },
    "size": { "type": "integer", "nullable": true },
    "created_at": { "type": "string", "format": "date-time" }
  },
  "required": ["id", "mime_type", "created_at"]
}
```

- [ ] **Step 2: Add trigger paths to `paths`**

Add these path entries to the `paths` object:

```json
"/api/v4/triggers": {
  "get": {
    "tags": ["Triggers"],
    "summary": "List all triggers",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "200": {
        "description": "List of triggers",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "triggers": { "type": "array", "items": { "$ref": "#/components/schemas/Trigger" } }
              }
            }
          }
        }
      }
    }
  },
  "post": {
    "tags": ["Triggers"],
    "summary": "Create a trigger",
    "security": [{ "BearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["name", "trigger_type"],
            "properties": {
              "name": { "type": "string" },
              "trigger_type": { "type": "string" },
              "trigger_desc": { "type": "string", "nullable": true },
              "trigger_status": { "type": "string", "nullable": true },
              "trigger_meta": { "type": "object", "additionalProperties": true }
            }
          }
        }
      }
    },
    "responses": {
      "201": {
        "description": "Trigger created",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "trigger": { "$ref": "#/components/schemas/Trigger" } }
            }
          }
        }
      },
      "400": { "description": "Validation error" }
    }
  }
},
"/api/v4/triggers/{id}": {
  "parameters": [
    { "name": "id", "in": "path", "required": true, "schema": { "type": "integer" } }
  ],
  "get": {
    "tags": ["Triggers"],
    "summary": "Get a trigger",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "200": {
        "description": "Trigger",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "trigger": { "$ref": "#/components/schemas/Trigger" } }
            }
          }
        }
      },
      "404": { "description": "Not found" }
    }
  },
  "patch": {
    "tags": ["Triggers"],
    "summary": "Update a trigger",
    "security": [{ "BearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "trigger_type": { "type": "string" },
              "trigger_desc": { "type": "string", "nullable": true },
              "trigger_status": { "type": "string", "nullable": true },
              "trigger_meta": { "type": "object", "additionalProperties": true }
            }
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Updated trigger",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "trigger": { "$ref": "#/components/schemas/Trigger" } }
            }
          }
        }
      }
    }
  },
  "delete": {
    "tags": ["Triggers"],
    "summary": "Delete a trigger",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "204": { "description": "Deleted" },
      "404": { "description": "Not found" }
    }
  }
}
```

- [ ] **Step 3: Add alert config paths to `paths`**

```json
"/api/v4/monitors/{monitor_tag}/alert-configs": {
  "parameters": [
    { "name": "monitor_tag", "in": "path", "required": true, "schema": { "type": "string" } }
  ],
  "get": {
    "tags": ["Alert Configs"],
    "summary": "List alert configs for a monitor",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "200": {
        "description": "List of alert configs",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "alert_configs": { "type": "array", "items": { "$ref": "#/components/schemas/AlertConfig" } }
              }
            }
          }
        }
      }
    }
  },
  "post": {
    "tags": ["Alert Configs"],
    "summary": "Create an alert config for a monitor",
    "security": [{ "BearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["alert_for", "alert_value", "failure_threshold", "success_threshold"],
            "properties": {
              "alert_for": { "type": "string", "enum": ["STATUS", "LATENCY", "UPTIME"] },
              "alert_value": { "type": "string", "description": "For STATUS: DOWN/DEGRADED/UP. For LATENCY: milliseconds as string. For UPTIME: percentage as string." },
              "failure_threshold": { "type": "integer", "description": "Number of consecutive failures before alerting" },
              "success_threshold": { "type": "integer", "description": "Number of consecutive successes before resolving" },
              "alert_description": { "type": "string", "nullable": true },
              "create_incident": { "type": "string", "enum": ["YES", "NO"] },
              "is_active": { "type": "string", "enum": ["YES", "NO"] },
              "severity": { "type": "string", "enum": ["CRITICAL", "WARNING"] },
              "trigger_ids": { "type": "array", "items": { "type": "integer" }, "description": "IDs of triggers to attach" }
            }
          }
        }
      }
    },
    "responses": {
      "201": {
        "description": "Alert config created",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "alert_config": { "$ref": "#/components/schemas/AlertConfig" } }
            }
          }
        }
      },
      "400": { "description": "Validation error" }
    }
  }
},
"/api/v4/monitors/{monitor_tag}/alert-configs/{id}": {
  "parameters": [
    { "name": "monitor_tag", "in": "path", "required": true, "schema": { "type": "string" } },
    { "name": "id", "in": "path", "required": true, "schema": { "type": "integer" } }
  ],
  "get": {
    "tags": ["Alert Configs"],
    "summary": "Get an alert config",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "200": {
        "description": "Alert config",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "alert_config": { "$ref": "#/components/schemas/AlertConfig" } }
            }
          }
        }
      },
      "404": { "description": "Not found" }
    }
  },
  "patch": {
    "tags": ["Alert Configs"],
    "summary": "Update an alert config",
    "security": [{ "BearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "alert_for": { "type": "string", "enum": ["STATUS", "LATENCY", "UPTIME"] },
              "alert_value": { "type": "string" },
              "failure_threshold": { "type": "integer" },
              "success_threshold": { "type": "integer" },
              "alert_description": { "type": "string", "nullable": true },
              "create_incident": { "type": "string", "enum": ["YES", "NO"] },
              "is_active": { "type": "string", "enum": ["YES", "NO"] },
              "severity": { "type": "string", "enum": ["CRITICAL", "WARNING"] },
              "trigger_ids": { "type": "array", "items": { "type": "integer" } }
            }
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Updated alert config",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "alert_config": { "$ref": "#/components/schemas/AlertConfig" } }
            }
          }
        }
      }
    }
  },
  "delete": {
    "tags": ["Alert Configs"],
    "summary": "Delete an alert config",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "204": { "description": "Deleted" },
      "404": { "description": "Not found" }
    }
  }
}
```

- [ ] **Step 4: Add image paths to `paths`**

```json
"/api/v4/images": {
  "get": {
    "tags": ["Images"],
    "summary": "List all images",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "200": {
        "description": "List of images (metadata only, no binary data)",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "images": { "type": "array", "items": { "$ref": "#/components/schemas/ImageMeta" } }
              }
            }
          }
        }
      }
    }
  },
  "post": {
    "tags": ["Images"],
    "summary": "Upload an image or font",
    "security": [{ "BearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": {
        "multipart/form-data": {
          "schema": {
            "type": "object",
            "required": ["file"],
            "properties": {
              "file": {
                "type": "string",
                "format": "binary",
                "description": "Supported types: PNG, JPEG, WebP, HEIC, SVG, TTF, OTF, WOFF, WOFF2. Max 5MB."
              }
            }
          }
        }
      }
    },
    "responses": {
      "201": {
        "description": "Image uploaded",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "image": { "$ref": "#/components/schemas/ImageMeta" } }
            }
          }
        }
      },
      "400": { "description": "Invalid file type, file too large, or missing file" }
    }
  }
},
"/api/v4/images/{id}": {
  "parameters": [
    { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Image ID (e.g. abc123.png)" }
  ],
  "get": {
    "tags": ["Images"],
    "summary": "Get image metadata",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "200": {
        "description": "Image metadata",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "image": { "$ref": "#/components/schemas/ImageMeta" } }
            }
          }
        }
      },
      "404": { "description": "Not found" }
    }
  },
  "delete": {
    "tags": ["Images"],
    "summary": "Delete an image",
    "security": [{ "BearerAuth": [] }],
    "responses": {
      "204": { "description": "Deleted" },
      "404": { "description": "Not found" }
    }
  }
}
```

- [ ] **Step 5: Add export/import paths to `paths`**

```json
"/api/v4/export": {
  "get": {
    "tags": ["Export / Import"],
    "summary": "Export system data as JSON",
    "description": "Returns a full export payload. Use the same payload with POST /api/v4/import to restore on another instance.",
    "security": [{ "BearerAuth": [] }],
    "parameters": [
      {
        "name": "scope",
        "in": "query",
        "required": false,
        "schema": { "type": "string", "enum": ["config", "users_groups_roles", "everything"], "default": "everything" },
        "description": "What to export. 'config' exports monitors, pages, triggers, site settings, images. 'users_groups_roles' exports users, groups, roles. 'everything' exports both."
      }
    ],
    "responses": {
      "200": {
        "description": "Export payload",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "exported_at": { "type": "string", "format": "date-time" },
                "scope": { "type": "string" },
                "version": { "type": "integer" },
                "config": { "type": "object" },
                "users_groups_roles": { "type": "object" }
              }
            }
          }
        }
      },
      "400": { "description": "Invalid scope" }
    }
  }
},
"/api/v4/import": {
  "post": {
    "tags": ["Export / Import"],
    "summary": "Import system data from an export payload",
    "description": "Accepts the JSON payload produced by GET /api/v4/export. Existing records are updated; new records are created. Passwords are not imported — imported users must reset their password.",
    "security": [{ "BearerAuth": [] }],
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["version", "scope"],
            "description": "The export payload produced by GET /api/v4/export"
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Import result with counts",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "imported": {
                  "type": "object",
                  "properties": {
                    "site_data": { "type": "integer" },
                    "monitors": { "type": "integer" },
                    "pages": { "type": "integer" },
                    "triggers": { "type": "integer" },
                    "images": { "type": "integer" },
                    "auth_config": { "type": "integer" },
                    "users": { "type": "integer" },
                    "roles": { "type": "integer" },
                    "groups": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      },
      "400": { "description": "Invalid or malformed payload" }
    }
  }
}
```

- [ ] **Step 6: Validate the JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('static/api-references/v4.json','utf8')); console.log('JSON valid')"
```

Expected: `JSON valid`

- [ ] **Step 7: Verify the spec renders in the API docs UI**

Open `http://localhost:5173/manage/app/api-docs` in a browser. Confirm the new sections (Triggers, Alert Configs, Images, Export / Import) appear in the sidebar.

- [ ] **Step 8: Commit**

```bash
git add static/api-references/v4.json
git commit -m "docs(api): add OpenAPI spec entries for triggers, alert-configs, images, export/import"
```

---

## Self-Review Checklist

After all tasks are done, verify:

- [ ] `npm run check` shows no new TypeScript errors
- [ ] All 16 new endpoints return correctly shaped JSON
- [ ] Triggers: list, create, get by id, patch, delete all work; 404 for unknown id
- [ ] Alert configs: list, create under monitor, get, patch, delete; 404 for unknown id or wrong monitor
- [ ] Images: list (no binary data), upload PNG/JPEG/font, get metadata, delete; 404 for unknown id
- [ ] Export: `scope=config`, `scope=users_groups_roles`, `scope=everything`, 400 for bad scope
- [ ] Import: round-trip from export works; 400 for bad payload
- [ ] OpenAPI spec JSON is valid; all new paths show in the UI at `/manage/app/api-docs`
- [ ] No regressions in existing endpoints (monitors, incidents, maintenances, pages, site)
