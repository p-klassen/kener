import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { HandleOidcCallback } from "$lib/server/controllers/oidcController.js";
import { GetLoggedInSession } from "$lib/server/controllers/controller.js";
import { GetUserPermissions } from "$lib/server/controllers/userController.js";
import serverResolve from "$lib/server/resolver.js";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (errorParam) {
    const msg = errorDesc || errorParam;
    throw redirect(302, serverResolve(`/account/signin?error=${encodeURIComponent(msg)}`));
  }

  if (!code || !state) {
    throw redirect(302, serverResolve("/account/signin?error=Missing+OIDC+parameters"));
  }

  let successUrl: string;
  try {
    const { token, cookieConfig } = await HandleOidcCallback(cookies, code, state);
    cookies.set(cookieConfig.name, token, {
      path: cookieConfig.path,
      maxAge: cookieConfig.maxAge,
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
    });
    const oidcUser = await GetLoggedInSession(cookies);
    const oidcPermissions = oidcUser ? await GetUserPermissions(oidcUser.id) : new Set<string>();
    successUrl = serverResolve(oidcPermissions.size > 0 ? "/manage/app/site-configurations" : "/");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OIDC callback error";
    throw redirect(302, serverResolve(`/account/signin?error=${encodeURIComponent(msg)}`));
  }
  throw redirect(302, successUrl);
};
