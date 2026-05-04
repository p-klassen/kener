import { BaseRepository } from "./base.js";
import type { RolePageRecord, RoleMonitorRecord, EffectiveAccessEntry } from "../../types/db.js";

export class ResourceAccessRepository extends BaseRepository {
  // ============ roles_pages ============

  async getRolePages(roleId: string): Promise<RolePageRecord[]> {
    return this.knex("roles_pages").where("roles_id", roleId).select("*");
  }

  async setRolePages(
    roleId: string,
    assignments: Array<{ pages_id: number; inherit_monitors: boolean }>,
  ): Promise<void> {
    await this.knex.transaction(async (trx) => {
      await trx("roles_pages").where("roles_id", roleId).delete();
      if (assignments.length === 0) return;
      await trx("roles_pages").insert(
        assignments.map((a) => ({
          roles_id: roleId,
          pages_id: a.pages_id,
          inherit_monitors: a.inherit_monitors ? 1 : 0,
          created_at: this.knex.fn.now(),
          updated_at: this.knex.fn.now(),
        })),
      );
    });
  }

  // ============ roles_monitors ============

  async getRoleMonitors(roleId: string): Promise<RoleMonitorRecord[]> {
    return this.knex("roles_monitors").where("roles_id", roleId).select("*");
  }

  async setRoleMonitors(roleId: string, monitorTags: string[]): Promise<void> {
    await this.knex.transaction(async (trx) => {
      await trx("roles_monitors").where("roles_id", roleId).delete();
      if (monitorTags.length === 0) return;
      await trx("roles_monitors").insert(
        monitorTags.map((tag) => ({
          roles_id: roleId,
          monitor_tag: tag,
          created_at: this.knex.fn.now(),
          updated_at: this.knex.fn.now(),
        })),
      );
    });
  }

  async deleteRolesMonitorsByTag(monitorTag: string): Promise<void> {
    await this.knex("roles_monitors").where("monitor_tag", monitorTag).delete();
  }

  // ============ Effective access for a user ============

  async getEffectiveAccess(userId: number): Promise<EffectiveAccessEntry[]> {
    const entries: EffectiveAccessEntry[] = [];

    // 1. Direct role assignments
    const directRoleRows: Array<{ role_id: string; role_name: string }> = await this.knex("users_roles")
      .join("roles", "users_roles.roles_id", "roles.id")
      .where("users_roles.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select("roles.id as role_id", "roles.role_name");

    // 2. Group-based role assignments
    const groupRoleRows: Array<{
      group_id: number;
      group_name: string;
      role_id: string;
      role_name: string;
    }> = await this.knex("users_groups")
      .join("groups", "users_groups.groups_id", "groups.id")
      .join("groups_roles", "groups.id", "groups_roles.groups_id")
      .join("roles", "groups_roles.roles_id", "roles.id")
      .where("users_groups.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select(
        "groups.id as group_id",
        "groups.name as group_name",
        "roles.id as role_id",
        "roles.role_name",
      );

    const buildEntry = async (
      source: "direct" | "group",
      role_id: string,
      role_name: string,
      group_name?: string,
    ): Promise<EffectiveAccessEntry> => {
      const rolePages = await this.knex("roles_pages")
        .join("pages", "roles_pages.pages_id", "pages.id")
        .where("roles_pages.roles_id", role_id)
        .select(
          "pages.id as page_id",
          "pages.page_title",
          "pages.page_path",
          "roles_pages.inherit_monitors",
        );

      const pagesWithMonitors = await Promise.all(
        rolePages.map(async (rp) => {
          let monitors: Array<{ monitor_tag: string; monitor_name: string }> = [];
          if (rp.inherit_monitors) {
            const pm = await this.knex("pages_monitors")
              .join("monitors", "pages_monitors.monitor_tag", "monitors.tag")
              .where("pages_monitors.page_id", rp.page_id)
              .select("monitors.tag as monitor_tag", "monitors.name as monitor_name");
            monitors = pm;
          }
          return {
            page_id: rp.page_id as number,
            page_title: rp.page_title as string,
            page_path: rp.page_path as string,
            inherit_monitors: Boolean(rp.inherit_monitors),
            monitors,
          };
        }),
      );

      const directMonitors = await this.knex("roles_monitors")
        .join("monitors", "roles_monitors.monitor_tag", "monitors.tag")
        .where("roles_monitors.roles_id", role_id)
        .select("monitors.tag as monitor_tag", "monitors.name as monitor_name");

      return {
        source,
        group_name,
        role_id,
        role_name,
        pages: pagesWithMonitors,
        direct_monitors: directMonitors,
      };
    };

    const directEntries = await Promise.all(
      directRoleRows.map((r) => buildEntry("direct", r.role_id, r.role_name)),
    );
    const groupEntries = await Promise.all(
      groupRoleRows.map((r) => buildEntry("group", r.role_id, r.role_name, r.group_name)),
    );
    return [...directEntries, ...groupEntries];
  }

  // ============ Access check — returns accessible page IDs and monitor tags ============

  async getAccessibleResources(userId: number): Promise<{
    pageIds: Set<number>;
    monitorTags: Set<string>;
  }> {
    const pageIds = new Set<number>();
    const monitorTags = new Set<string>();

    // All effective role IDs (direct + via groups)
    const directRoleIds: Array<{ roles_id: string }> = await this.knex("users_roles")
      .join("roles", "users_roles.roles_id", "roles.id")
      .where("users_roles.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select("users_roles.roles_id");

    const groupRoleIds: Array<{ roles_id: string }> = await this.knex("users_groups")
      .join("groups_roles", "users_groups.groups_id", "groups_roles.groups_id")
      .join("roles", "groups_roles.roles_id", "roles.id")
      .where("users_groups.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select("groups_roles.roles_id");

    const allRoleIds = [
      ...new Set([...directRoleIds.map((r) => r.roles_id), ...groupRoleIds.map((r) => r.roles_id)]),
    ];

    if (allRoleIds.length === 0) return { pageIds, monitorTags };

    // Pages via roles_pages
    const rolePageRows: Array<{ pages_id: number; inherit_monitors: number }> = await this.knex("roles_pages")
      .whereIn("roles_id", allRoleIds)
      .select("pages_id", "inherit_monitors");

    for (const rp of rolePageRows) {
      pageIds.add(rp.pages_id);
    }

    const inheritPageIds = rolePageRows
      .filter((rp) => rp.inherit_monitors)
      .map((rp) => rp.pages_id);

    if (inheritPageIds.length > 0) {
      const pm: Array<{ monitor_tag: string }> = await this.knex("pages_monitors")
        .whereIn("page_id", inheritPageIds)
        .select("monitor_tag");
      pm.forEach((r) => monitorTags.add(r.monitor_tag));
    }

    // Direct monitors via roles_monitors
    const directMonRows: Array<{ monitor_tag: string }> = await this.knex("roles_monitors")
      .whereIn("roles_id", allRoleIds)
      .select("monitor_tag");
    directMonRows.forEach((r) => monitorTags.add(r.monitor_tag));

    return { pageIds, monitorTags };
  }
}
