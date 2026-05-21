import type { PageServerLoad } from "./$types";
import { VerifyToken } from "$lib/server/controllers/commonController.js";

export const load: PageServerLoad = async ({ url }) => {
  const view = url.searchParams.get("view") || "request_reset";
  const token = url.searchParams.get("token") || "";

  if (view !== "confirm_token") {
    return { view, token, valid: true };
  }

  if (!token) {
    return { view, token: "", valid: false, errorKey: "account.forgot.err_invalid_token" };
  }

  const tokenData = await VerifyToken(token);
  if (!tokenData || !tokenData.email) {
    return { view, token: "", valid: false, errorKey: "account.forgot.err_invalid_token" };
  }

  const validTill = tokenData.validTill;
  if (!validTill || Date.now() > validTill) {
    return { view, token: "", valid: false, errorKey: "account.forgot.err_invalid_token" };
  }

  return { view, token, valid: true };
};
