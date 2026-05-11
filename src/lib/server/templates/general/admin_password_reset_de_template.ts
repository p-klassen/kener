import { buildEmailHtml } from "../emailTemplateFactory.js";

const emailTemplate = buildEmailHtml({
  lang: "de",
  previewText: "Ihr Passwort für {{site_name}} wurde von einem Administrator zurückgesetzt",
  heading: "Passwort durch Administrator zurückgesetzt",
  body: "Ein Administrator hat Ihr Passwort für {{site_name}} zurückgesetzt. Begründung: {{reset_reason}}. Bitte melden Sie sich an und ändern Sie Ihr Passwort sofort.",
  action: {
    type: "button",
    buttonText: "Anmelden & Passwort ändern",
    buttonVar: "{{login_link}}",
    urlCaption: "Oder kopieren Sie diese URL in Ihren Browser:",
  },
  footerText:
    "Falls Sie glauben, dass dies irrtümlich geschehen ist, wenden Sie sich bitte an Ihren Administrator. Sie werden aufgefordert, bei der nächsten Anmeldung ein neues Passwort festzulegen.",
});

export default {
  template_id: "admin_password_reset.de",
  template_subject: "{{site_name}} - Ihr Passwort wurde zurückgesetzt",
  template_html_body: emailTemplate,
  template_text_body: `Ihr Passwort für {{site_name}} wurde von einem Administrator zurückgesetzt.\n\nBegründung: {{reset_reason}}\n\nBitte melden Sie sich an und ändern Sie Ihr Passwort sofort:\n\n{{login_link}}\n\nFalls Sie glauben, dass dies irrtümlich geschehen ist, wenden Sie sich bitte an Ihren Administrator.`,
};
