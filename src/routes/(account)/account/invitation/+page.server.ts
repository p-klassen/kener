import type { PageServerLoad } from "./$types";
import { VerifyToken } from "$lib/server/controllers/commonController.js";
import db from "$lib/server/db/db.js";
import { GetUserPasswordHashById } from "$lib/server/controllers/userController.js";
import serverResolve from "$lib/server/resolver.js";

export const load: PageServerLoad = async ({ url, cookies }) => {
  const view = url.searchParams.get("view") || "";
  const token = url.searchParams.get("token") || "";

  // If no token or not confirm_token view, show error
  if (view !== "confirm_token" || !token) {
    return {
      valid: false,
      errorKey: "account.invitation.err_invalid_link",
      token: "",
    };
  }

  // Verify the token
  const tokenData = await VerifyToken(token);
  if (!tokenData) {
    return {
      valid: false,
      errorKey: "account.invitation.err_invalid_expired",
      token: "",
    };
  }

  const email = tokenData.email;
  if (!email) {
    return {
      valid: false,
      errorKey: "account.invitation.err_invalid_link",
      token: "",
    };
  }

  // Check if token has expired (validTill)
  const validTill = tokenData.validTill;
  if (!validTill || Date.now() > validTill) {
    return {
      valid: false,
      errorKey: "account.invitation.err_expired",
      token: "",
    };
  }

  // Check if user exists with empty password (invited but not yet activated)
  const user = await db.getUserByEmail(email);
  if (!user) {
    return {
      valid: false,
      errorKey: "account.invitation.err_no_user",
      token: "",
    };
  }

  const passwordData = await GetUserPasswordHashById(user.id);
  if (passwordData && passwordData.password_hash !== "") {
    return {
      valid: false,
      errorKey: "account.invitation.err_already_accepted",
      token: "",
    };
  }

  // Clear any existing session only when the invitation link is valid and the user will set a password
  cookies.delete("kener-user", { path: serverResolve("/") });

  return {
    valid: true,
    token,
    email: user.email,
    name: user.name,
  };
};
