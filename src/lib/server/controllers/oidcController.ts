import { randomBytes, createHash } from "crypto";
import db from "../db/db.js";
import { GenerateToken, CookieConfig, HashPassword } from "./commonController.js";
import { GetOidcConfig, type OidcConfig, type OidcGroupMapping } from "./authConfigController.js";
import type { UserRecordPublic } from "../types/db.js";
import type { Cookies } from "@sveltejs/kit";
import serverResolve from "../resolver.js";

interface OidcProviderMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

// Cache discovery metadata for the session lifetime
let discoveryCache: { issuer: string; meta: OidcProviderMetadata; fetchedAt: number } | null = null;

async function discoverProvider(config: OidcConfig): Promise<OidcProviderMetadata> {
  // Use manually configured endpoints if all provided
  if (config.authorization_endpoint && config.token_endpoint && config.userinfo_endpoint) {
    return {
      authorization_endpoint: config.authorization_endpoint,
      token_endpoint: config.token_endpoint,
      userinfo_endpoint: config.userinfo_endpoint,
      jwks_uri: config.jwks_uri,
      end_session_endpoint: config.end_session_endpoint || undefined,
    };
  }

  const now = Date.now();
  if (discoveryCache && discoveryCache.issuer === config.issuer_url && now - discoveryCache.fetchedAt < 300_000) {
    return discoveryCache.meta;
  }

  const discoveryUrl = config.issuer_url.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const resp = await fetch(discoveryUrl);
  if (!resp.ok) {
    throw new Error(`OIDC discovery failed: ${resp.status} ${resp.statusText}`);
  }
  const meta = (await resp.json()) as OidcProviderMetadata;
  discoveryCache = { issuer: config.issuer_url, meta, fetchedAt: now };
  return meta;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function GetOidcAuthorizationUrl(
  cookies: Cookies,
): Promise<string> {
  const config = await GetOidcConfig();
  if (!config.enabled) throw new Error("OIDC is not enabled");

  const meta = await discoverProvider(config);
  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  cookies.set("oidc_state", state, { path: "/", httpOnly: true, maxAge: 600, sameSite: "lax" });
  cookies.set("oidc_nonce", nonce, { path: "/", httpOnly: true, maxAge: 600, sameSite: "lax" });
  cookies.set("oidc_code_verifier", codeVerifier, { path: "/", httpOnly: true, maxAge: 600, sameSite: "lax" });

  const redirectUri = config.redirect_uri || buildDefaultRedirectUri();
  const scopes = config.scopes || "openid email profile";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.client_id,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${meta.authorization_endpoint}?${params.toString()}`;
}

function buildDefaultRedirectUri(): string {
  const origin = process.env.ORIGIN || "http://localhost:3000";
  const basePath = process.env.KENER_BASE_PATH || "";
  return `${origin}${basePath}/account/oidc/callback`;
}

export async function HandleOidcCallback(
  cookies: Cookies,
  code: string,
  state: string,
): Promise<{ user: UserRecordPublic; token: string; cookieConfig: ReturnType<typeof CookieConfig> }> {
  const config = await GetOidcConfig();
  if (!config.enabled) throw new Error("OIDC is not enabled");

  const savedState = cookies.get("oidc_state");
  const nonce = cookies.get("oidc_nonce");
  const codeVerifier = cookies.get("oidc_code_verifier");

  if (!savedState || savedState !== state) {
    throw new Error("Invalid OIDC state parameter");
  }

  cookies.delete("oidc_state", { path: "/" });
  cookies.delete("oidc_nonce", { path: "/" });
  cookies.delete("oidc_code_verifier", { path: "/" });

  const meta = await discoverProvider(config);
  const redirectUri = config.redirect_uri || buildDefaultRedirectUri();

  // Exchange code for tokens
  const tokenResp = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.client_id,
      client_secret: config.client_secret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier || "",
    }).toString(),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    throw new Error(`OIDC token exchange failed: ${tokenResp.status} ${body}`);
  }

  const tokens = (await tokenResp.json()) as { access_token: string; id_token?: string };

  // Fetch user info
  const userInfoResp = await fetch(meta.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoResp.ok) {
    throw new Error(`OIDC userinfo request failed: ${userInfoResp.status}`);
  }

  const userInfo = (await userInfoResp.json()) as Record<string, unknown>;

  const subject = String(userInfo.sub ?? "");
  const email = String(userInfo.email ?? "").toLowerCase().trim();
  const name = String(userInfo.name ?? userInfo.preferred_username ?? email);

  if (!subject) throw new Error("OIDC userinfo missing 'sub' claim");
  if (!email) throw new Error("OIDC userinfo missing 'email' claim");

  // Resolve groups from the claim
  const rawGroups = userInfo[config.groups_claim];
  const oidcGroups: string[] = Array.isArray(rawGroups) ? rawGroups.map(String) : [];

  // Find or create user
  let user = await db.getUserByExternalId("oidc", subject);

  if (!user) {
    // Try to find by email (link existing local user)
    user = await db.getUserByEmail(email);
    if (user) {
      await db.updateUserAuthProvider(user.id, "oidc", subject);
    }
  }

  if (!user) {
    if (!config.auto_create_users) {
      throw new Error("OIDC login failed: user not found and auto-create is disabled");
    }
    // Create user with a random password (they can't use it — auth_provider = oidc)
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
      auth_provider: "oidc",
      external_id: subject,
    });
    // Assign default roles
    if (defaultRoleIds.length > 0) {
      for (const roleId of defaultRoleIds) {
        await db.addUserToRole(roleId, userId);
      }
    }
    user = await db.getUserById(userId);
  }

  if (!user) throw new Error("Failed to load user after OIDC login");

  if (!user.is_active) {
    throw new Error("Your account has been deactivated. Please contact an administrator.");
  }

  // Sync groups/roles if enabled
  if (config.sync_groups && oidcGroups.length > 0 && config.group_mappings.length > 0) {
    await syncOidcRoles(user.id, oidcGroups, config.group_mappings);
    // Reload user to get fresh role_ids
    user = (await db.getUserById(user.id))!;
  }

  if (!user.role_ids || user.role_ids.length === 0) {
    throw new Error("Your account has no roles assigned. Please contact an administrator.");
  }

  const token = await GenerateToken(user);
  const cookieConfig = CookieConfig();
  return { user, token, cookieConfig };
}

async function syncOidcRoles(userId: number, oidcGroups: string[], mappings: OidcGroupMapping[]) {
  const allRoles = await db.getAllRoles();
  const roleMap = new Map(allRoles.map((r) => [r.id, r]));

  const currentRoleIds = new Set((await db.getUserRoleIds(userId)));
  const desiredRoleIds = new Set<string>();

  for (const mapping of mappings) {
    if (oidcGroups.includes(mapping.oidc_group)) {
      for (const rid of mapping.role_ids) {
        if (roleMap.has(rid)) desiredRoleIds.add(rid);
      }
    }
  }

  // Add new roles
  for (const rid of desiredRoleIds) {
    if (!currentRoleIds.has(rid)) {
      await db.addUserToRole(rid, userId);
    }
  }

  // Remove roles that are no longer in any OIDC mapping we manage
  const managedRoleIds = new Set(mappings.flatMap((m) => m.role_ids));
  for (const rid of currentRoleIds) {
    if (managedRoleIds.has(rid) && !desiredRoleIds.has(rid)) {
      await db.removeUserFromRole(rid, userId);
    }
  }
}
