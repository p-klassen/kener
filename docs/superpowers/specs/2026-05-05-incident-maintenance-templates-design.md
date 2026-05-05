# Incident/Maintenance Email Templates — Design Spec

**Date:** 2026-05-05

## Overview

Replace the single `subscription_update` email template (used for all subscriber notifications) with two separate DB-backed templates: `incident_update` and `maintenance_update`. Both are editable via the existing admin Templates page.

---

## Scope

- Subscriber notification emails only — no changes to alert emails, password-reset emails, or invite emails.
- No new UI pages or components; the existing Templates page already renders all DB templates dynamically.
- No per-monitor filtering (out of scope).

---

## Storage

Both templates are added to `general_email_templates` via `seeds/generate_template.ts` using the existing insert-if-missing pattern: count the rows by `template_id`, insert only if count is 0. This matches all other template seeds in the file.

**`incident_update`** — sent when an alert-triggered or manually-created incident fires a subscriber notification.

**`maintenance_update`** — sent for all maintenance lifecycle events: created, starting-soon reminder, ongoing, completed.

`subscription_update` is removed from seeds so it no longer appears on fresh installs. Existing installations keep the DB row but it is no longer used by the queue — no migration needed.

---

## Queue Routing

**File:** `src/lib/server/queues/subscriberQueue.ts`

Replace the hardcoded `"subscription_update"` lookup with a branch on `event_type`:

```typescript
const templateId =
  variables.event_type === "incidents" ? "incident_update" : "maintenance_update";
const template = await GetGeneralEmailTemplateById(templateId);
```

If the template row is missing from the DB (e.g. accidentally deleted), the queue throws and the job fails — same behaviour as today when `subscription_update` is missing.

---

## Default Template Content

Both templates default to the same HTML/text structure as the current `subscription_update` seed. The subject line is `{{update_subject}}`. The body uses the full site-branded layout with logo, title, update body, and CTA button.

---

## Available Mustache Variables

The following variables are available in both templates:

| Variable | Source | Description |
|---|---|---|
| `{{site_name}}` | site data | Name of the status page |
| `{{site_logo_url}}` | site data | Absolute URL of the site logo |
| `{{site_url}}` | site data | Base URL of the status page |
| `{{title}}` | notification | Notification heading (e.g. "API Down") |
| `{{update_text}}` | notification | Pre-rendered HTML body (markdown → HTML) |
| `{{update_subject}}` | notification | Subject line text (also used as email preview) |
| `{{cta_url}}` | notification | Link to the incident or maintenance detail page |
| `{{cta_text}}` | notification | CTA button label (e.g. "View Incident") |

`update_text` is already rendered HTML — Mustache triple-stash `{{{update_text}}}` must be used in the HTML body to avoid double-escaping.

---

## UI

No changes to the Templates page. `incident_update` and `maintenance_update` appear automatically in the template selector alongside existing templates. The page formats template IDs into human-readable labels ("Incident Update", "Maintenance Update").

---

## Constraints

- `subscription_update` is not deleted from existing installs. Any admin who previously customised it will see their edits preserved in the DB but no longer applied to outgoing emails.
- Template content is Mustache only — no Handlebars, no Jinja, no logic beyond `{{#section}}` blocks.
- `update_text` contains pre-rendered HTML and must be output with triple-stash `{{{update_text}}}`.
