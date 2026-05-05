# SMTP Configuration UI — Design Spec

**Date:** 2026-05-05

## Overview

Allow admins to configure SMTP settings via the admin dashboard instead of requiring environment variables. Environment variables take precedence over the DB-stored configuration; the UI acts as a fallback when env vars are not set.

---

## Scope

- Applies to the existing email sending flow only — no new notification channels.
- When ENV vars are active, the UI fields are read-only and no save is possible.
- One SMTP config at a time (no multiple accounts).

---

## Storage

**Key:** `smtp` in the existing `site_data` table.

**Shape:**
```json
{
  "smtp_host": "smtp.example.com",
  "smtp_port": 587,
  "smtp_user": "user@example.com",
  "smtp_pass": "secret",
  "smtp_sender": "noreply@example.com",
  "smtp_secure": false
}
```

Registered in `src/lib/server/siteDataKeys.ts` with `IsValidJSONString` validator — same pattern as `font`.

The TypeScript type for this config is the existing `SMTPConfiguration` interface from `src/lib/server/notification/types.ts`.

---

## Priority Logic

**File:** `src/lib/server/controllers/commonController.ts`

New exported function `GetSMTPConfig`:

```typescript
export const GetSMTPConfig = async (): Promise<SMTPConfiguration | null> => {
  const fromEnv = GetSMTPFromENV();
  if (fromEnv) return fromEnv;
  const row = await db.getSiteDataByKey("smtp");
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as SMTPConfiguration;
  } catch {
    return null;
  }
};
```

`emailController.ts` is updated to call `GetSMTPConfig()` (async) instead of the synchronous `GetSMTPFromENV()`.

`IsEmailSetup` becomes async:
```typescript
export const IsEmailSetup = async (): Promise<boolean> => {
  return !!(await GetSMTPConfig()) || IsResendSetup();
};
```

All three callers of `IsEmailSetup` are already in `async` contexts and simply gain an `await`:
- `src/lib/server/notification/email_notification.ts:38` — `async function send`
- `src/lib/server/controllers/layoutController.ts:118` — `async function GetLayoutServerData`
- `src/routes/(manage)/+layout.server.ts:62` — `async load` function

`src/lib/server/notification/email_notification.ts` also calls `GetSMTPFromENV()` directly and must be updated to call `await GetSMTPConfig()` instead.

---

## New API Action: `testSmtp`

**File:** `src/routes/(manage)/manage/api/+server.ts`

Action name: `testSmtp`

- Requires `settings.write` permission.
- Calls `GetSMTPConfig()` to get the active SMTP configuration.
- If no config: returns `{ error: "SMTP is not configured" }`.
- Sends a test email to the logged-in admin's email address using the existing `SendEmailWithTemplate` (or directly via `getSMTPTransport`).
- Returns `{ ok: true }` on success or `{ error: "..." }` on failure.

---

## Admin UI

**File:** `src/routes/(manage)/manage/app/templates/+page.svelte`

A new "SMTP Configuration" card is added at the top of the page, above the existing template editor card.

**Status badge** (computed from API response):
- `"ENV active (read-only)"` — when `SMTP_HOST` env var is set
- `"DB configured"` — when DB config is active
- `"Not configured"` — when neither

**Fields** (disabled when ENV is active):
- Host (`smtp_host`) — text input
- Port (`smtp_port`) — number input, default `587`
- User (`smtp_user`) — text input, `autocomplete="username"`
- Password (`smtp_pass`) — password input with eye toggle, `autocomplete="current-password"`
- Sender Email (`smtp_sender`) — email input
- TLS (`smtp_secure`) — checkbox

**Buttons:**
- **Save** — calls `storeSiteData({ smtp: JSON.stringify({...}) })`. Disabled when ENV is active.
- **Send test email** — calls `testSmtp` action; shows success/error toast. Available whenever SMTP is configured (ENV or DB).

**Loading:** On mount, calls `getSmtpStatus` to load the current configuration and determine the source. The response populates all fields except `smtp_pass` (which is never returned). The password field starts empty; leaving it empty on save preserves the existing stored password.

---

## New API Action: `getSmtpStatus`

**File:** `src/routes/(manage)/manage/api/+server.ts`

Action name: `getSmtpStatus`

- Requires `settings.read` permission.
- Returns:
  ```json
  {
    "source": "env" | "db" | "none",
    "config": { "smtp_host": "...", "smtp_port": 587, "smtp_user": "...", "smtp_sender": "...", "smtp_secure": false }
  }
  ```
- **Never returns `smtp_pass`** — the password is write-only from the UI perspective. When ENV is active, the fields are shown with placeholder text `"••••••••"` (not the actual password).

---

## Constraints

- `smtp_pass` is stored in plaintext in the DB — acceptable for a self-hosted application where the admin has full DB access.
- `smtp_pass` is never returned from the API. On page load, the password field is empty; saving with an empty password field preserves the stored password (server-side: merge with existing record).
- If `smtp_pass` is empty on save, the server reads the current stored value and keeps it unchanged.
