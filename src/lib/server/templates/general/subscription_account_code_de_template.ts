import { buildEmailHtml } from "../emailTemplateFactory.js";

const emailTemplate = buildEmailHtml({
  lang: "de",
  previewText: "Ihr Bestätigungscode für {{site_name}}",
  heading: "Bestätigungscode",
  body: "Um Ihre Anmeldung für {{site_name}} abzuschließen, verwenden Sie bitte den folgenden Bestätigungscode:",
  action: {
    type: "code",
    codeVar: "{{email_code}}",
  },
  footerText:
    "Dieser Code läuft in 5 Minuten ab. Falls Sie diesen Code nicht angefordert haben, können Sie diese E-Mail ignorieren.",
});

export default {
  template_id: "subscription_account_code.de",
  template_subject: "Ihr Abonnement-Bestätigungscode",
  template_html_body: emailTemplate,
  template_text_body: `Ihr Bestätigungscode: {{email_code}}`,
};
