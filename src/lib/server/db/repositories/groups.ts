import { BaseRepository, type CountResult } from "./base.js";
import type { GroupRecord, GroupRecordInsert, UserRecordPublic, RoleRecord } from "../../types/db.js";
import { GetDbType } from "../../tool.js";

/**
 * Repository for groups, group members, and group roles operations
 */
export class GroupsRepository extends BaseRepository {
  // ============ Groups ============

  async getAllGroups(): Promise<GroupRecord[]> {
    return this.knex("groups").select("*").orderBy("name", "asc");
  }

  async getGroupById(id: number): Promise<GroupRecord | undefined> {
    return this.knex("groups").where("id", id).first();
  }

  async createGroup(data: GroupRecordInsert): Promise<GroupRecord> {
    const dbType = GetDbType();

    const insertData = {
      name: data.name,
      description: data.description ?? null,
      created_at: this.knex.fn.now(),
      updated_at: this.knex.fn.now(),
    };

    let groupId: number;
    if (dbType === "postgresql") {
      const [row] = await this.knex("groups").insert(insertData).returning("id");
      groupId = typeof row === "object" ? (row as { id: number }).id : (row as number);
    } else {
      const result = await this.knex("groups").insert(insertData);
      groupId = result[0];
    }

    return this.knex("groups").where("id", groupId).first() as Promise<GroupRecord>;
  }

  async updateGroup(id: number, data: Partial<GroupRecordInsert>): Promise<number> {
    return this.knex("groups")
      .where("id", id)
      .update({ ...data, updated_at: this.knex.fn.now() });
  }

  async deleteGroup(id: number): Promise<number> {
    return this.knex("groups").where("id", id).delete();
  }

  async getGroupsCount(): Promise<number> {
    const result = await this.knex("groups").count("* as count").first<CountResult>();
    return Number(result?.count ?? 0);
  }

  // ============ Group Members (users_groups) ============

  async getGroupMembers(groupId: number): Promise<UserRecordPublic[]> {
    return this.knex("users_groups")
      .join("users", "users_groups.users_id", "users.id")
      .where("users_groups.groups_id", groupId)
      .select(
        "users.id",
        "users.email",
        "users.name",
        "users.is_active",
        "users.is_verified",
        "users.is_owner",
        "users.created_at",
        "users.updated_at",
      )
      .then((rows) => rows.map((r) => ({ ...r, role_ids: [] }) as UserRecordPublic));
  }

  async addGroupMember(groupId: number, userId: number): Promise<void> {
    const exists = await this.knex("users_groups")
      .where({ groups_id: groupId, users_id: userId })
      .first();
    if (!exists) {
      await this.knex("users_groups").insert({
        groups_id: groupId,
        users_id: userId,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      });
    }
  }

  async removeGroupMember(groupId: number, userId: number): Promise<number> {
    return this.knex("users_groups")
      .where({ groups_id: groupId, users_id: userId })
      .delete();
  }

  async getMemberCount(groupId: number): Promise<number> {
    const result = await this.knex("users_groups")
      .where("groups_id", groupId)
      .count("* as count")
      .first<CountResult>();
    return Number(result?.count ?? 0);
  }

  // ============ Group Roles (groups_roles) ============

  async getGroupRoles(groupId: number): Promise<RoleRecord[]> {
    return this.knex("groups_roles")
      .join("roles", "groups_roles.roles_id", "roles.id")
      .where("groups_roles.groups_id", groupId)
      .select("roles.*");
  }

  async addGroupRole(groupId: number, roleId: string): Promise<void> {
    const exists = await this.knex("groups_roles")
      .where({ groups_id: groupId, roles_id: roleId })
      .first();
    if (!exists) {
      await this.knex("groups_roles").insert({
        groups_id: groupId,
        roles_id: roleId,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      });
    }
  }

  async removeGroupRole(groupId: number, roleId: string): Promise<number> {
    return this.knex("groups_roles")
      .where({ groups_id: groupId, roles_id: roleId })
      .delete();
  }

  async getRoleCount(groupId: number): Promise<number> {
    const result = await this.knex("groups_roles")
      .where("groups_id", groupId)
      .count("* as count")
      .first<CountResult>();
    return Number(result?.count ?? 0);
  }

  // ============ Lookup: which groups does a user belong to? ============

  async getGroupsForUser(userId: number): Promise<GroupRecord[]> {
    return this.knex("users_groups")
      .join("groups", "users_groups.groups_id", "groups.id")
      .where("users_groups.users_id", userId)
      .select("groups.*");
  }
}
