import db from "../db/db.js";

// ============ OIDC Config ============

export interface OidcGroupMapping {
  oidc_group: string;
  role_ids: string[];
}

export interface OidcConfig {
  enabled: boolean;
  provider_name: string;
  client_id: string;
  client_secret: string;
  issuer_url: string;
  redirect_uri: string;
  scopes: string;
  auto_create_users: boolean;
  default_role_ids: string[];
  button_text: string;
  button_icon_url: string;
  groups_claim: string;
  sync_groups: boolean;
  group_mappings: OidcGroupMapping[];
  // Advanced / override (empty = use discovery)
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint: string;
}

export const defaultOidcConfig: OidcConfig = {
  enabled: false,
  provider_name: "OIDC",
  client_id: "",
  client_secret: "",
  issuer_url: "",
  redirect_uri: "",
  scopes: "openid email profile",
  auto_create_users: false,
  default_role_ids: [],
  button_text: "Sign in with SSO",
  button_icon_url: "",
  groups_claim: "groups",
  sync_groups: true,
  group_mappings: [],
  authorization_endpoint: "",
  token_endpoint: "",
  userinfo_endpoint: "",
  jwks_uri: "",
  end_session_endpoint: "",
};

// ============ LDAP Config ============

export interface LdapGroupMapping {
  ldap_group: string;
  role_ids: string[];
}

export interface LdapConfig {
  enabled: boolean;
  host: string;
  port: number;
  use_tls: boolean;
  skip_tls_verify: boolean;
  bind_dn: string;
  bind_password: string;
  base_dn: string;
  user_search_filter: string;
  username_attribute: string;
  email_attribute: string;
  name_attribute: string;
  auto_create_users: boolean;
  default_role_ids: string[];
  group_search_base: string;
  group_search_filter: string;
  group_member_attribute: string;
  group_name_attribute: string;
  sync_groups: boolean;
  group_mappings: LdapGroupMapping[];
}

export const defaultLdapConfig: LdapConfig = {
  enabled: false,
  host: "",
  port: 389,
  use_tls: false,
  skip_tls_verify: false,
  bind_dn: "",
  bind_password: "",
  base_dn: "",
  user_search_filter: "(uid={{username}})",
  username_attribute: "uid",
  email_attribute: "mail",
  name_attribute: "cn",
  auto_create_users: false,
  default_role_ids: [],
  group_search_base: "",
  group_search_filter: "(member={{dn}})",
  group_member_attribute: "member",
  group_name_attribute: "cn",
  sync_groups: true,
  group_mappings: [],
};

// ============ DB persistence ============

const OIDC_KEY = "auth.oidc";
const LDAP_KEY = "auth.ldap";

export async function GetOidcConfig(): Promise<OidcConfig> {
  const row = await db.getSiteDataByKey(OIDC_KEY);
  if (!row) return { ...defaultOidcConfig };
  try {
    return { ...defaultOidcConfig, ...JSON.parse(row.value) };
  } catch {
    return { ...defaultOidcConfig };
  }
}

export async function SaveOidcConfig(config: Partial<OidcConfig>): Promise<OidcConfig> {
  const current = await GetOidcConfig();
  const updated = { ...current, ...config };
  await db.insertOrUpdateSiteData(OIDC_KEY, JSON.stringify(updated), "json");
  return updated;
}

export async function GetLdapConfig(): Promise<LdapConfig> {
  const row = await db.getSiteDataByKey(LDAP_KEY);
  if (!row) return { ...defaultLdapConfig };
  try {
    return { ...defaultLdapConfig, ...JSON.parse(row.value) };
  } catch {
    return { ...defaultLdapConfig };
  }
}

export async function SaveLdapConfig(config: Partial<LdapConfig>): Promise<LdapConfig> {
  const current = await GetLdapConfig();
  const updated = { ...current, ...config };
  // Don't persist an empty bind_password if not provided (keep existing)
  if (!config.bind_password && current.bind_password) {
    updated.bind_password = current.bind_password;
  }
  await db.insertOrUpdateSiteData(LDAP_KEY, JSON.stringify(updated), "json");
  return updated;
}

export async function GetLdapConfigPublic(): Promise<Omit<LdapConfig, "bind_password">> {
  const { bind_password: _pw, ...rest } = await GetLdapConfig();
  return rest;
}
