import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { VerifyToken } from "$lib/server/controllers/commonController.js";
import db from "$lib/server/db/db.js";
import serverResolve from "$lib/server/resolver.js";

export const load: PageServerLoad = async ({ url }) => {
  const view = url.searchParams.get("view") || "";
  const token = url.searchParams.get("token") || "";

  if (view !== "confirm_token" || !token) {
    return {
      errorKey: "account.verify.err_invalid_link",
    };
  }

  const tokenData = await VerifyToken(token);
  if (!tokenData) {
    return {
      errorKey: "account.verify.err_invalid_expired",
    };
  }

  const email = tokenData.email;
  if (!email) {
    return {
      errorKey: "account.verify.default_error",
    };
  }

  const validTill = tokenData.validTill;
  if (!validTill || Date.now() > validTill) {
    return {
      errorKey: "account.verify.err_expired",
    };
  }

  const user = await db.getUserByEmail(email);
  if (!user) {
    return {
      errorKey: "account.verify.err_no_user",
    };
  }

  if (!user.is_verified) {
    await db.updateIsVerified(user.id, 1);
  }

  throw redirect(302, serverResolve("/manage/app/users"));
};
