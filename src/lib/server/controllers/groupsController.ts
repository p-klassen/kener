import db from "../db/db.js";
import type { GroupRecordInsert } from "../types/db.js";

export async function GetAllGroups() {
  const groups = await db.getAllGroups();
  const withCounts = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      member_count: await db.getMemberCount(g.id),
      role_count: await db.getRoleCount(g.id),
    })),
  );
  return withCounts;
}

export async function GetGroupById(id: number) {
  return db.getGroupById(id);
}

export async function CreateGroup(data: GroupRecordInsert) {
  if (!data.name?.trim()) throw new Error("Group name is required");
  return db.createGroup(data);
}

export async function UpdateGroup(id: number, data: Partial<GroupRecordInsert>) {
  const updated = await db.updateGroup(id, data);
  if (updated === 0) throw new Error("Group not found");
  return db.getGroupById(id);
}

export async function DeleteGroup(id: number) {
  await db.deleteGroup(id);
}

export async function GetGroupMembers(groupId: number) {
  return db.getGroupMembers(groupId);
}

export async function AddGroupMember(groupId: number, userId: number) {
  await db.addGroupMember(groupId, userId);
}

export async function RemoveGroupMember(groupId: number, userId: number) {
  await db.removeGroupMember(groupId, userId);
}

export async function GetGroupRoles(groupId: number) {
  return db.getGroupRoles(groupId);
}

export async function AddGroupRole(groupId: number, roleId: string) {
  await db.addGroupRole(groupId, roleId);
}

export async function RemoveGroupRole(groupId: number, roleId: string) {
  await db.removeGroupRole(groupId, roleId);
}
