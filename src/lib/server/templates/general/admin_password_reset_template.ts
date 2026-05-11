import { buildEmailHtml } from "../emailTemplateFactory.js";

const emailTemplate = buildEmailHtml({
  lang: "en",
  previewText: "Your {{site_name}} password has been reset by an administrator",
  heading: "Password Reset by Administrator",
  body: "An administrator has reset your password for {{site_name}}. Reason: {{reset_reason}}. Please log in and change your password immediately.",
  action: {
    type: "button",
    buttonText: "Log In & Change Password",
    buttonVar: "{{login_link}}",
    urlCaption: "Or copy and paste this URL into your browser:",
  },
  footerText:
    "If you believe this was done in error, please contact your administrator. You will be required to set a new password upon login.",
});

export default {
  template_id: "admin_password_reset",
  template_subject: "{{site_name}} - Your Password Has Been Reset",
  template_html_body: emailTemplate,
  template_text_body: `Your password for {{site_name}} has been reset by an administrator.\n\nReason: {{reset_reason}}\n\nPlease log in and change your password immediately:\n\n{{login_link}}\n\nIf you believe this was done in error, please contact your administrator.`,
};
