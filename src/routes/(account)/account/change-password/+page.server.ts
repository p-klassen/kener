import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { GetLoggedInSession } from "$lib/server/controllers/userController";
import { HashPassword, ValidatePassword } from "$lib/server/controllers/commonController";
import db from "$lib/server/db/db";
import serverResolve from "$lib/server/resolver.js";

export const load: PageServerLoad = async ({ cookies }) => {
  const loggedInUser = await GetLoggedInSession(cookies);
  if (!loggedInUser) {
    throw redirect(302, serverResolve("/account/signin"));
  }
  if (!loggedInUser.must_change_password) {
    throw redirect(302, serverResolve("/manage/app/site-configurations"));
  }
  return {};
};

export const actions: Actions = {
  change: async ({ request, cookies }) => {
    const loggedInUser = await GetLoggedInSession(cookies);
    if (!loggedInUser) {
      throw redirect(302, serverResolve("/account/signin"));
    }

    const formData = await request.formData();
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!newPassword || !confirmPassword) {
      return fail(400, { error: "Both password fields are required" });
    }
    if (!ValidatePassword(newPassword)) {
      return fail(400, { error: "Password must be at least 8 characters, contain uppercase, lowercase, and a number" });
    }
    if (newPassword !== confirmPassword) {
      return fail(400, { error: "Passwords do not match" });
    }

    const passwordHash = await HashPassword(newPassword);
    await db.updateUserPassword({ id: loggedInUser.id, password_hash: passwordHash });
    await db.updateMustChangePassword(loggedInUser.id, 0);

    throw redirect(302, serverResolve("/manage/app/site-configurations"));
  },
};
