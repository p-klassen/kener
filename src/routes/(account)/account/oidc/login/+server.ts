import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetOidcAuthorizationUrl } from "$lib/server/controllers/oidcController.js";
import serverResolve from "$lib/server/resolver.js";

export const GET: RequestHandler = async ({ cookies }) => {
  let authUrl: string;
  try {
    authUrl = await GetOidcAuthorizationUrl(cookies);
  } catch (e: unknown) {
    console.error("OIDC login error:", e);
    throw redirect(302, serverResolve("/account/signin?error=sso_failed"));
  }
  throw redirect(302, authUrl);
};
