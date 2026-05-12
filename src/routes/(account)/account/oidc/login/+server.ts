import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetOidcAuthorizationUrl } from "$lib/server/controllers/oidcController.js";

export const GET: RequestHandler = async ({ cookies }) => {
  let authUrl: string;
  try {
    authUrl = await GetOidcAuthorizationUrl(cookies);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OIDC configuration error";
    throw redirect(302, `/account/signin?error=${encodeURIComponent(msg)}`);
  }
  throw redirect(302, authUrl);
};
