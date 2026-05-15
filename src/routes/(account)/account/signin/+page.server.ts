import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  GetUserByEmail,
  GetUsersCount,
  GetUserPasswordHashById,
  CreateFirstUser,
  GetUserPermissions,
} from "$lib/server/controllers/userController";
import { VerifyPassword, GenerateToken, CookieConfig } from "$lib/server/controllers/commonController";
import { AuthenticateWithLdap } from "$lib/server/controllers/ldapController.js";
import { GetOidcConfig, GetLdapConfig } from "$lib/server/controllers/authConfigController.js";
import constants from "$lib/global-constants";
import serverResolve from "$lib/server/resolver.js";

export const load: PageServerLoad = async ({ parent, url }) => {
  const parentData = await parent();

  if (!!parentData.loggedInUser && parentData.isSetupComplete) {
    const permissions = await GetUserPermissions(parentData.loggedInUser.id);
    const dest = permissions.size > 0 ? "/manage/app/site-configurations" : "/";
    throw redirect(302, serverResolve(dest));
  }

  const [oidcConfig, ldapConfig] = await Promise.all([GetOidcConfig(), GetLdapConfig()]);
  const oidcError = url.searchParams.get("error") ?? null;

  return {
    ...parentData,
    oidcEnabled: oidcConfig.enabled,
    oidcButtonText: oidcConfig.button_text || "Sign in with SSO",
    oidcButtonIconUrl: oidcConfig.button_icon_url || "",
    ldapEnabled: ldapConfig.enabled,
    oidcError,
  };
};

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return fail(400, { error: "Email and password are required", values: { email } });
    }

    const userCount = await GetUsersCount();
    if (!userCount || Number(userCount.count) === 0) {
      return fail(400, { error: constants.ERROR_NO_SETUP, values: { email } });
    }

    const userDB = await GetUserByEmail(email);
    if (!userDB) {
      return fail(401, { error: "User does not exist", values: { email } });
    }

    const passwordStored = await GetUserPasswordHashById(userDB.id);
    if (!passwordStored) {
      return fail(401, { error: "Invalid password or Email", values: { email } });
    }

    const isMatch = await VerifyPassword(password, passwordStored.password_hash);
    if (!isMatch) {
      return fail(401, { error: "Invalid password or Email", values: { email } });
    }

    if (!userDB.is_active) {
      return fail(403, {
        error: "Your account has been deactivated. Please contact an administrator.",
        values: { email },
      });
    }

    if (userDB.user_type !== "subscriber") {
      if (!userDB.role_ids || userDB.role_ids.length === 0) {
        return fail(403, {
          error: "Your account has no active roles assigned. Please contact an administrator.",
          values: { email },
        });
      }
    }

    const token = await GenerateToken(userDB);
    const cookieConfig = CookieConfig();
    cookies.set(cookieConfig.name, token, {
      path: cookieConfig.path,
      maxAge: cookieConfig.maxAge,
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
    });

    if (userDB.must_change_password) {
      throw redirect(302, serverResolve("/account/change-password"));
    }
    if (userDB.user_type === "subscriber") {
      throw redirect(303, "/");
    }
    const loginPermissions = await GetUserPermissions(userDB.id);
    throw redirect(302, serverResolve(loginPermissions.size > 0 ? "/manage/app/site-configurations" : "/"));
  },
  ldap: async ({ request, cookies }) => {
    const formData = await request.formData();
    const username = String(formData.get("ldap_username") ?? "").trim();
    const password = String(formData.get("ldap_password") ?? "");

    if (!username || !password) {
      return fail(400, { error: "Username and password are required", values: { ldap_username: username } });
    }

    let ldapRedirect: string;
    try {
      const userDB = await AuthenticateWithLdap(username, password);
      const token = await GenerateToken(userDB);
      const cookieConfig = CookieConfig();
      cookies.set(cookieConfig.name, token, {
        path: cookieConfig.path,
        maxAge: cookieConfig.maxAge,
        httpOnly: cookieConfig.httpOnly,
        secure: cookieConfig.secure,
        sameSite: cookieConfig.sameSite,
      });
      if (userDB.user_type === "subscriber") {
        ldapRedirect = "/";
      } else {
        const ldapPermissions = await GetUserPermissions(userDB.id);
        ldapRedirect = serverResolve(ldapPermissions.size > 0 ? "/manage/app/site-configurations" : "/");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "LDAP authentication failed";
      return fail(401, { error: msg, values: { ldap_username: username } });
    }
    throw redirect(302, ldapRedirect);
  },
  signup: async ({ request, cookies }) => {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!name || !email || !password) {
      return fail(400, { error: "Email, password, and name are required", values: { name, email } });
    }

    const userCount = await GetUsersCount();
    if (userCount && Number(userCount.count) !== 0) {
      return fail(400, {
        error: "Set up already done. Please login with the email and password you have set up.",
        values: { name, email },
      });
    }

    try {
      await CreateFirstUser({ email, name, password });
      const userDB = await GetUserByEmail(email);

      if (!userDB) {
        return fail(500, { error: "Failed to create user", values: { name, email } });
      }

      const token = await GenerateToken(userDB);
      const cookieConfig = CookieConfig();
      cookies.set(cookieConfig.name, token, {
        path: cookieConfig.path,
        maxAge: cookieConfig.maxAge,
        httpOnly: cookieConfig.httpOnly,
        secure: cookieConfig.secure,
        sameSite: cookieConfig.sameSite,
      });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "An error occurred during signup";
      return fail(400, { error: errorMessage, values: { name, email } });
    }
    throw redirect(302, serverResolve("/manage/app/site-configurations"));
  },
};
