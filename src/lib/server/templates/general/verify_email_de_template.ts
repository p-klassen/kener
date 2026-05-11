import { buildEmailHtml } from "../emailTemplateFactory.js";

const emailTemplate = buildEmailHtml({
  lang: "de",
  previewText: "E-Mail-Adresse für {{site_name}} bestätigen",
  heading: "E-Mail-Adresse bestätigen",
  body: "Bitte bestätigen Sie Ihre E-Mail-Adresse für {{site_name}}, indem Sie auf den Link unten klicken:",
  action: {
    type: "button",
    buttonText: "E-Mail bestätigen",
    buttonVar: "{{verification_link}}",
    urlCaption: "Oder kopieren Sie diese URL in Ihren Browser:",
  },
  footerText: "Falls Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren.",
});

export default {
  template_id: "verify_email.de",
  template_subject: "{{site_name}} - E-Mail-Adresse bestätigen",
  template_html_body: emailTemplate,
  template_text_body: `E-Mail-Adresse bestätigen für {{site_name}}\n\nBitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf den Link unten klicken:\n\n{{verification_link}}\n\nFalls Sie dies nicht angefordert haben, können Sie diese E-Mail ignorieren.`,
};
