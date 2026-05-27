import { ForgotPasswordJWT, GetAllSiteData } from "$lib/server/controllers/controller.js";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db.js";
import { GetGeneralEmailTemplateByIdAndLocale } from "$lib/server/controllers/generalTemplateController";
import { siteDataToVariables } from "$lib/server/notification/notification_utils";
import sendEmail from "$lib/server/notification/email_notification.js";
import { checkRateLimit, getClientIp } from "$lib/server/rateLimit.js";
import serverResolve from "$lib/server/resolver.js";

export const POST: RequestHandler = async ({ request }) => {
  const ip = getClientIp(request);
  const rl = await checkRateLimit("forgot-password", ip, { windowMs: 15 * 60 * 1000, maxRequests: 5 });
  if (!rl.allowed) {
    return json({ errorKey: "account.forgot.err_rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } });
  }

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return json({ errorKey: "account.forgot.err_email_required" }, { status: 400 });
  }

  const userDB = await db.getUserByEmail(email);
  if (!userDB) {
    // Return success regardless to prevent user enumeration
    return json({ success: true });
  }

  // Token expiry enforced by JWT exp claim (1 h) in ForgotPasswordJWT
  const token = await ForgotPasswordJWT({ email: userDB.email });

  const siteData = await GetAllSiteData();
  const siteVars = siteDataToVariables(siteData);
  const siteBase = (siteData.siteURL || "").replace(/\/$/, "");
  const forgotPath = serverResolve("/account/forgot");
  const link = `${siteBase}${forgotPath}?view=confirm_token&token=${token}`;

  const template = await GetGeneralEmailTemplateByIdAndLocale("forgot_password", userDB.preferred_locale);
  if (!template) {
    console.error(`forgot-password: email template 'forgot_password' not found for locale '${userDB.preferred_locale}'`);
    return json({ errorKey: "account.forgot.err_send_failed" }, { status: 500 });
  }

  const emailVars = {
    ...siteVars,
    reset_link: link,
  };

  try {
    await sendEmail(
      template.template_html_body || "",
      template.template_subject || "Your Password Reset Request",
      emailVars,
      [email],
      undefined,
      template.template_text_body || "",
    );
    return json({ success: true });
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return json({ errorKey: "account.forgot.err_send_failed" }, { status: 500 });
  }
};
