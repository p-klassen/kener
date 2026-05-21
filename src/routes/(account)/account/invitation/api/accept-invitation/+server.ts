import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db.js";
import { HashPassword, ValidatePassword, VerifyToken } from "$lib/server/controllers/commonController.js";
import { GetUserPasswordHashById } from "$lib/server/controllers/userController.js";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { receivedToken, newPassword } = body;

  if (!receivedToken) {
    return json({ errorKey: "account.invitation.err_invalid_link" }, { status: 400 });
  }

  if (!newPassword) {
    return json({ errorKey: "account.invitation.err_fill_fields" }, { status: 400 });
  }

  // Verify token
  const tokenData = await VerifyToken(receivedToken);
  if (!tokenData) {
    return json({ errorKey: "account.invitation.err_invalid_expired" }, { status: 400 });
  }

  const email = tokenData.email;
  if (!email) {
    return json({ errorKey: "account.invitation.err_invalid_link" }, { status: 400 });
  }

  // Check token expiry
  const validTill = tokenData.validTill;
  if (!validTill || Date.now() > validTill) {
    return json({ errorKey: "account.invitation.err_expired" }, { status: 400 });
  }

  // Check user exists with empty password
  const user = await db.getUserByEmail(email);
  if (!user) {
    return json({ errorKey: "account.invitation.err_no_user" }, { status: 400 });
  }

  const passwordData = await GetUserPasswordHashById(user.id);
  if (passwordData && passwordData.password_hash !== "") {
    return json({ errorKey: "account.invitation.err_already_accepted" }, { status: 400 });
  }

  // Validate password strength
  if (!ValidatePassword(newPassword)) {
    return json({ errorKey: "account.invitation.err_password_invalid" }, { status: 400 });
  }

  // Hash and set password
  const passwordHash = await HashPassword(newPassword);
  await db.updateUserPassword({
    id: user.id,
    password_hash: passwordHash,
  });

  // Activate user and mark as verified
  await db.updateUserIsActive(user.id, 1);
  await db.updateIsVerified(user.id, 1);

  return json({ success: true });
};
