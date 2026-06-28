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
import { Cron } from "croner";
import { migratePayload, CURRENT_EXPORT_VERSION } from "./exportMigrations.js";
import type { MigrationResult } from "./exportMigrations.js";
export type { MigrationChange, MigrationResult } from "./exportMigrations.js";

export type ExportScope = "config" | "users_groups_roles" | "everything";
export const VALID_EXPORT_SCOPES: ExportScope[] = ["config", "users_groups_roles", "everything"];

export type ImportProblem = {
  identifier: string;
  description: string;
  severity: "error" | "warning";
};

export type ImportEntityPreview = {
  key: string;
  label: string;
  total: number;
  new_count: number;
  overwrite_count: number;
  skip_count: number;
  can_toggle_overwrite: boolean;
  overwrite_default: boolean;
  problems: ImportProblem[];
};

export type ImportPreviewResult = {
  version_ok: boolean;
  scope: ExportScope;
  exported_at: string;
  entities: ImportEntityPreview[];
  has_errors: boolean;
  migration: MigrationResult;
};

export type ImportOptions = {
  overwrite_monitors: boolean;
  overwrite_pages: boolean;
  overwrite_triggers: boolean;
  overwrite_images: boolean;
  overwrite_site_data: boolean;
  overwrite_auth: boolean;
  overwrite_groups: boolean;
};

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

    // auth.oidc and auth.ldap are exported separately via config.auth with secrets stripped;
    // exclude them here to avoid leaking source-system credentials via the site_data array.
    const AUTH_SITE_DATA_KEYS = new Set(["auth.oidc", "auth.ldap"]);
    const sanitizedSiteData = siteData
      .filter((sd) => !AUTH_SITE_DATA_KEYS.has(sd.key))
      .map((sd) => {
        if (sd.key === "smtp" && sd.data_type === "object") {
          try {
            const parsed = JSON.parse(sd.value) as Record<string, unknown>;
            const { smtp_pass: _omit, ...rest } = parsed;
            return { ...sd, value: JSON.stringify(rest) };
          } catch {
            return sd;
          }
        }
        if (sd.key === "resend" && sd.data_type === "object") {
          try {
            const parsed = JSON.parse(sd.value) as Record<string, unknown>;
            const { resend_api_key: _omit, ...rest } = parsed;
            return { ...sd, value: JSON.stringify(rest) };
          } catch {
            return sd;
          }
        }
        return sd;
      });

    payload.config = {
      site_data: sanitizedSiteData,
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

export async function previewImport(rawPayload: ExportPayload): Promise<ImportPreviewResult> {
  // Apply schema migrations before analysis so all checks run against the current format
  const { payload, migration } = migratePayload(rawPayload);
  const version_ok = (rawPayload.version ?? 0) <= CURRENT_EXPORT_VERSION;
  const entities: ImportEntityPreview[] = [];

  if (payload.config) {
    const site_data = payload.config.site_data ?? [];
    const monitors = payload.config.monitors ?? [];
    const pages = payload.config.pages ?? [];
    const triggers = payload.config.triggers ?? [];
    const images = payload.config.images ?? [];

    const AUTH_SITE_DATA_SKIP = new Set(["auth.oidc", "auth.ldap"]);
    const visible_site_data = site_data.filter((sd) => !AUTH_SITE_DATA_SKIP.has(sd.key));
    if (visible_site_data.length > 0) {
      const existingKeys = await db
        .knex("site_data")
        .select("key")
        .then((rows: { key: string }[]) => new Set(rows.map((r) => r.key)));
      const overwrite_count = visible_site_data.filter((sd) => existingKeys.has(sd.key)).length;
      const problems: ImportProblem[] = [];
      const hasSmtp = visible_site_data.some((sd) => sd.key === "smtp");
      const hasResend = visible_site_data.some((sd) => sd.key === "resend");
      if (hasSmtp) {
        problems.push({
          identifier: "smtp",
          description: "SMTP password is not included in exports. It will be preserved if already configured, otherwise must be re-entered.",
          severity: "warning",
        });
      }
      if (hasResend) {
        problems.push({
          identifier: "resend",
          description: "Resend API key is not included in exports. It will be preserved if already configured, otherwise must be re-entered.",
          severity: "warning",
        });
      }
      entities.push({
        key: "site_data",
        label: "Site Settings",
        total: visible_site_data.length,
        new_count: visible_site_data.length - overwrite_count,
        overwrite_count,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: true,
        problems,
      });
    }

    if (monitors.length > 0) {
      const existingTags = await db
        .knex("monitors")
        .select("tag")
        .then((rows: { tag: string }[]) => new Set(rows.map((r) => r.tag)));
      const overwrite_count = monitors.filter((m) => existingTags.has(m.tag)).length;
      const problems: ImportProblem[] = [];
      for (const m of monitors) {
        if (m.cron) {
          try {
            new Cron(m.cron);
          } catch {
            problems.push({
              identifier: m.tag,
              description: `Invalid cron expression: "${m.cron}"`,
              severity: "warning",
            });
          }
        }
      }
      entities.push({
        key: "monitors",
        label: "Monitors",
        total: monitors.length,
        new_count: monitors.length - overwrite_count,
        overwrite_count,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: true,
        problems,
      });
    }

    if (pages.length > 0) {
      const existingPaths = await db
        .knex("pages")
        .select("page_path")
        .then((rows: { page_path: string }[]) => new Set(rows.map((r) => r.page_path)));
      const overwrite_count = pages.filter((p) => existingPaths.has(p.page_path)).length;
      const importedTags = new Set(monitors.map((m) => m.tag));
      const dbTags = await db
        .knex("monitors")
        .select("tag")
        .then((rows: { tag: string }[]) => new Set(rows.map((r) => r.tag)));
      const allAvailableTags = new Set([...importedTags, ...dbTags]);
      const problems: ImportProblem[] = [];
      for (const p of pages) {
        for (const pm of p.monitors ?? []) {
          if (!allAvailableTags.has(pm.monitor_tag)) {
            problems.push({
              identifier: p.page_path,
              description: `References unknown monitor: "${pm.monitor_tag}"`,
              severity: "warning",
            });
          }
        }
      }
      entities.push({
        key: "pages",
        label: "Pages",
        total: pages.length,
        new_count: pages.length - overwrite_count,
        overwrite_count,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: true,
        problems,
      });
    }

    if (triggers.length > 0) {
      const existingNames = await db
        .knex("triggers")
        .select("name")
        .then((rows: { name: string }[]) => new Set(rows.map((r) => r.name)));
      const overwrite_count = triggers.filter((t) => existingNames.has(t.name)).length;
      entities.push({
        key: "triggers",
        label: "Triggers",
        total: triggers.length,
        new_count: triggers.length - overwrite_count,
        overwrite_count,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: true,
        problems: [],
      });
    }

    if (images.length > 0) {
      const existingIds = await db
        .knex("images")
        .select("id")
        .then((rows: { id: string }[]) => new Set(rows.map((r) => r.id)));
      const existing_count = images.filter((img) => existingIds.has(img.id)).length;
      entities.push({
        key: "images",
        label: "Images",
        total: images.length,
        new_count: images.length - existing_count,
        overwrite_count: existing_count,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: false,
        problems: [],
      });
    }

    if (payload.config.auth) {
      entities.push({
        key: "auth",
        label: "Auth Configuration",
        total: 1,
        new_count: 0,
        overwrite_count: 1,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: true,
        problems: [],
      });
    }
  }

  if (payload.users_groups_roles) {
    const roles = payload.users_groups_roles.roles ?? [];
    const users = payload.users_groups_roles.users ?? [];
    const groups = payload.users_groups_roles.groups ?? [];
    const subscribers = payload.users_groups_roles.subscribers ?? [];

    if (roles.length > 0) {
      const allExistingRoles = await db.getAllRoles();
      const existingRoleNames = new Set(allExistingRoles.map((r) => r.role_name));
      const readonly_count = roles.filter((r) => r.readonly).length;
      const importable = roles.filter((r) => !r.readonly);
      const existing_count = importable.filter((r) => existingRoleNames.has(r.role_name)).length;
      entities.push({
        key: "roles",
        label: "Roles",
        total: roles.length,
        new_count: importable.length - existing_count,
        overwrite_count: 0,
        skip_count: existing_count + readonly_count,
        can_toggle_overwrite: false,
        overwrite_default: false,
        problems: [],
      });
    }

    if (users.length > 0) {
      const existingEmails = await db
        .knex("users")
        .select("email")
        .then((rows: { email: string }[]) => new Set(rows.map((r) => r.email)));
      const existing_count = users.filter((u) => existingEmails.has(u.email)).length;
      entities.push({
        key: "users",
        label: "Users",
        total: users.length,
        new_count: users.length - existing_count,
        overwrite_count: existing_count,
        skip_count: 0,
        can_toggle_overwrite: false,
        overwrite_default: true,
        problems: [],
      });
    }

    if (groups.length > 0) {
      const allGroups = await db.getAllGroups();
      const existingNames = new Set(allGroups.map((g) => g.name));
      const overwrite_count = groups.filter((g) => existingNames.has(g.name)).length;
      entities.push({
        key: "groups",
        label: "Groups",
        total: groups.length,
        new_count: groups.length - overwrite_count,
        overwrite_count,
        skip_count: 0,
        can_toggle_overwrite: true,
        overwrite_default: true,
        problems: [],
      });
    }

    if (subscribers.length > 0) {
      const existingEmails = await db
        .knex("subscriber_users")
        .select("email")
        .then((rows: { email: string }[]) => new Set(rows.map((r) => r.email)));
      const skip_count = subscribers.filter((s) => existingEmails.has(s.email)).length;
      entities.push({
        key: "subscribers",
        label: "Subscribers",
        total: subscribers.length,
        new_count: subscribers.length - skip_count,
        overwrite_count: 0,
        skip_count,
        can_toggle_overwrite: false,
        overwrite_default: false,
        problems: [],
      });
    }
  }

  const has_errors = !version_ok || entities.some((e) => e.problems.some((p) => p.severity === "error"));

  return {
    version_ok,
    scope: payload.scope,
    exported_at: payload.exported_at,
    entities,
    has_errors,
    migration,
  };
}

export async function importData(
  rawPayload: ExportPayload,
  options?: ImportOptions,
): Promise<{ imported: Record<string, number> }> {
  // M-25: Reject export files created by a newer version of this software
  if ((rawPayload.version ?? 0) > CURRENT_EXPORT_VERSION) {
    throw new Error(
      `Export file version ${rawPayload.version} is newer than supported version ${CURRENT_EXPORT_VERSION}`,
    );
  }

  // Apply schema migrations to bring the payload up to the current format
  const { payload } = migratePayload(rawPayload);

  const opts: Required<ImportOptions> = {
    overwrite_monitors: options?.overwrite_monitors ?? true,
    overwrite_pages: options?.overwrite_pages ?? true,
    overwrite_triggers: options?.overwrite_triggers ?? true,
    overwrite_images: options?.overwrite_images ?? false,
    overwrite_site_data: options?.overwrite_site_data ?? true,
    overwrite_auth: options?.overwrite_auth ?? true,
    overwrite_groups: options?.overwrite_groups ?? true,
  };

  const imported: Record<string, number> = {};

  if (payload.config) {
    // C-02: Wrap the entire config import in a transaction so it is atomic
    const configCounts = await db.knex.transaction(async (trx) => {
      const { site_data, monitors, pages, triggers } = payload.config!;
      const counts: Record<string, number> = {};

      // auth.oidc and auth.ldap are imported via SaveOidcConfig/SaveLdapConfig below
      const AUTH_SITE_DATA_SKIP = new Set(["auth.oidc", "auth.ldap"]);
      let siteDataImported = 0;
      let siteDataSkipped = 0;
      for (const sd of site_data ?? []) {
        if (AUTH_SITE_DATA_SKIP.has(sd.key)) continue;
        if (!opts.overwrite_site_data) {
          const exists = await trx("site_data").where("key", sd.key).first();
          if (exists) {
            siteDataSkipped++;
            continue;
          }
        }
        // For smtp/resend: credentials are stripped on export; merge with existing to preserve them
        let valueToWrite = sd.value;
        if ((sd.key === "smtp" || sd.key === "resend") && sd.data_type === "object") {
          try {
            const importParsed = JSON.parse(sd.value) as Record<string, unknown>;
            const existing = await trx("site_data").where("key", sd.key).first<{ value: string } | undefined>();
            if (existing) {
              const existingParsed = JSON.parse(existing.value) as Record<string, unknown>;
              if (sd.key === "smtp" && !importParsed.smtp_pass) {
                importParsed.smtp_pass = existingParsed.smtp_pass ?? "";
              }
              if (sd.key === "resend" && !importParsed.resend_api_key) {
                importParsed.resend_api_key = existingParsed.resend_api_key ?? "";
              }
            }
            valueToWrite = JSON.stringify(importParsed);
          } catch {
            // keep original value on parse error
          }
        }
        await trx("site_data")
          .insert({ key: sd.key, value: valueToWrite, data_type: sd.data_type })
          .onConflict("key")
          .merge(["value", "data_type"]);
        siteDataImported++;
      }
      counts.site_data = siteDataImported;
      if (siteDataSkipped > 0) counts.site_data_skipped = siteDataSkipped;

      let monitorsImported = 0;
      let monitorsSkipped = 0;
      for (const m of monitors ?? []) {
        const existing = await trx("monitors").where("tag", m.tag).first();
        if (existing) {
          if (!opts.overwrite_monitors) {
            monitorsSkipped++;
            continue;
          }
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
      if (monitorsSkipped > 0) counts.monitors_skipped = monitorsSkipped;

      let pagesImported = 0;
      let pagesSkipped = 0;
      for (const p of pages ?? []) {
        const { monitors: pageMonitors, ...pageData } = p;
        const existing = await trx("pages").where("page_path", pageData.page_path).first();
        let pageId: number;
        if (existing) {
          if (!opts.overwrite_pages) {
            pagesSkipped++;
            continue;
          }
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
      if (pagesSkipped > 0) counts.pages_skipped = pagesSkipped;

      let triggersImported = 0;
      let triggersSkipped = 0;
      const allTriggers = await trx("triggers").select("*");
      for (const t of triggers ?? []) {
        const existing = allTriggers.find((tr: { name: string }) => tr.name === t.name);
        if (existing) {
          if (!opts.overwrite_triggers) {
            triggersSkipped++;
            continue;
          }
          await trx("triggers").where("id", existing.id).update({ ...t, updated_at: trx.fn.now() });
        } else {
          await trx("triggers").insert({ ...t, created_at: trx.fn.now(), updated_at: trx.fn.now() });
        }
        triggersImported++;
      }
      counts.triggers = triggersImported;
      if (triggersSkipped > 0) counts.triggers_skipped = triggersSkipped;

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
        } else if (opts.overwrite_images) {
          await trx("images").where("id", img.id).update({
            data: img.data,
            mime_type: img.mime_type,
            original_name: img.original_name ?? null,
            width: img.width ?? null,
            height: img.height ?? null,
            size: img.size ?? null,
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
    if (payload.config.auth && opts.overwrite_auth) {
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
      let groupsSkipped = 0;
      const allGroups = await db.getAllGroups();
      for (const g of groups ?? []) {
        const existing = allGroups.find((ex) => ex.name === g.name);
        let groupId: number;
        if (existing) {
          if (!opts.overwrite_groups) {
            groupsSkipped++;
            continue;
          }
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
      if (groupsSkipped > 0) counts.groups_skipped = groupsSkipped;

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
