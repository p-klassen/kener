# API v4 Extension — Triggers, Alert Configs, Images, Export/Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the public `/api/v4/` REST API to cover Triggers, Alert Configs, Images (full CRUD with upload), and Export/Import — all features currently only accessible through the internal admin panel.

**Architecture:** New route groups are added under `src/routes/(api)/api/v4/` following the exact same patterns as the existing monitors/incidents/pages routes. Authentication (Bearer token via `hooks.server.ts`), response format (`{ data }` or `{ error: { code, message } }`), and middleware pre-loading of resources into `event.locals` all stay identical. The OpenAPI spec at `static/api-references/v4.json` is updated to document every new endpoint.

**Tech Stack:** SvelteKit 2 / Svelte 5, TypeScript, Knex.js, existing controllers (`triggersController`, `alertConfigController`, `imageController`, `exportImportController`).

---

## Existing Patterns (reference)

All new endpoints follow these conventions:

- **Auth:** Bearer token checked globally in `hooks.server.ts`; no per-route auth code needed.
- **Pre-loading:** `hooks.server.ts` resolves URL params to DB records and stores them in `event.locals`. Returns 404 if not found.
- **Response format:** `{ data }` on success, `{ error: { code, message } }` on failure.
- **HTTP codes:** 200 (GET/PATCH), 201 (POST), 204 (DELETE), 400, 401, 404, 500.
- **JSON fields:** Stored as strings in DB, parsed on read, merged (not replaced) on PATCH.
- **File locations:** Routes at `src/routes/(api)/api/v4/<resource>/+server.ts`; hooks additions in `src/hooks.server.ts`.

---

## Section 1: Triggers

Triggers are standalone notification channels (webhook, email, Slack, etc.) that alert configs reference. `name` is the unique string identifier.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v4/triggers` | List all triggers |
| POST | `/api/v4/triggers` | Create a trigger |
| GET | `/api/v4/triggers/{name}` | Get a trigger |
| PATCH | `/api/v4/triggers/{name}` | Update a trigger |
| DELETE | `/api/v4/triggers/{name}` | Delete a trigger |

### Pre-loading (hooks.server.ts)

For routes matching `/api/v4/triggers/[name]`, resolve the trigger by name from DB and store in `event.locals.trigger`. Return 404 if not found.

### Request / Response Shapes

**POST /api/v4/triggers** body:
```json
{
  "name": "string (required, unique)",
  "trigger_type": "string (required) — e.g. webhook, email, slack",
  "trigger_desc": "string | null",
  "trigger_status": "string | null",
  "trigger_meta": "object (required) — channel-specific config"
}
```

**PATCH /api/v4/triggers/{name}** body: all fields optional except `name` (cannot change name).

**Response** (GET / POST 201 / PATCH):
```json
{
  "trigger": {
    "name": "string",
    "trigger_type": "string",
    "trigger_desc": "string | null",
    "trigger_status": "string | null",
    "trigger_meta": "object"
  }
}
```

**GET /api/v4/triggers** response:
```json
{ "triggers": [ ...trigger objects ] }
```

**DELETE** returns 204 No Content.

### Error Cases
- 400: missing required fields, duplicate name on POST
- 404: trigger not found (handled by hooks pre-load)

---

## Section 2: Alert Configs

Alert configs are per-monitor rules that fire a trigger when a monitor's status matches a condition. They nest under monitors (`/api/v4/monitors/{monitor_tag}/alert-configs`) because they are meaningless without a monitor. `{id}` is a numeric primary key.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v4/monitors/{monitor_tag}/alert-configs` | List alert configs for a monitor |
| POST | `/api/v4/monitors/{monitor_tag}/alert-configs` | Create alert config |
| GET | `/api/v4/monitors/{monitor_tag}/alert-configs/{id}` | Get one alert config |
| PATCH | `/api/v4/monitors/{monitor_tag}/alert-configs/{id}` | Update alert config |
| DELETE | `/api/v4/monitors/{monitor_tag}/alert-configs/{id}` | Delete alert config |

### Pre-loading (hooks.server.ts)

For routes matching `/api/v4/monitors/[monitor_tag]/alert-configs/[id]`, after the existing monitor pre-load, additionally resolve the alert config by `id`. Return 404 if not found or if it doesn't belong to the given monitor.

### Request / Response Shapes

**POST body:**
```json
{
  "trigger_name": "string (required) — references a trigger by name",
  "trigger_on_status": "string[] (required) — statuses that fire the trigger e.g. [\"DOWN\", \"DEGRADED\"]",
  "is_active": "boolean (default true)"
}
```

**PATCH body:** all fields optional.

**Response** (GET / POST 201 / PATCH):
```json
{
  "alert_config": {
    "id": "number",
    "monitor_tag": "string",
    "trigger_name": "string",
    "trigger_on_status": "string[]",
    "is_active": "boolean"
  }
}
```

**GET list** response: `{ "alert_configs": [ ...objects ] }`

**DELETE** returns 204 No Content.

### Error Cases
- 400: missing required fields, referenced trigger does not exist
- 404: monitor or alert config not found

---

## Section 3: Images

Images are stored as base64 in the `images` table. The upload endpoint accepts `multipart/form-data` with a single `file` field. Listing and get responses never include the binary `data` field (for performance).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v4/images` | List all images (metadata only) |
| POST | `/api/v4/images` | Upload an image (multipart/form-data) |
| GET | `/api/v4/images/{id}` | Get image metadata |
| DELETE | `/api/v4/images/{id}` | Delete image |

### Pre-loading (hooks.server.ts)

For routes matching `/api/v4/images/[id]`, resolve the image by ID and store in `event.locals.image`. Return 404 if not found.

### Request / Response Shapes

**POST /api/v4/images** — `Content-Type: multipart/form-data`:
- Field `file`: the image/font file

**Response** (GET / POST 201):
```json
{
  "image": {
    "id": "string",
    "mime_type": "string",
    "original_name": "string | null",
    "width": "number | null",
    "height": "number | null",
    "size": "number | null",
    "created_at": "string (ISO 8601)"
  }
}
```

**GET /api/v4/images** response: `{ "images": [ ...image metadata objects ] }`

**DELETE** returns 204 No Content.

### Error Cases
- 400: no file provided, unsupported MIME type, file too large
- 404: image not found (handled by hooks pre-load)

---

## Section 4: Export / Import

Export and Import reuse the existing `exportData()` and `importData()` functions from `exportImportController.ts`. No new controller logic needed.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v4/export` | Export data as JSON |
| POST | `/api/v4/import` | Import data from JSON body |

### Export

**Query param:** `scope` — one of `config`, `users_groups_roles`, `everything` (default: `everything`).

**Response 200:** The full `ExportPayload` object as JSON (same structure as UI export).

### Import

**Request body:** The full `ExportPayload` JSON (as exported by GET /api/v4/export).

**Response 200:**
```json
{
  "imported": {
    "site_data": "number",
    "monitors": "number",
    "pages": "number",
    "triggers": "number",
    "images": "number",
    "auth_config": "number",
    "users": "number",
    "roles": "number",
    "groups": "number"
  }
}
```

### Error Cases
- 400: invalid `scope` value, invalid/malformed import payload
- 500: partial import failure (returns how far it got)

---

## OpenAPI Spec Update

`static/api-references/v4.json` is updated with:

- New path entries for all 16 new endpoints
- New component schemas: `Trigger`, `AlertConfig`, `ImageMeta`, `ExportPayload`, `ImportResult`
- Parameter definitions for `{name}` (trigger), `{id}` (alert config, image)
- Request body schemas for POST/PATCH endpoints
- Response schemas for all endpoints

The spec update is the final task — done after all route implementations are verified working.

---

## File Structure

**New files:**
- `src/routes/(api)/api/v4/triggers/+server.ts`
- `src/routes/(api)/api/v4/triggers/[name]/+server.ts`
- `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/+server.ts`
- `src/routes/(api)/api/v4/monitors/[monitor_tag]/alert-configs/[id]/+server.ts`
- `src/routes/(api)/api/v4/images/+server.ts`
- `src/routes/(api)/api/v4/images/[id]/+server.ts`
- `src/routes/(api)/api/v4/export/+server.ts`
- `src/routes/(api)/api/v4/import/+server.ts`

**Modified files:**
- `src/hooks.server.ts` — add pre-loading for trigger, alert config, image
- `static/api-references/v4.json` — add all new endpoint docs and schemas
