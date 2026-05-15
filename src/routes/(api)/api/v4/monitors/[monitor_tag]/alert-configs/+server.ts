import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import { CreateMonitorAlertConfig } from "$lib/server/controllers/monitorAlertConfigController";
import type { MonitorAlertConfigWithTriggers } from "$lib/server/types/db";
import type {
  GetAlertConfigsListResponse,
  CreateAlertConfigRequest,
  CreateAlertConfigResponse,
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
  // Monitor is validated by middleware and available in locals
  const monitorTag = locals.monitor!.tag;
  const configs = await db.getMonitorAlertConfigsWithTriggersByMonitorTag(monitorTag);
  const response: GetAlertConfigsListResponse = { alert_configs: configs.map(formatAlertConfig) };
  return json(response);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  // Monitor is validated by middleware and available in locals
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
    return json(
      { error: { code: "BAD_REQUEST", message: `alert_for must be one of: ${validAlertFor.join(", ")}` } },
      { status: 400 },
    );
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
    const msg = e instanceof Error ? e.message : "Failed to create alert config";
    const isInternal = msg.startsWith("Failed to retrieve") || msg.startsWith("Failed to create");
    return json(
      { error: { code: isInternal ? "INTERNAL_ERROR" : "BAD_REQUEST", message: msg } },
      { status: isInternal ? 500 : 400 },
    );
  }
};
