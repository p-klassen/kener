# Incident/Maintenance Email Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `subscription_update` template with two separate DB-backed templates (`incident_update`, `maintenance_update`) so admins can style incident and maintenance notification emails independently.

**Architecture:** Create two new template source files (same default HTML as `subscription_update`), register them in the seed file (removing the `subscription_update` seed block), then route `subscriberQueue.ts` to pick the template by `event_type`. No DB migration, no UI changes.

**Tech Stack:** TypeScript, Knex.js (seed), BullMQ (queue), Mustache (template rendering)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/server/templates/general/incident_update_template.ts` | Create | Default HTML/text template for incident notifications |
| `src/lib/server/templates/general/maintenance_update_template.ts` | Create | Default HTML/text template for maintenance notifications |
| `seeds/generate_template.ts` | Modify | Register the two new templates; remove `subscription_update` seed block |
| `src/lib/server/queues/subscriberQueue.ts` | Modify | Route template lookup by `event_type` |

---

### Task 1: Create the two new template source files

**Files:**
- Create: `src/lib/server/templates/general/incident_update_template.ts`
- Create: `src/lib/server/templates/general/maintenance_update_template.ts`

Both files use the same HTML layout as the existing `subscription_update_template.ts`. The only difference is the `template_id` field. Admins can customise content via the Templates page after first install.

- [ ] **Step 1: Create `incident_update_template.ts`**

Create `src/lib/server/templates/general/incident_update_template.ts` with this exact content:

```typescript
const emailTemplate = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <link rel="preload" as="image" href="{{site_logo_url}}" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body
    style="
      background-color: rgb(243, 244, 246);
      font-family:
        ui-sans-serif, system-ui, sans-serif, &quot;Apple Color Emoji&quot;,
        &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;;
      padding-top: 40px;
      padding-bottom: 40px;
    "
  >
    <!--$-->
    <div
      style="
        display: none;
        overflow: hidden;
        line-height: 1px;
        opacity: 0;
        max-height: 0;
        max-width: 0;
      "
    >
      {{title}}
    </div>
    <table
      align="center"
      width="100%"
      border="0"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        max-width: 600px;
        margin-left: auto;
        margin-right: auto;
        background-color: rgb(255, 255, 255);
        border-radius: 8px;
        overflow: hidden;
      "
    >
      <tbody>
        <tr style="width: 100%">
          <td>
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="
                background-color: #e4e5ec;
                padding-left: 24px;
                padding-right: 24px;
                padding-top: 24px;
                padding-bottom: 24px;
              "
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      align="center"
                      width="100%"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                    >
                      <tbody style="width: 100%">
                        <tr style="width: 100%">
                          <td data-id="__react-email-column" style="text-align: center">
                            <img
                              alt="{{site_name}}"
                              src="{{site_logo_url}}"
                              style="
                                height: auto;
                                display: block;
                                outline: none;
                                border: none;
                                text-decoration: none;
                                margin-left: auto;
                                margin-right: auto;
                              "
                              width="80"
                            />
                            <p
                              style="
                                font-size: 20px;
                                font-weight: bold;
                                color: #191919;
                                margin: 8px 0 0 0;
                                text-align: center;
                              "
                            >
                              {{site_name}}
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="
                padding-left: 24px;
                padding-right: 24px;
                padding-top: 32px;
                padding-bottom: 32px;
              "
            >
              <tbody>
                <tr>
                  <td>
                    <h1
                      style="
                        font-size: 24px;
                        font-weight: 700;
                        color: rgb(31, 41, 55);
                        margin-bottom: 16px;
                      "
                    >
                      {{title}}
                    </h1>
                    <p
                      style="
                        font-size: 16px;
                        color: rgb(55, 65, 81);
                        margin-bottom: 16px;
                        line-height: 24px;
                        margin-top: 16px;
                      "
                    >
                      Dear Valued Customer,
                    </p>
                    <p
                      style="
                        font-size: 16px;
                        color: rgb(55, 65, 81);
                        margin-bottom: 16px;
                        line-height: 24px;
                        margin-top: 16px;
                      "
                    >
                      We would like to provide you with an update regarding the current system
                      status.
                    </p>
                    <p
                      style="
                        font-size: 16px;
                        color: rgb(55, 65, 81);
                        margin-bottom: 16px;
                        line-height: 24px;
                        margin-top: 16px;
                      "
                    >
                      {{{update_text}}}
                    </p>

                    <a
                      href="{{cta_url}}"
                      style="
                        background-color: rgb(22, 163, 74);
                        color: rgb(255, 255, 255);
                        font-weight: 700;
                        padding-top: 12px;
                        padding-bottom: 12px;
                        padding-left: 24px;
                        padding-right: 24px;
                        border-radius: 4px;
                        font-size: 16px;
                        text-decoration-line: none;
                        text-align: center;
                        display: block;
                        box-sizing: border-box;
                        line-height: 100%;
                        text-decoration: none;
                        max-width: 100%;
                        mso-padding-alt: 0px;
                        padding: 12px 24px 12px 24px;
                      "
                      target="_blank"
                      ><span
                        ><!--[if mso
                          ]><i style="mso-font-width: 400%; mso-text-raise: 18" hidden
                            >&#8202;&#8202;&#8202;</i
                          ><!
                        [endif]--></span
                      ><span
                        style="
                          max-width: 100%;
                          display: inline-block;
                          line-height: 120%;
                          mso-padding-alt: 0px;
                          mso-text-raise: 9px;
                        "
                        >{{cta_text}}</span
                      ><span
                        ><!--[if mso
                          ]><i style="mso-font-width: 400%" hidden
                            >&#8202;&#8202;&#8202;&#8203;</i
                          ><!
                        [endif]--></span
                      ></a
                    >
                  </td>
                </tr>
              </tbody>
            </table>
            <hr
              style="
                border-top-width: 1px;
                border-color: rgb(209, 213, 219);
                margin-top: 8px;
                margin-bottom: 8px;
                width: 100%;
                border: none;
                border-top: 1px solid #eaeaea;
              "
            />
            <footer>
              <p style="text-align: center; color: #6b7280; font-size: 16px; margin: 24px 0 0 0">
                Thank you,<br />The {{site_name}} Team
              </p>
            </footer>
            <div style="height: 32px"></div>
          </td>
        </tr>
      </tbody>
    </table>
    <!--7--><!--/$-->
  </body>
</html>`;

export default {
  template_id: "incident_update",
  template_subject: "{{update_subject}}",
  template_html_body: emailTemplate,
  template_text_body: `{{update_text}}`,
};
```

- [ ] **Step 2: Create `maintenance_update_template.ts`**

Create `src/lib/server/templates/general/maintenance_update_template.ts` with identical content to Step 1 except the final export object:

```typescript
export default {
  template_id: "maintenance_update",
  template_subject: "{{update_subject}}",
  template_html_body: emailTemplate,
  template_text_body: `{{update_text}}`,
};
```

(The `emailTemplate` HTML string is identical to Step 1 — copy it in full.)

- [ ] **Step 3: Verify type check passes**

```bash
npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/templates/general/incident_update_template.ts \
        src/lib/server/templates/general/maintenance_update_template.ts
git commit -m "feat: add incident_update and maintenance_update email template source files"
```

---

### Task 2: Register new templates in seeds, remove subscription_update seed block

**Files:**
- Modify: `seeds/generate_template.ts`

The seed file currently imports and inserts `subscription_update`. Replace that block with two blocks for the new templates. The `subscription_update` row in existing installs is unaffected (no deletion, no migration).

- [ ] **Step 1: Replace the seed file contents**

Replace the entire contents of `seeds/generate_template.ts` with:

```typescript
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
```

- [ ] **Step 2: Verify type check passes**

```bash
npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 3: Commit**

```bash
git add seeds/generate_template.ts
git commit -m "feat: register incident_update and maintenance_update in seeds, drop subscription_update seed block"
```

---

### Task 3: Route subscriberQueue template lookup by event_type

**Files:**
- Modify: `src/lib/server/queues/subscriberQueue.ts:41-44`

Currently line 41 hardcodes `"subscription_update"`. Replace with a branch on `variables.event_type`.

- [ ] **Step 1: Update the template lookup**

In `src/lib/server/queues/subscriberQueue.ts`, replace:

```typescript
      const template = await GetGeneralEmailTemplateById("subscription_update");
      if (!template) {
        throw new Error("Subscription email template not found");
      }
```

With:

```typescript
      const templateId =
        variables.event_type === "incidents" ? "incident_update" : "maintenance_update";
      const template = await GetGeneralEmailTemplateById(templateId);
      if (!template) {
        throw new Error(`Email template not found: ${templateId}`);
      }
```

- [ ] **Step 2: Verify type check passes**

```bash
npm run check 2>&1 | tail -4
```

Expected: `svelte-check found 0 errors`

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/queues/subscriberQueue.ts
git commit -m "feat: route subscriber notification emails to incident_update or maintenance_update template by event type"
```
