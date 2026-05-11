import { GetRequiredSecrets, ReplaceAllOccurrences } from "../tool.js";
import Mustache from "mustache";
import striptags from "striptags";
import { Resend, type CreateEmailOptions } from "resend";
import type { SMTPConfiguration } from "./types.js";
import getSMTPTransport from "./smtps.js";
import { GetResendConfig, GetSMTPConfig } from "../controllers/commonController.js";

export default async function send(
  emailBody: string,
  emailSubject: string,
  variables: Record<string, string | number | boolean>,
  to: string[],
  from?: string,
  emailTextBody?: string,
) {
  // Implementation for sending email notification using the provided triggerRecord, variables, and template

  let envSecretsTemplate = GetRequiredSecrets(emailBody + emailSubject + (emailTextBody || ""));

  for (let i = 0; i < envSecretsTemplate.length; i++) {
    const secret = envSecretsTemplate[i];
    if (secret.replace !== undefined) {
      emailBody = ReplaceAllOccurrences(emailBody, secret.find, secret.replace);
      emailSubject = ReplaceAllOccurrences(emailSubject, secret.find, secret.replace);
      if (emailTextBody !== undefined) {
        emailTextBody = ReplaceAllOccurrences(emailTextBody, secret.find, secret.replace);
      }
    }
  }

  const subject = Mustache.render(emailSubject, variables);
  const htmlBody = Mustache.render(emailBody, variables);
  const textBody = emailTextBody ? Mustache.render(emailTextBody, variables) : striptags(htmlBody);

  try {
    let mySMTPData = await GetSMTPConfig();
    let resendConfig = await GetResendConfig();
    if (!mySMTPData && !resendConfig) {
      throw new Error("Email not configured properly. Please check SMTP or Resend configuration.");
    }
    if (mySMTPData) {
      const transport = getSMTPTransport(mySMTPData as SMTPConfiguration);
      return await transport.sendMail({
        from: from || mySMTPData.smtp_sender,
        to,
        subject,
        text: textBody,
        html: htmlBody,
      });
    } else if (resendConfig) {
      const resend = new Resend(resendConfig.resend_api_key);
      const emailOptions: CreateEmailOptions = {
        from: from || resendConfig.resend_sender_email,
        to,
        subject,
        html: htmlBody,
        text: textBody,
      };
      const resp = await resend.emails.send(emailOptions);
      if (resp.error) {
        throw new Error(`Resend API error: ${resp.error.message}`);
      }
      return resp;
    } else {
      throw new Error("No valid email configuration found. Please check your SMTP or Resend settings.");
    }
  } catch (error) {
    console.error("Error sending email", error);
    throw error;
  }
}
