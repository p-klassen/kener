import { json, type RequestHandler } from "@sveltejs/kit";
import { UpdateMonitorAlertConfig, DeleteMonitorAlertConfig } from "$lib/server/controllers/monitorAlertConfigController";
import type { MonitorAlertConfigWithTriggers } from "$lib/server/types/db";
import type {
  GetAlertConfigResponse,
  UpdateAlertConfigRequest,
  UpdateAlertConfigResponse,
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
    created_at: formatDateToISO(c.created_at),
    updated_at: formatDateToISO(c.updated_at),
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  // Alert config is validated by middleware and available in locals
  const response: GetAlertConfigResponse = { alert_config: formatAlertConfig(locals.alertConfig!) };
  return json(response);
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  // Alert config is validated by middleware and available in locals
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
    return json(
      { error: { code: "BAD_REQUEST", message: `alert_for must be one of: ${validAlertFor.join(", ")}` } },
      { status: 400 },
    );
  }

  // If alert_for is changing without alert_value, validate the existing value is still compatible
  if (body.alert_for !== undefined && body.alert_value === undefined) {
    const existingValue = existing.alert_value;
    const newAlertFor = body.alert_for;
    // STATUS expects a status string; LATENCY/UPTIME expect numeric strings
    if (newAlertFor === "STATUS" && !["UP", "DOWN", "DEGRADED"].includes(existingValue)) {
      return json(
        { error: { code: "BAD_REQUEST", message: `Existing alert_value '${existingValue}' is not valid for alert_for 'STATUS'. Provide a new alert_value (UP, DOWN, or DEGRADED).` } },
        { status: 400 },
      );
    }
    if ((newAlertFor === "LATENCY" || newAlertFor === "UPTIME") && isNaN(Number(existingValue))) {
      return json(
        { error: { code: "BAD_REQUEST", message: `Existing alert_value '${existingValue}' is not valid for alert_for '${newAlertFor}'. Provide a new alert_value (a number).` } },
        { status: 400 },
      );
    }
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
    const msg = e instanceof Error ? e.message : "Failed to update alert config";
    const isInternal = msg.startsWith("Failed to retrieve") || msg.startsWith("Failed to update");
    return json(
      { error: { code: isInternal ? "INTERNAL_ERROR" : "BAD_REQUEST", message: msg } },
      { status: isInternal ? 500 : 400 },
    );
  }
};

export const DELETE: RequestHandler = async ({ locals }) => {
  // Alert config is validated by middleware and available in locals
  await DeleteMonitorAlertConfig(locals.alertConfig!.id);
  return new Response(null, { status: 204 });
};
