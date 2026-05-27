import {
  HashPassword,
  VerifyToken,
  ValidatePassword,
} from "$lib/server/controllers/controller.js";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db.js";
import { checkRateLimit, getClientIp, acquireToken } from "$lib/server/rateLimit.js";

export const POST: RequestHandler = async ({ request }) => {
  const ip = getClientIp(request);
  const rl = await checkRateLimit("password-reset", ip, { windowMs: 15 * 60 * 1000, maxRequests: 10 });
  if (!rl.allowed) {
    return json({ errorKey: "account.forgot.err_rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } });
  }

  const body = await request.json();
  const { receivedToken, newPassword } = body;

  if (!receivedToken) {
    return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
  }
  if (!newPassword) {
    return json({ errorKey: "account.forgot.err_password_invalid" }, { status: 400 });
  }
  // VerifyToken calls jwt.verify which enforces the exp claim (1 h set by ForgotPasswordJWT)
  const tokenData = await VerifyToken(receivedToken);
  if (!tokenData || !tokenData.email) {
    return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
  }

  // Atomically claim the token — rejects if already used (one-time use via SET NX)
  const jti = tokenData.jti;
  if (jti) {
    const acquired = await acquireToken(jti, (tokenData.exp ?? 0) * 1000);
    if (!acquired) {
      return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
    }
  }

  const email = tokenData.email;

  const userDB = await db.getUserByEmail(email);
  if (!userDB) {
    return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
  }
  if (!ValidatePassword(newPassword)) {
    return json({ errorKey: "account.forgot.err_password_invalid" }, { status: 400 });
  }
  const password_hash = await HashPassword(newPassword);
  await db.updateUserPassword({ id: userDB.id, password_hash });
  await db.updateIsVerified(userDB.id, 1);

  return json({ success: true });
};
