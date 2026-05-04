import db from "../db/db.js";
import type { RolePageRecord, RoleMonitorRecord, EffectiveAccessEntry } from "../types/db.js";

export async function GetRolePages(roleId: string): Promise<RolePageRecord[]> {
  return db.getRolePages(roleId);
}

export async function SetRolePages(
  roleId: string,
  assignments: Array<{ pages_id: number; inherit_monitors: boolean }>,
): Promise<void> {
  await db.setRolePages(roleId, assignments);
}

export async function GetRoleMonitors(roleId: string): Promise<RoleMonitorRecord[]> {
  return db.getRoleMonitors(roleId);
}

export async function SetRoleMonitors(roleId: string, monitorTags: string[]): Promise<void> {
  await db.setRoleMonitors(roleId, monitorTags);
}

export async function GetUserEffectiveAccess(userId: number): Promise<EffectiveAccessEntry[]> {
  return db.getEffectiveAccess(userId);
}
