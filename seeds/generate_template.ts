import subscriptionAccountCodeTemplate from "../src/lib/server/templates/general/subscription_account_code_template.ts";
import incidentUpdateTemplate from "../src/lib/server/templates/general/incident_update_template.ts";
import maintenanceUpdateTemplate from "../src/lib/server/templates/general/maintenance_update_template.ts";
import forgotPasswordTemplate from "../src/lib/server/templates/general/forgot_password_template.ts";
import inviteUserTemplate from "../src/lib/server/templates/general/invite_user_template.ts";
import verifyEmailTemplate from "../src/lib/server/templates/general/verify_email_template.ts";
import type { Knex } from "knex";

export async function seed(knex: Knex): Promise<void> {
  let count = await knex("general_email_templates")
    .where({ template_id: subscriptionAccountCodeTemplate.template_id })
    .count("template_id as CNT")
    .first();
  if (count && count.CNT == 0) {
    await knex("general_email_templates").insert({
      template_id: subscriptionAccountCodeTemplate.template_id,
      template_subject: subscriptionAccountCodeTemplate.template_subject,
      template_html_body: subscriptionAccountCodeTemplate.template_html_body,
      template_text_body: subscriptionAccountCodeTemplate.template_text_body,
    });
  }

  count = await knex("general_email_templates")
    .where({ template_id: incidentUpdateTemplate.template_id })
    .count("template_id as CNT")
    .first();
  if (count && count.CNT == 0) {
    await knex("general_email_templates").insert({
      template_id: incidentUpdateTemplate.template_id,
      template_subject: incidentUpdateTemplate.template_subject,
      template_html_body: incidentUpdateTemplate.template_html_body,
      template_text_body: incidentUpdateTemplate.template_text_body,
    });
  }

  count = await knex("general_email_templates")
    .where({ template_id: maintenanceUpdateTemplate.template_id })
    .count("template_id as CNT")
    .first();
  if (count && count.CNT == 0) {
    await knex("general_email_templates").insert({
      template_id: maintenanceUpdateTemplate.template_id,
      template_subject: maintenanceUpdateTemplate.template_subject,
      template_html_body: maintenanceUpdateTemplate.template_html_body,
      template_text_body: maintenanceUpdateTemplate.template_text_body,
    });
  }

  count = await knex("general_email_templates")
    .where({ template_id: forgotPasswordTemplate.template_id })
    .count("template_id as CNT")
    .first();
  if (count && count.CNT == 0) {
    await knex("general_email_templates").insert({
      template_id: forgotPasswordTemplate.template_id,
      template_subject: forgotPasswordTemplate.template_subject,
      template_html_body: forgotPasswordTemplate.template_html_body,
      template_text_body: forgotPasswordTemplate.template_text_body,
    });
  }

  count = await knex("general_email_templates")
    .where({ template_id: inviteUserTemplate.template_id })
    .count("template_id as CNT")
    .first();
  if (count && count.CNT == 0) {
    await knex("general_email_templates").insert({
      template_id: inviteUserTemplate.template_id,
      template_subject: inviteUserTemplate.template_subject,
      template_html_body: inviteUserTemplate.template_html_body,
      template_text_body: inviteUserTemplate.template_text_body,
    });
  }

  count = await knex("general_email_templates")
    .where({ template_id: verifyEmailTemplate.template_id })
    .count("template_id as CNT")
    .first();
  if (count && count.CNT == 0) {
    await knex("general_email_templates").insert({
      template_id: verifyEmailTemplate.template_id,
      template_subject: verifyEmailTemplate.template_subject,
      template_html_body: verifyEmailTemplate.template_html_body,
      template_text_body: verifyEmailTemplate.template_text_body,
    });
  }
}
