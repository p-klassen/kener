import {
  HashPassword,
  VerifyToken,
  ValidatePassword,
} from "$lib/server/controllers/controller.js";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db.js";
import { checkRateLimit, getClientIp } from "$lib/server/rateLimit.js";

export const POST: RequestHandler = async ({ request }) => {
  const ip = getClientIp(request);
  const rl = await checkRateLimit("password-reset", ip, { windowMs: 15 * 60 * 1000, maxRequests: 10 });
  if (!rl.allowed) {
    return json({ errorKey: "account.forgot.err_rate_limited" }, { status: 429 });
  }

  const body = await request.json();
  const { receivedToken, newPassword } = body;

  if (!receivedToken) {
    return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
  }
  const tokenData = await VerifyToken(receivedToken);
  if (!tokenData) {
    return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
  }
  const email = tokenData.email;
  const generatedAt = tokenData.generatedAt;
  if (!email || !generatedAt) {
    return json({ errorKey: "account.forgot.err_invalid_token" }, { status: 400 });
  }
  // Check if token is expired (1 hour = 3600000 milliseconds)
  if (Date.now() - generatedAt > 3600000) {
    return json({ errorKey: "account.forgot.err_token_expired" }, { status: 400 });
  }

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
