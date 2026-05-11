import { buildEmailHtml } from "../emailTemplateFactory.js";

const emailTemplate = buildEmailHtml({
  lang: "de",
  previewText: "Sie wurden zu {{site_name}} eingeladen",
  heading: "Sie sind eingeladen!",
  body: "Sie wurden zu {{site_name}} eingeladen. Klicken Sie auf den Link unten, um Ihre Einladung anzunehmen und Ihr Konto einzurichten:",
  action: {
    type: "button",
    buttonText: "Einladung annehmen",
    buttonVar: "{{invitation_link}}",
    urlCaption: "Oder kopieren Sie diese URL in Ihren Browser:",
  },
  footerText:
    "Dieser Einladungslink läuft in 7 Tagen ab. Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.",
});

export default {
  template_id: "invite_user.de",
  template_subject: "{{site_name}} - Sie wurden eingeladen!",
  template_html_body: emailTemplate,
  template_text_body: `Sie wurden zu {{site_name}} eingeladen\n\nSie wurden zu {{site_name}} eingeladen. Klicken Sie auf den Link unten, um Ihre Einladung anzunehmen und Ihr Konto einzurichten:\n\n{{invitation_link}}\n\nDieser Einladungslink läuft in 7 Tagen ab. Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.`,
};
