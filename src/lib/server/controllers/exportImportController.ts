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
    const [users, groups, roles, allSubscriberUsers] = await Promise.all([
      db.getAllUsers(),
      db.getAllGroups(),
      db.getAllRoles(),
      db.getSubscriberUsersPaginated(1, 100000),
    ]);

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

    payload.users_groups_roles = {
      users: users.map((u) => ({
        email: u.email,
        name: u.name,
        is_active: u.is_active,
        is_verified: u.is_verified,
        is_owner: u.is_owner,
      })),
      groups: exportedGroups,
      roles: exportedRoles,
      subscribers: exportedSubscribers,
    };
  }

  return payload;
}

export async function importData(payload: ExportPayload): Promise<{ imported: Record<string, number> }> {
  const imported: Record<string, number> = {};

  if (payload.config) {
    const { site_data, monitors, pages, triggers } = payload.config;

    for (const sd of site_data ?? []) {
      await db.insertOrUpdateSiteData(sd.key, sd.value, sd.data_type);
    }
    imported.site_data = (site_data ?? []).length;

    let monitorsImported = 0;
    for (const m of monitors ?? []) {
      const existing = await db.getMonitorsByTag(m.tag);
      if (existing) {
        await db.updateMonitor({
          ...existing,
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
        });
      } else {
        await db.insertMonitor({
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
        });
      }
      monitorsImported++;
    }
    imported.monitors = monitorsImported;

    let pagesImported = 0;
    for (const p of pages ?? []) {
      const { monitors: pageMonitors, ...pageData } = p;
      const existing = await db.getPageByPath(pageData.page_path);
      let pageId: number;
      if (existing) {
        await db.updatePage(existing.id, pageData);
        pageId = existing.id;
      } else {
        const created = await db.createPage(pageData);
        pageId = created.id;
      }
      // Fully sync monitor assignments: clear current, re-add from export
      await db.deletePageMonitorsByPageId(pageId);
      for (const m of pageMonitors ?? []) {
        await db.addMonitorToPage({
          page_id: pageId,
          monitor_tag: m.monitor_tag,
          monitor_settings_json: m.monitor_settings_json ?? null,
          position: m.position,
        });
      }
      pagesImported++;
    }
    imported.pages = pagesImported;

    let triggersImported = 0;
    const allTriggers = await db.getTriggers({});
    for (const t of triggers ?? []) {
      const existing = allTriggers.find((tr) => tr.name === t.name);
      if (existing) {
        await db.updateTrigger({ ...existing, ...t });
      } else {
        await db.createNewTrigger(t);
      }
      triggersImported++;
    }
    imported.triggers = triggersImported;

    let imagesImported = 0;
    for (const img of payload.config.images ?? []) {
      const existing = await db.getImageById(img.id);
      if (!existing) {
        await db.insertImage({
          id: img.id,
          data: img.data,
          mime_type: img.mime_type,
          original_name: img.original_name ?? null,
          width: img.width ?? null,
          height: img.height ?? null,
          size: img.size ?? null,
        });
        imagesImported++;
      }
    }
    imported.images = imagesImported;

    if (payload.config.auth) {
      const { oidc, ldap } = payload.config.auth;
      if (oidc) await SaveOidcConfig(oidc);
      if (ldap) await SaveLdapConfig(ldap);
      imported.auth_config = 1;
    }
  }

  if (payload.users_groups_roles) {
    const { roles, groups, users } = payload.users_groups_roles;

    // Import users — created as inactive/unverified since passwords are not exported
    let usersImported = 0;
    for (const u of users ?? []) {
      const existing = await db.getUserByEmail(u.email);
      if (!existing) {
        await db.insertUser({
          email: u.email,
          name: u.name,
          password_hash: "",
          role_ids: [],
          is_active: 0,
          is_verified: 0,
          is_owner: u.is_owner,
          must_change_password: 1,
        });
        usersImported++;
      }
    }
    imported.users = usersImported;

    // Import roles — only create new roles, never modify existing role permissions.
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
    imported.roles = rolesImported;

    // Import groups — create new or sync roles for existing
    let groupsImported = 0;
    const allGroups = await db.getAllGroups();
    const allRoles = await db.getAllRoles();
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
    }
    imported.groups = groupsImported;

    // Import subscribers — create new ones; skip if email already exists
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
