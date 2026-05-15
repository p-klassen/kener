import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import type { TriggerRecord } from "$lib/server/types/db";
import type {
  GetTriggerResponse,
  UpdateTriggerRequest,
  UpdateTriggerResponse,
  BadRequestResponse,
} from "$lib/types/api";

function formatDateToISO(date: Date | string): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  // Handle string dates (e.g., from SQLite: "2026-01-27 16:07:19")
  const parsed = new Date(date.replace(" ", "T") + "Z");
  return parsed.toISOString();
}

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
    created_at: formatDateToISO(t.created_at),
    updated_at: formatDateToISO(t.updated_at),
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  // Trigger is validated by middleware and available in locals
  const response: GetTriggerResponse = { trigger: formatTrigger(locals.trigger!) };
  return json(response);
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  // Trigger is validated by middleware and available in locals
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
