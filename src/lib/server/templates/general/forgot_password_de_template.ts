import { buildEmailHtml } from "../emailTemplateFactory.js";

const emailTemplate = buildEmailHtml({
  lang: "de",
  previewText: "Passwort für {{site_name}} zurücksetzen",
  heading: "Passwort zurücksetzen",
  body: "Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts für {{site_name}} erhalten. Klicken Sie auf die Schaltfläche unten, um ein neues Passwort zu erstellen:",
  action: {
    type: "button",
    buttonText: "Passwort zurücksetzen",
    buttonVar: "{{reset_link}}",
    urlCaption: "Oder kopieren Sie diese URL in Ihren Browser:",
  },
  footerText:
    "Dieser Link läuft in 5 Minuten ab. Falls Sie keine Passwortzurücksetzung angefordert haben, können Sie diese E-Mail ignorieren.",
});

export default {
  template_id: "forgot_password.de",
  template_subject: "{{site_name}} - Passwort zurücksetzen",
  template_html_body: emailTemplate,
  template_text_body: `Passwort zurücksetzen für {{site_name}}\n\nWir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Klicken Sie auf den Link unten, um ein neues Passwort zu erstellen:\n\n{{reset_link}}\n\nDieser Link läuft in 5 Minuten ab. Falls Sie keine Passwortzurücksetzung angefordert haben, können Sie diese E-Mail ignorieren.`,
};
