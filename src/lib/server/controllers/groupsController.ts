import db from "../db/db.js";
import type { GroupRecord, GroupRecordInsert, UserRecordPublic, RoleRecord } from "../types/db.js";

export async function GetAllGroups(): Promise<Array<GroupRecord & { member_count: number; role_count: number }>> {
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

export async function GetGroupById(id: number): Promise<GroupRecord | undefined> {
  return db.getGroupById(id);
}

export async function CreateGroup(data: GroupRecordInsert): Promise<GroupRecord> {
  if (!data.name?.trim()) throw new Error("Group name is required");
  return db.createGroup(data);
}

export async function UpdateGroup(id: number, data: Partial<GroupRecordInsert>): Promise<GroupRecord | undefined> {
  const updated = await db.updateGroup(id, data);
  if (updated === 0) throw new Error("Group not found");
  return db.getGroupById(id);
}

export async function DeleteGroup(id: number): Promise<void> {
  const deleted = await db.deleteGroup(id);
  if (deleted === 0) throw new Error("Group not found");
}

export async function GetGroupMembers(groupId: number): Promise<UserRecordPublic[]> {
  return db.getGroupMembers(groupId);
}

export async function AddGroupMember(groupId: number, userId: number): Promise<void> {
  await db.addGroupMember(groupId, userId);
}

export async function RemoveGroupMember(groupId: number, userId: number): Promise<void> {
  const deleted = await db.removeGroupMember(groupId, userId);
  if (deleted === 0) throw new Error("Member not found in group");
}

export async function GetGroupRoles(groupId: number): Promise<RoleRecord[]> {
  return db.getGroupRoles(groupId);
}

export async function AddGroupRole(groupId: number, roleId: string): Promise<void> {
  await db.addGroupRole(groupId, roleId);
}

export async function RemoveGroupRole(groupId: number, roleId: string): Promise<void> {
  const deleted = await db.removeGroupRole(groupId, roleId);
  if (deleted === 0) throw new Error("Role not found in group");
}
