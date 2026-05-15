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
    return json(
      { error: { code: "BAD_REQUEST", message: "name is required and must be a non-empty string" } },
      { status: 400 },
    );
  }
  if (!body.trigger_type || typeof body.trigger_type !== "string" || body.trigger_type.trim().length === 0) {
    return json({ error: { code: "BAD_REQUEST", message: "trigger_type is required" } }, { status: 400 });
  }

  // Check for duplicate name
  const existing = await db.getTriggers({});
  if (existing.some((t) => t.name === body.name.trim())) {
    return json(
      { error: { code: "BAD_REQUEST", message: `Trigger with name '${body.name}' already exists` } },
      { status: 400 },
    );
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
