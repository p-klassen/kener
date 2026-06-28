import db from "../db/db.js";
import type {
  SiteData,
  SubscriberUserStatus,
  SubscriptionMethodType,
  SubscriptionEventType,
  SubscriptionStatus,
} from "../types/db.js";
import { GetOidcConfig, GetLdapConfig, SaveOidcConfig, SaveLdapConfig } from "./authConfigController.js";
import type { OidcConfig, LdapConfig } from "./authConfigController.js";

export type ExportScope = "config" | "users_groups_roles" | "everything";
export const VALID_EXPORT_SCOPES: ExportScope[] = ["config", "users_groups_roles", "everything"];

// "everything" scope label: exports configuration only (monitors, pages, triggers, images,
// site data, auth config, users, groups, roles, subscribers).
// NOTE: incidents, maintenances, and alert configs are NOT included.

type ExportedImage = {
  id: string;
  data: string; // base64
  mime_type: string;
  original_name: string | null;
  width: number | null;
  height: number | null;
  size: number | null;
};

type ExportedPageMonitor = {
  monitor_tag: string;
  monitor_settings_json: string | null;
  position: number;
};

type ExportedMonitor = {
  tag: string;
  name: string;
  description: string | null;
  image: string | null;
  cron: string | null;
  default_status: string;
  status: string | null;
  category_name: string | null;
  monitor_type: string;
  type_data?: string | null;
  day_degraded_minimum_count?: number | null;
  day_down_minimum_count?: number | null;
  include_degraded_in_downtime?: string;
  is_hidden: string;
  monitor_settings_json: string | null;
  external_url?: string | null;
};

interface ExportedPage {
  page_path: string;
  page_title: string;
  page_header: string;
  page_subheader: string | null;
  page_logo: string | null;
  page_settings_json: string | null;
  is_public: number;
  visibility_mode: "hidden" | "teaser" | "locked";
  monitors: ExportedPageMonitor[];
}

interface ExportedTrigger {
  name: string;
  trigger_type: string | null;
  trigger_desc: string | null;
  trigger_status: string | null;
  trigger_meta: string;
}

interface ExportedUser {
  email: string;
  name: string;
  is_active: number;
  is_verified: number;
  is_owner: string;
  role_names: string[];
}

interface ExportedSubscriberSubscription {
  event_type: string;
  status: string;
  monitor_scopes: string[];
  page_scopes: string[];
}

interface ExportedSubscriberMethod {
  method_type: string;
  method_value: string;
  status: string;
  subscriptions: ExportedSubscriberSubscription[];
}

interface ExportedSubscriber {
  email: string;
  status: string;
  methods: ExportedSubscriberMethod[];
}

interface ExportedGroup {
  name: string;
  description: string | null;
  member_emails: string[];
  role_names: string[];
}

interface ExportedRole {
  id: string;
  role_name: string;
  readonly: number;
  status: string;
  permissions: string[];
}

export interface ExportPayload {
  exported_at: string;
  scope: ExportScope;
  version: number;
  config?: {
    site_data: SiteData[];
    monitors: ExportedMonitor[];
    pages: ExportedPage[];
    triggers: ExportedTrigger[];
    images: ExportedImage[];
    auth?: {
      oidc: Omit<OidcConfig, "client_secret">;
      ldap: Omit<LdapConfig, "bind_password">;
    };
  };
  users_groups_roles?: {
    users: ExportedUser[];
    groups: ExportedGroup[];
    roles: ExportedRole[];
    subscribers: ExportedSubscriber[];
  };
}

export async function exportData(scope: ExportScope): Promise<ExportPayload> {
  const payload: ExportPayload = {
    exported_at: new Date().toISOString(),
    scope,
    version: 1,
  };

  if (scope === "config" || scope === "everything") {
    // H-26: Guard against excessively large image exports before fetching binary data
    const imageSizeCheck = await db.knex("images").sum("size as total").first<{ total: number | null }>();
    if ((imageSizeCheck?.total ?? 0) > 50 * 1024 * 1024) {
      throw new Error("Image export exceeds 50MB limit. Export images separately.");
    }

    const [siteData, monitors, pages, triggers, images, oidcConfig, ldapConfig] = await Promise.all([
      db.getAllSiteData(),
      db.getMonitors({}),
      db.getAllPages(),
      db.getTriggers({}),
      db.getAllImagesWithData(),
      GetOidcConfig(),
      GetLdapConfig(),
    ]);

    const { client_secret: _cs, ...oidcSafe } = oidcConfig;
    const { bind_password: _bp, ...ldapSafe } = ldapConfig;

    const pagesWithMonitors: ExportedPage[] = await Promise.all(
      pages.map(async (p) => {
        const pageMonitors = await db.getPageMonitors(p.id);
        return {
          page_path: p.page_path,
          page_title: p.page_title,
          page_header: p.page_header,
          page_subheader: p.page_subheader,
          page_logo: p.page_logo,
          page_settings_json: p.page_settings_json,
          is_public: p.is_public,
          visibility_mode: p.visibility_mode,
          monitors: pageMonitors.map((m) => ({
            monitor_tag: m.monitor_tag,
            monitor_settings_json: m.monitor_settings_json,
            position: m.position,
          })),
        };
      }),
    );

    payload.config = {
      site_data: siteData,
      monitors: monitors.map((m) => ({
        tag: m.tag,
        name: m.name,
        description: m.description,
        image: m.image,
        cron: m.cron,
        default_status: m.default_status,
        status: m.status,
        category_name: m.category_name,
        monitor_type: m.monitor_type,
        type_data: m.type_data,
        day_degraded_minimum_count: m.day_degraded_minimum_count,
        day_down_minimum_count: m.day_down_minimum_count,
        include_degraded_in_downtime: m.include_degraded_in_downtime,
        is_hidden: m.is_hidden,
        monitor_settings_json: m.monitor_settings_json,
        external_url: m.external_url,
      })),
      pages: pagesWithMonitors,
      images: images.map((img) => ({
        id: img.id,
        data: img.data,
        mime_type: img.mime_type,
        original_name: img.original_name,
        width: img.width,
        height: img.height,
        size: img.size,
      })),
      triggers: triggers.map((t) => ({
        name: t.name,
        trigger_type: t.trigger_type,
        trigger_desc: t.trigger_desc,
        trigger_status: t.trigger_status,
        trigger_meta: t.trigger_meta,
      })),
      auth: { oidc: oidcSafe, ldap: ldapSafe },
    };
  }

  if (scope === "users_groups_roles" || scope === "everything") {
    // H-25: No cursor-based fetch exists; use paginated with a large limit.
    // TODO: replace with cursor-based fetch when subscriber count exceeds 100k
    const SUBSCRIBER_FETCH_LIMIT = 100000;
    const [users, groups, roles, allSubscriberUsers] = await Promise.all([
      db.getAllUsers(),
      db.getAllGroups(),
      db.getAllRoles(),
      db.getSubscriberUsersPaginated(1, SUBSCRIBER_FETCH_LIMIT),
    ]);
    if (allSubscriberUsers.length === SUBSCRIBER_FETCH_LIMIT) {
      console.warn(
        `[exportData] Subscriber export reached the fetch limit of ${SUBSCRIBER_FETCH_LIMIT}. Some subscribers may not be exported.`,
      );
    }

    const exportedGroups: ExportedGroup[] = await Promise.all(
      groups.map(async (g) => {
        const [members, groupRoles] = await Promise.all([
          db.getGroupMembers(g.id),
          db.getGroupRoles(g.id),
        ]);
        return {
          name: g.name,
          description: g.description,
          member_emails: members.map((m) => m.email),
          role_names: groupRoles.map((r) => r.role_name),
        };
      }),
    );

    const exportedRoles: ExportedRole[] = await Promise.all(
      roles.map(async (r) => {
        const perms = await db.getRolePermissions(r.id);
        return {
          id: r.id,
          role_name: r.role_name,
          readonly: r.readonly,
          status: r.status,
          permissions: perms.map((p) => p.permissions_id),
        };
      }),
    );

    const exportedSubscribers: ExportedSubscriber[] = await Promise.all(
      allSubscriberUsers.map(async (su) => {
        const methods = await db.getSubscriberMethodsByUserId(su.id);
        const exportedMethods: ExportedSubscriberMethod[] = await Promise.all(
          methods.map(async (m) => {
            const subs = await db.getUserSubscriptionsV2({ subscriber_method_id: m.id });
            const subscriptions: ExportedSubscriberSubscription[] = await Promise.all(
              subs.map(async (s) => {
                const scopes = await db.getSubscriptionScopes(s.id);
                return {
                  event_type: s.event_type,
                  status: s.status,
                  monitor_scopes: scopes.monitors,
                  page_scopes: scopes.pages,
                };
              }),
            );
            return {
              method_type: m.method_type,
              method_value: m.method_value,
              status: m.status,
              subscriptions,
            };
          }),
        );
        return {
          email: su.email,
          status: su.status,
          methods: exportedMethods,
        };
      }),
    );

    // H-15: Export direct role assignments per user so they can be re-applied on import
    const exportedUsers: ExportedUser[] = await Promise.all(
      users.map(async (u) => {
        const roleIds = await db.getUserRoleIds(u.id);
        const roleNames = roleIds
          .map((rid) => roles.find((r) => r.id === rid)?.role_name)
          .filter((name): name is string => name !== undefined);
        return {
          email: u.email,
          name: u.name,
          is_active: u.is_active,
          is_verified: u.is_verified,
          is_owner: u.is_owner,
          role_names: roleNames,
        };
      }),
    );

    payload.users_groups_roles = {
      users: exportedUsers,
      groups: exportedGroups,
      roles: exportedRoles,
      subscribers: exportedSubscribers,
    };
  }

  return payload;
}

export async function importData(payload: ExportPayload): Promise<{ imported: Record<string, number> }> {
  // M-25: Reject export files created by a newer version of this software
  const CURRENT_EXPORT_VERSION = 1;
  if (payload.version > CURRENT_EXPORT_VERSION) {
    throw new Error(
      `Export file version ${payload.version} is newer than supported version ${CURRENT_EXPORT_VERSION}`,
    );
  }

  const imported: Record<string, number> = {};

  if (payload.config) {
    // C-02: Wrap the entire config import in a transaction so it is atomic
    const configCounts = await db.knex.transaction(async (trx) => {
      const { site_data, monitors, pages, triggers } = payload.config!;
      const counts: Record<string, number> = {};

      for (const sd of site_data ?? []) {
        await trx("site_data")
          .insert({ key: sd.key, value: sd.value, data_type: sd.data_type })
          .onConflict("key")
          .merge(["value", "data_type"]);
      }
      counts.site_data = (site_data ?? []).length;

      let monitorsImported = 0;
      for (const m of monitors ?? []) {
        const existing = await trx("monitors").where("tag", m.tag).first();
        if (existing) {
          await trx("monitors").where("tag", m.tag).update({
            name: m.name,
            description: m.description,
            image: m.image,
            cron: m.cron,
            default_status: m.default_status,
            status: m.status,
            category_name: m.category_name,
            monitor_type: m.monitor_type,
            type_data: m.type_data,
            day_degraded_minimum_count: m.day_degraded_minimum_count,
            day_down_minimum_count: m.day_down_minimum_count,
            include_degraded_in_downtime: m.include_degraded_in_downtime,
            is_hidden: m.is_hidden,
            monitor_settings_json: m.monitor_settings_json,
            external_url: m.external_url ?? null,
            updated_at: trx.fn.now(),
          });
        } else {
          await trx("monitors").insert({
            tag: m.tag,
            name: m.name,
            description: m.description,
            image: m.image,
            cron: m.cron,
            default_status: m.default_status,
            status: m.status,
            category_name: m.category_name,
            monitor_type: m.monitor_type,
            type_data: m.type_data,
            day_degraded_minimum_count: m.day_degraded_minimum_count,
            day_down_minimum_count: m.day_down_minimum_count,
            include_degraded_in_downtime: m.include_degraded_in_downtime,
            is_hidden: m.is_hidden,
            monitor_settings_json: m.monitor_settings_json,
            external_url: m.external_url ?? null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        }
        monitorsImported++;
      }
      counts.monitors = monitorsImported;

      let pagesImported = 0;
      for (const p of pages ?? []) {
        const { monitors: pageMonitors, ...pageData } = p;
        const existing = await trx("pages").where("page_path", pageData.page_path).first();
        let pageId: number;
        if (existing) {
          await trx("pages").where("id", existing.id).update({ ...pageData, updated_at: trx.fn.now() });
          pageId = existing.id;
        } else {
          const [newId] = await trx("pages")
            .insert({ ...pageData, created_at: trx.fn.now(), updated_at: trx.fn.now() })
            .returning("id");
          pageId = typeof newId === "object" ? (newId as { id: number }).id : (newId as number);
        }
        // Fully sync monitor assignments: clear current, re-add from export
        await trx("pages_monitors").where("page_id", pageId).delete();
        for (const m of pageMonitors ?? []) {
          await trx("pages_monitors").insert({
            page_id: pageId,
            monitor_tag: m.monitor_tag,
            monitor_settings_json: m.monitor_settings_json ?? null,
            position: m.position,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
        }
        pagesImported++;
      }
      counts.pages = pagesImported;

      let triggersImported = 0;
      const allTriggers = await trx("triggers").select("*");
      for (const t of triggers ?? []) {
        const existing = allTriggers.find((tr: { name: string }) => tr.name === t.name);
        if (existing) {
          await trx("triggers").where("id", existing.id).update({ ...t, updated_at: trx.fn.now() });
        } else {
          await trx("triggers").insert({ ...t, created_at: trx.fn.now(), updated_at: trx.fn.now() });
        }
        triggersImported++;
      }
      counts.triggers = triggersImported;

      let imagesImported = 0;
      // L-16: Track images that were skipped because they already exist
      let imagesSkipped = 0;
      for (const img of payload.config!.images ?? []) {
        const existing = await trx("images").where("id", img.id).first();
        if (!existing) {
          await trx("images").insert({
            id: img.id,
            data: img.data,
            mime_type: img.mime_type,
            original_name: img.original_name ?? null,
            width: img.width ?? null,
            height: img.height ?? null,
            size: img.size ?? null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
          imagesImported++;
        } else {
          imagesSkipped++;
        }
      }
      counts.images = imagesImported;
      counts.images_skipped = imagesSkipped;

      return counts;
    });

    Object.assign(imported, configCounts);

    // Auth config is saved outside the transaction because it calls external controllers
    if (payload.config.auth) {
      const { oidc, ldap } = payload.config.auth;
      // L-15: Preserve existing auth secrets that are not included in the export.
      // The exported types intentionally omit client_secret and bind_password.
      // Read the current stored values and merge them back so they are not lost.
      if (oidc) {
        const existingOidc = await GetOidcConfig();
        await SaveOidcConfig({
          ...oidc,
          // Re-apply the stored secret so the import does not clear it
          client_secret: existingOidc.client_secret,
        });
      }
      if (ldap) {
        const existingLdap = await GetLdapConfig();
        await SaveLdapConfig({
          ...ldap,
          // Re-apply the stored password so the import does not clear it
          bind_password: existingLdap.bind_password,
        });
      }
      imported.auth_config = 1;
    }
  }

  if (payload.users_groups_roles) {
    // C-02: Wrap users/groups/roles import in a transaction
    const ugCounts = await db.knex.transaction(async (_trx) => {
      const { roles, groups, users } = payload.users_groups_roles!;
      const counts: Record<string, number> = {};

      // Import roles first so that user and group role assignments can reference them.
      // Only create new roles, never modify existing role permissions.
      // Syncing permissions for existing roles via any API key would allow privilege
      // escalation (a stolen key could grant itself admin rights). Existing roles are
      // intentionally left unchanged; use the manage UI for role permission edits.
      // External IDs are never adopted — a name-based lookup prevents ID collisions
      // that could cause privilege escalation against existing roles in the target DB.
      let rolesImported = 0;
      const allExistingRoles = await db.getAllRoles();
      for (const r of roles ?? []) {
        if (r.readonly) continue;
        const existingByName = allExistingRoles.find((er) => er.role_name === r.role_name);
        if (!existingByName) {
          const newId = crypto.randomUUID();
          await db.insertRole({ id: newId, role_name: r.role_name });
          for (const pid of r.permissions ?? []) {
            await db.addRolePermission(newId, pid);
          }
          rolesImported++;
        }
      }
      counts.roles = rolesImported;

      // Reload roles to include any newly created ones
      const allRoles = await db.getAllRoles();

      // Import users — created as inactive/unverified since passwords are not exported.
      // H-15: After inserting, assign direct role memberships from the export.
      let usersImported = 0;
      for (const u of users ?? []) {
        const existing = await db.getUserByEmail(u.email);
        let userId: number;
        if (!existing) {
          const [insertedId] = await db.insertUser({
            email: u.email,
            name: u.name,
            password_hash: "",
            role_ids: [],
            is_active: 0,
            is_verified: 0,
            is_owner: u.is_owner,
            must_change_password: 1,
          });
          userId = insertedId;
          usersImported++;
        } else {
          userId = existing.id;
        }
        // H-15: Assign direct role memberships by name lookup
        for (const roleName of u.role_names ?? []) {
          const role = allRoles.find((r) => r.role_name === roleName);
          if (role) await db.addUserToRole(role.id, userId);
        }
      }
      counts.users = usersImported;

      // Import groups — create new or sync roles and members for existing
      let groupsImported = 0;
      const allGroups = await db.getAllGroups();
      for (const g of groups ?? []) {
        const existing = allGroups.find((ex) => ex.name === g.name);
        let groupId: number;
        if (existing) {
          groupId = existing.id;
          // Sync role assignments: clear existing and re-add from export
          const existingRoles = await db.getGroupRoles(groupId);
          for (const gr of existingRoles) {
            await db.removeGroupRole(groupId, gr.id);
          }
        } else {
          const created = await db.createGroup({ name: g.name, description: g.description });
          groupId = created.id;
          groupsImported++;
        }
        for (const roleName of g.role_names ?? []) {
          const role = allRoles.find((r) => r.role_name === roleName);
          if (role) await db.addGroupRole(groupId, role.id);
        }
        // C-03: Re-import group member email assignments
        // Clear all existing members first, then re-add from the export
        const currentMembers = await db.getGroupMembers(groupId);
        for (const member of currentMembers) {
          await db.removeGroupMember(groupId, member.id);
        }
        for (const email of g.member_emails ?? []) {
          const user = await db.getUserByEmail(email);
          if (user) await db.addGroupMember(groupId, user.id);
        }
      }
      counts.groups = groupsImported;

      return counts;
    });

    Object.assign(imported, ugCounts);

    // Import subscribers — create new ones; skip if email already exists
    // (run outside the transaction because it involves many sub-queries per subscriber)
    let subscribersImported = 0;
    for (const sub of payload.users_groups_roles.subscribers ?? []) {
      let subscriberUser = await db.getSubscriberUserByEmail(sub.email);
      if (!subscriberUser) {
        subscriberUser = await db.createSubscriberUser({
          email: sub.email,
          status: (sub.status as SubscriberUserStatus) || "ACTIVE",
        });
        subscribersImported++;
      }

      for (const method of sub.methods ?? []) {
        const existingMethod = await db.getSubscriberMethodByUserAndType(
          subscriberUser.id,
          method.method_type as SubscriptionMethodType,
          method.method_value,
        );
        let methodRecord = existingMethod;
        if (!methodRecord) {
          methodRecord = await db.createSubscriberMethod({
            subscriber_user_id: subscriberUser.id,
            method_type: method.method_type as SubscriptionMethodType,
            method_value: method.method_value,
            status: (method.status as SubscriptionStatus) || "ACTIVE",
          });
        }

        for (const s of method.subscriptions ?? []) {
          const exists = await db.subscriptionV2Exists(
            subscriberUser.id,
            methodRecord.id,
            s.event_type as SubscriptionEventType,
          );
          if (!exists) {
            const created = await db.createUserSubscriptionV2({
              subscriber_user_id: subscriberUser.id,
              subscriber_method_id: methodRecord.id,
              event_type: s.event_type as SubscriptionEventType,
              status: (s.status as SubscriptionStatus) || "ACTIVE",
            });
            if (s.monitor_scopes.length > 0 || s.page_scopes.length > 0) {
              await db.upsertSubscriptionScopes(created.id, s.monitor_scopes, s.page_scopes);
            }
          }
        }
      }
    }
    imported.subscribers = subscribersImported;
  }

  return { imported };
}
