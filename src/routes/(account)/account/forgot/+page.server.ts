import type { PageServerLoad } from "./$types";
import { VerifyToken } from "$lib/server/controllers/commonController.js";
import { isTokenUsed } from "$lib/server/rateLimit.js";

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

  // Show error immediately if the token was already consumed (avoids pointless form fill)
  if (tokenData.jti && await isTokenUsed(tokenData.jti)) {
    return { view, token: "", valid: false, errorKey: "account.forgot.err_invalid_token" };
  }

  return { view, token, valid: true };
};
