import {
  GetMinuteStartNowTimestampUTC,
  GetMinuteStartTimestampUTC,
  GetNowTimestampUTC,
  ReplaceAllOccurrences,
  ValidateEmail,
} from "../tool.js";
import { Resend } from "resend";
import getSMTPTransport from "../notification/smtps.js";

import { GetResendConfig, GetSMTPConfig } from "./commonController.js";

export const IsResendSetup = async (): Promise<boolean> => {
  return !!(await GetResendConfig());
};

export const IsEmailSetup = async (): Promise<boolean> => {
  return !!(await GetSMTPConfig()) || !!(await GetResendConfig());
};

export const SendEmailWithTemplate = async (
  template: string,
  data: Record<string, string>,
  email: string,
  subject: string,
  emailText: string,
): Promise<unknown> => {
  for (const key in data) {
    if (Object.hasOwnProperty.call(data, key)) {
      const value = data[key];
      template = ReplaceAllOccurrences(template, `{{${key}}}`, value);
    }
  }

  const smtpData = await GetSMTPConfig();

  try {
    if (smtpData) {
      const transporter = getSMTPTransport(smtpData);
      return await transporter.sendMail({
        from: smtpData.smtp_sender,
        to: email,
        subject,
        html: template,
        text: emailText,
      });
    } else {
      const resendConfig = await GetResendConfig();
      if (!resendConfig) throw new Error("No email provider configured");
      const resend = new Resend(resendConfig.resend_api_key);
      return await resend.emails.send({
        from: resendConfig.resend_sender_email,
        to: [email],
        subject,
        html: template,
        text: emailText,
      });
    }
  } catch (error) {
    console.error("Error sending email", error);
    throw new Error("Error sending email");
  }
};
