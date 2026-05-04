import db from "../db/db.js";

export async function GetRolePages(roleId: string) {
  return db.getRolePages(roleId);
}

export async function SetRolePages(
  roleId: string,
  assignments: Array<{ pages_id: number; inherit_monitors: boolean }>,
) {
  await db.setRolePages(roleId, assignments);
}

export async function GetRoleMonitors(roleId: string) {
  return db.getRoleMonitors(roleId);
}

export async function SetRoleMonitors(roleId: string, monitorTags: string[]) {
  await db.setRoleMonitors(roleId, monitorTags);
}

export async function GetUserEffectiveAccess(userId: number) {
  return db.getEffectiveAccess(userId);
}
