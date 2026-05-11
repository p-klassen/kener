import { Client } from "ldapts";
import db from "../db/db.js";
import { HashPassword } from "./commonController.js";
import { GetLdapConfig, type LdapConfig, type LdapGroupMapping } from "./authConfigController.js";
import type { UserRecordPublic } from "../types/db.js";
import { randomBytes } from "crypto";

export async function AuthenticateWithLdap(
  username: string,
  password: string,
): Promise<UserRecordPublic> {
  const config = await GetLdapConfig();
  if (!config.enabled) throw new Error("LDAP is not enabled");
  if (!config.host) throw new Error("LDAP host is not configured");

  const url = config.use_tls
    ? `ldaps://${config.host}:${config.port || 636}`
    : `ldap://${config.host}:${config.port || 389}`;

  const client = new Client({
    url,
    tlsOptions: config.use_tls
      ? { rejectUnauthorized: !config.skip_tls_verify }
      : undefined,
    timeout: 5000,
    connectTimeout: 5000,
  });

  try {
    // Bind with service account
    if (config.bind_dn && config.bind_password) {
      await client.bind(config.bind_dn, config.bind_password);
    }

    // Search for the user
    const filter = config.user_search_filter.replace("{{username}}", escapeLdapFilter(username));
    const { searchEntries } = await client.search(config.base_dn, {
      scope: "sub",
      filter,
      attributes: [
        config.username_attribute || "uid",
        config.email_attribute || "mail",
        config.name_attribute || "cn",
        "dn",
      ],
    });

    if (!searchEntries || searchEntries.length === 0) {
      throw new Error("User not found in LDAP directory");
    }

    const entry = searchEntries[0];
    const userDn = entry.dn;

    // Verify password by binding as the user
    try {
      await client.bind(userDn, password);
    } catch {
      throw new Error("Invalid username or password");
    }

    const emailAttr = config.email_attribute || "mail";
    const nameAttr = config.name_attribute || "cn";

    const email = String(getAttr(entry, emailAttr) ?? "").toLowerCase().trim();
    const name = String(getAttr(entry, nameAttr) ?? username);

    if (!email) throw new Error("LDAP user has no email address");

    // Fetch group memberships if configured
    let ldapGroups: string[] = [];
    if (config.group_search_base && config.group_search_filter) {
      const groupFilter = config.group_search_filter.replace("{{dn}}", escapeLdapFilter(userDn));
      try {
        const { searchEntries: groupEntries } = await client.search(config.group_search_base, {
          scope: "sub",
          filter: groupFilter,
          attributes: [config.group_name_attribute || "cn"],
        });
        ldapGroups = groupEntries.map((g) => String(getAttr(g, config.group_name_attribute || "cn") ?? ""));
      } catch {
        // Group search failure is non-fatal
      }
    }

    // Find or create user in DB
    let user = await db.getUserByExternalId("ldap", userDn);

    if (!user) {
      user = await db.getUserByEmail(email);
      if (user) {
        await db.updateUserAuthProvider(user.id, "ldap", userDn);
      }
    }

    if (!user) {
      if (!config.auto_create_users) {
        throw new Error("LDAP login failed: user not found and auto-create is disabled");
      }
      const randomPw = await HashPassword(randomBytes(32).toString("hex"));
      const defaultRoleIds = config.default_role_ids ?? [];
      const [userId] = await db.insertUser({
        email,
        name,
        password_hash: randomPw,
        is_active: 1,
        is_verified: 1,
        must_change_password: 0,
        role_ids: defaultRoleIds,
        auth_provider: "ldap",
        external_id: userDn,
      });
      for (const roleId of defaultRoleIds) {
        await db.addUserToRole(roleId, userId);
      }
      user = await db.getUserById(userId);
    }

    if (!user) throw new Error("Failed to load user after LDAP login");

    if (!user.is_active) {
      throw new Error("Your account has been deactivated. Please contact an administrator.");
    }

    // Sync groups if configured
    if (config.sync_groups && ldapGroups.length > 0 && config.group_mappings.length > 0) {
      await syncLdapRoles(user.id, ldapGroups, config.group_mappings);
      user = (await db.getUserById(user.id))!;
    }

    if (!user.role_ids || user.role_ids.length === 0) {
      throw new Error("Your account has no roles assigned. Please contact an administrator.");
    }

    return user;
  } finally {
    await client.unbind();
  }
}

async function syncLdapRoles(userId: number, ldapGroups: string[], mappings: LdapGroupMapping[]) {
  const allRoles = await db.getAllRoles();
  const roleMap = new Map(allRoles.map((r) => [r.id, r]));

  const currentRoleIds = new Set(await db.getUserRoleIds(userId));
  const desiredRoleIds = new Set<string>();

  for (const mapping of mappings) {
    if (ldapGroups.includes(mapping.ldap_group)) {
      for (const rid of mapping.role_ids) {
        if (roleMap.has(rid)) desiredRoleIds.add(rid);
      }
    }
  }

  const managedRoleIds = new Set(mappings.flatMap((m) => m.role_ids));
  for (const rid of desiredRoleIds) {
    if (!currentRoleIds.has(rid)) await db.addUserToRole(rid, userId);
  }
  for (const rid of currentRoleIds) {
    if (managedRoleIds.has(rid) && !desiredRoleIds.has(rid)) {
      await db.removeUserFromRole(rid, userId);
    }
  }
}

function getAttr(entry: Record<string, unknown>, attr: string): string | undefined {
  const val = entry[attr];
  if (Array.isArray(val)) return val[0] as string;
  if (typeof val === "string") return val;
  return undefined;
}

function escapeLdapFilter(value: string): string {
  return value
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

export async function TestLdapConnection(config: LdapConfig): Promise<{ success: boolean; message: string }> {
  const url = config.use_tls
    ? `ldaps://${config.host}:${config.port || 636}`
    : `ldap://${config.host}:${config.port || 389}`;

  const client = new Client({
    url,
    tlsOptions: config.use_tls ? { rejectUnauthorized: !config.skip_tls_verify } : undefined,
    timeout: 5000,
    connectTimeout: 5000,
  });

  try {
    await client.bind(config.bind_dn || "", config.bind_password || "");
    return { success: true, message: "Connection successful" };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    await client.unbind();
  }
}
