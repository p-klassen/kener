import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetOidcAuthorizationUrl } from "$lib/server/controllers/oidcController.js";

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const url = await GetOidcAuthorizationUrl(cookies);
    throw redirect(302, url);
  } catch (e: unknown) {
    if (e instanceof Response) throw e;
    const msg = e instanceof Error ? e.message : "OIDC configuration error";
    throw redirect(302, `/account/signin?error=${encodeURIComponent(msg)}`);
  }
};
