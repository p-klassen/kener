# SMTP Configuration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to configure SMTP settings via the admin dashboard so environment variables are no longer required to send email.

**Architecture:** Add `smtp` key to `site_data` (validated by `IsValidJSONString`), add `GetSMTPConfig()` to `commonController.ts` (ENV first, DB fallback), make `IsEmailSetup` async, add `getSmtpStatus`/`saveSmtpConfig`/`testSmtp` API actions, and add an SMTP card to the templates page.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), TypeScript, Knex.js (`site_data` table), shadcn-svelte, Tailwind CSS v4, nodemailer

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/server/controllers/siteDataKeys.ts` | Modify | Register `smtp` key with `IsValidJSONString` validator |
| `src/lib/server/controllers/commonController.ts` | Modify | Add `GetSMTPConfig()` async function (ENV → DB fallback) |
| `src/lib/server/controllers/emailController.ts` | Modify | Make `IsEmailSetup` async; use `GetSMTPConfig()` in `SendEmailWithTemplate` |
| `src/lib/server/notification/email_notification.ts` | Modify | Await `IsEmailSetup()`; use `await GetSMTPConfig()` instead of `GetSMTPFromENV()` |
| `src/lib/server/controllers/layoutController.ts` | Modify | Await `IsEmailSetup()` |
| `src/routes/(manage)/+layout.server.ts` | Modify | Await `IsEmailSetup()` |
| `src/lib/allPerms.ts` | Modify | Register `getSmtpStatus`, `saveSmtpConfig`, `testSmtp` in `ACTION_PERMISSION_MAP` |
| `src/routes/(manage)/manage/api/+server.ts` | Modify | Implement `getSmtpStatus`, `saveSmtpConfig`, `testSmtp` action handlers |
| `src/routes/(manage)/manage/app/templates/+page.svelte` | Modify | Add SMTP Configuration card above the template editor |

No DB migration needed — `site_data` table already exists.

---

### Task 1: Register `smtp` key and add `GetSMTPConfig`

**Files:**
- Modify: `src/lib/server/controllers/siteDataKeys.ts`
- Modify: `src/lib/server/controllers/commonController.ts`

- [ ] **Step 1: Add `smtp` to `siteDataKeys`**

Open `src/lib/server/controllers/siteDataKeys.ts`. At the end of the `siteDataKeys` array (before the closing `]`), add:

```typescript
  {
    key: "smtp",
    isValid: IsValidJSONString,
    data_type: "object",
  },
```

`IsValidJSONString` is already imported at the top of the file.

- [ ] **Step 2: Add `GetSMTPConfig` to `commonController.ts`**

Open `src/lib/server/controllers/commonController.ts`. At the top, add two imports after the existing imports (lines 1–3):

```typescript
import db from "$lib/server/db/db";
import type { SMTPConfiguration } from "../notification/types.js";
```

Note: `SMTPConfiguration` is already imported at line 42 as `import type { SMTPConfiguration } from "../notification/types"` — check the exact import before adding to avoid a duplicate. If it's already there, only add the `db` import.

Then add this function immediately after `GetSMTPFromENV` (which ends around line 78):

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

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/controllers/siteDataKeys.ts src/lib/server/controllers/commonController.ts
git commit -m "feat: register smtp siteData key and add GetSMTPConfig with ENV→DB fallback"
```

---

### Task 2: Make `IsEmailSetup` async and update email sending paths

**Files:**
- Modify: `src/lib/server/controllers/emailController.ts`
- Modify: `src/lib/server/notification/email_notification.ts`
- Modify: `src/lib/server/controllers/layoutController.ts`
- Modify: `src/routes/(manage)/+layout.server.ts`

- [ ] **Step 1: Update `emailController.ts`**

Open `src/lib/server/controllers/emailController.ts`.

**Change 1** — replace the `GetSMTPFromENV` import (line 11) with `GetSMTPConfig`:

```typescript
import { GetSMTPConfig } from "./commonController.js";
```

**Change 2** — make `IsEmailSetup` async (lines 17–19):

```typescript
export const IsEmailSetup = async (): Promise<boolean> => {
  return !!(await GetSMTPConfig()) || IsResendSetup();
};
```

**Change 3** — in `SendEmailWithTemplate`, replace the synchronous `GetSMTPFromENV()` call (line 46) with an awaited `GetSMTPConfig()`:

```typescript
  let smtpData = await GetSMTPConfig();
```

- [ ] **Step 2: Update `email_notification.ts`**

Open `src/lib/server/notification/email_notification.ts`.

**Change 1** — replace the `GetSMTPFromENV` import (line 7) with `GetSMTPConfig`:

```typescript
import { GetSMTPConfig } from "../controllers/commonController.js";
```

**Change 2** — await `IsEmailSetup` (line 38):

```typescript
    let isEmailSetupDone = await IsEmailSetup();
```

**Change 3** — replace `GetSMTPFromENV()` (line 43) with an awaited call:

```typescript
    let mySMTPData = await GetSMTPConfig();
```

- [ ] **Step 3: Update `layoutController.ts`**

Open `src/lib/server/controllers/layoutController.ts`. Find line 118:

```typescript
  const canSendEmail = IsEmailSetup();
```

Replace with:

```typescript
  const canSendEmail = await IsEmailSetup();
```

- [ ] **Step 4: Update `+layout.server.ts`**

Open `src/routes/(manage)/+layout.server.ts`. Find line 62:

```typescript
    canSendEmail: IsEmailSetup(),
```

Replace with:

```typescript
    canSendEmail: await IsEmailSetup(),
```

- [ ] **Step 5: Run type check**

```bash
npm run check
```

Expected: 0 errors. If there are errors about `IsEmailSetup` not returning a boolean, ensure all call sites use `await`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/controllers/emailController.ts \
        src/lib/server/notification/email_notification.ts \
        src/lib/server/controllers/layoutController.ts \
        "src/routes/(manage)/+layout.server.ts"
git commit -m "feat: make IsEmailSetup async, use GetSMTPConfig in all email sending paths"
```

---

### Task 3: Add `getSmtpStatus`, `saveSmtpConfig`, `testSmtp` API actions

**Files:**
- Modify: `src/lib/allPerms.ts`
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Register permissions in `allPerms.ts`**

Open `src/lib/allPerms.ts`. Find `ACTION_PERMISSION_MAP` (around line 109). Add three entries alongside the other `settings.*` entries (near lines 116–120):

```typescript
  getSmtpStatus: "settings.read",
  saveSmtpConfig: "settings.write",
  testSmtp: "settings.write",
```

- [ ] **Step 2: Add `GetSMTPConfig` import to `manage/api/+server.ts`**

Open `src/routes/(manage)/manage/api/+server.ts`. Add to the existing imports — find the import block that includes `GetSMTPFromENV` or common controller imports and add:

```typescript
import { GetSMTPConfig } from "$lib/server/controllers/commonController.js";
import getSMTPTransport from "$lib/server/notification/smtps.js";
import type { SMTPConfiguration } from "$lib/server/notification/types.js";
```

(Check whether `getSMTPTransport` and `SMTPConfiguration` are already imported — only add what's missing.)

- [ ] **Step 3: Implement the three action handlers**

In `src/routes/(manage)/manage/api/+server.ts`, find the large `if/else if` chain in the `POST` handler. Add the three new branches before the closing `} catch (error)`:

```typescript
    } else if (action === "getSmtpStatus") {
      const fromEnv = !!(process.env.SMTP_HOST);
      const dbRow = await db.getSiteDataByKey("smtp");
      let dbConfig: Omit<SMTPConfiguration, "smtp_pass"> | null = null;
      if (dbRow?.value) {
        try {
          const parsed = JSON.parse(dbRow.value) as SMTPConfiguration;
          const { smtp_pass: _omit, ...rest } = parsed;
          dbConfig = rest;
        } catch {
          dbConfig = null;
        }
      }
      if (fromEnv) {
        // Return ENV fields (no password) for display
        resp = {
          source: "env",
          config: {
            smtp_host: process.env.SMTP_HOST || "",
            smtp_port: Number(process.env.SMTP_PORT) || 587,
            smtp_user: process.env.SMTP_USER || "",
            smtp_sender: process.env.SMTP_FROM_EMAIL || process.env.SMTP_SENDER || "",
            smtp_secure: !!Number(process.env.SMTP_SECURE),
          },
        };
      } else if (dbConfig) {
        resp = { source: "db", config: dbConfig };
      } else {
        resp = { source: "none", config: null };
      }
    } else if (action === "saveSmtpConfig") {
      const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_sender, smtp_secure } = data as {
        smtp_host: string;
        smtp_port: number;
        smtp_user: string;
        smtp_pass: string;
        smtp_sender: string;
        smtp_secure: boolean;
      };
      // Preserve existing password if none provided
      let finalPass = smtp_pass;
      if (!finalPass) {
        const existing = await db.getSiteDataByKey("smtp");
        if (existing?.value) {
          try {
            const parsed = JSON.parse(existing.value) as SMTPConfiguration;
            finalPass = parsed.smtp_pass || "";
          } catch {
            finalPass = "";
          }
        }
      }
      const config: SMTPConfiguration = {
        smtp_host,
        smtp_port: Number(smtp_port) || 587,
        smtp_user,
        smtp_pass: finalPass,
        smtp_sender,
        smtp_secure: !!smtp_secure,
      };
      await InsertKeyValue("smtp", JSON.stringify(config));
      resp = { success: true };
    } else if (action === "testSmtp") {
      const smtpConfig = await GetSMTPConfig();
      if (!smtpConfig) {
        throw new Error("SMTP is not configured");
      }
      const transport = getSMTPTransport(smtpConfig);
      await transport.sendMail({
        from: smtpConfig.smtp_sender,
        to: userDB.email,
        subject: "Kener SMTP test",
        text: "This is a test email from Kener. Your SMTP configuration is working correctly.",
        html: "<p>This is a test email from Kener. Your SMTP configuration is working correctly.</p>",
      });
      resp = { ok: true };
```

- [ ] **Step 4: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/allPerms.ts "src/routes/(manage)/manage/api/+server.ts"
git commit -m "feat: add getSmtpStatus, saveSmtpConfig, testSmtp API actions"
```

---

### Task 4: SMTP Configuration card on the templates page

**Files:**
- Modify: `src/routes/(manage)/manage/app/templates/+page.svelte`

- [ ] **Step 1: Add state variables and load logic to the `<script>` block**

Open `src/routes/(manage)/manage/app/templates/+page.svelte`. Read the current `<script>` block. After the existing state variables (after line ~35), add:

```typescript
  // SMTP state
  interface SmtpConfig {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_pass: string;
    smtp_sender: string;
    smtp_secure: boolean;
  }
  let smtpSource = $state<"env" | "db" | "none">("none");
  let smtpConfig = $state<SmtpConfig>({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    smtp_sender: "",
    smtp_secure: false,
  });
  let savingSmtp = $state(false);
  let testingSmtp = $state(false);
```

Update `onMount` to also load SMTP status:

```typescript
  onMount(() => {
    fetchTemplates();
    fetchSmtpStatus();
  });
```

Add the `fetchSmtpStatus` function (after `fetchTemplates`):

```typescript
  async function fetchSmtpStatus() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getSmtpStatus", data: {} }),
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      smtpSource = result.source;
      if (result.config) {
        smtpConfig = {
          smtp_host: result.config.smtp_host || "",
          smtp_port: result.config.smtp_port || 587,
          smtp_user: result.config.smtp_user || "",
          smtp_pass: "",           // never returned from server
          smtp_sender: result.config.smtp_sender || "",
          smtp_secure: !!result.config.smtp_secure,
        };
      }
    } catch (e) {
      console.error("Failed to load SMTP status", e);
    }
  }
```

Add `saveSmtp` and `testSmtp` functions:

```typescript
  async function saveSmtp() {
    savingSmtp = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveSmtpConfig",
          data: smtpConfig,
        }),
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        smtpSource = "db";
        smtpConfig.smtp_pass = ""; // clear after save
        toast.success("SMTP configuration saved");
      }
    } catch (e) {
      toast.error("Failed to save SMTP configuration");
    } finally {
      savingSmtp = false;
    }
  }

  async function sendTestEmail() {
    testingSmtp = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testSmtp", data: {} }),
      });
      const result = await response.json();
      if (result.error) {
        toast.error(`Test failed: ${result.error}`);
      } else {
        toast.success("Test email sent — check your inbox");
      }
    } catch (e) {
      toast.error("Failed to send test email");
    } finally {
      testingSmtp = false;
    }
  }
```

- [ ] **Step 2: Add required icon imports**

Check whether `EyeIcon`, `EyeOffIcon`, and `Loader` are already imported. Add any missing ones:

```typescript
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Loader from "@lucide/svelte/icons/loader";
  import MailIcon from "@lucide/svelte/icons/mail";
  import SendIcon from "@lucide/svelte/icons/send";
```

Add a local state for the password eye toggle:

```typescript
  let showSmtpPassword = $state(false);
```

- [ ] **Step 3: Add the SMTP card to the HTML**

In the `<div>` or `<main>` that wraps the page content, insert this card **before** the existing template editor card (i.e., it appears at the top of the page):

```svelte
<!-- SMTP Configuration Card -->
<Card.Root>
  <Card.Header class="border-b">
    <Card.Title class="flex items-center gap-2">
      <MailIcon class="h-5 w-5" />
      SMTP Configuration
      {#if smtpSource === "env"}
        <span class="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-normal">ENV active (read-only)</span>
      {:else if smtpSource === "db"}
        <span class="rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900 dark:text-green-300">DB configured</span>
      {:else}
        <span class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-normal text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">Not configured</span>
      {/if}
    </Card.Title>
    <Card.Description>Configure SMTP to send email notifications. Environment variables take precedence over these settings.</Card.Description>
  </Card.Header>
  <Card.Content class="pt-6">
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <Label for="smtp-host">Host</Label>
        <Input
          id="smtp-host"
          bind:value={smtpConfig.smtp_host}
          placeholder="smtp.example.com"
          disabled={smtpSource === "env"}
          class="mt-1"
        />
      </div>
      <div>
        <Label for="smtp-port">Port</Label>
        <Input
          id="smtp-port"
          type="number"
          bind:value={smtpConfig.smtp_port}
          placeholder="587"
          disabled={smtpSource === "env"}
          class="mt-1"
        />
      </div>
      <div>
        <Label for="smtp-user">User</Label>
        <Input
          id="smtp-user"
          bind:value={smtpConfig.smtp_user}
          placeholder="user@example.com"
          autocomplete="username"
          disabled={smtpSource === "env"}
          class="mt-1"
        />
      </div>
      <div>
        <Label for="smtp-pass">Password</Label>
        <div class="relative mt-1">
          <Input
            id="smtp-pass"
            type={showSmtpPassword ? "text" : "password"}
            bind:value={smtpConfig.smtp_pass}
            placeholder={smtpSource === "env" ? "••••••••" : smtpSource === "db" ? "leave blank to keep existing" : ""}
            autocomplete="current-password"
            disabled={smtpSource === "env"}
            class="pr-10"
          />
          {#if smtpSource !== "env"}
            <button
              type="button"
              onclick={() => (showSmtpPassword = !showSmtpPassword)}
              class="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
              tabindex="-1"
              aria-label={showSmtpPassword ? "Hide password" : "Show password"}
            >
              {#if showSmtpPassword}
                <EyeOff class="h-4 w-4" />
              {:else}
                <Eye class="h-4 w-4" />
              {/if}
            </button>
          {/if}
        </div>
      </div>
      <div>
        <Label for="smtp-sender">Sender Email</Label>
        <Input
          id="smtp-sender"
          type="email"
          bind:value={smtpConfig.smtp_sender}
          placeholder="noreply@example.com"
          disabled={smtpSource === "env"}
          class="mt-1"
        />
      </div>
      <div class="flex items-center gap-2 pt-6">
        <input
          id="smtp-secure"
          type="checkbox"
          bind:checked={smtpConfig.smtp_secure}
          disabled={smtpSource === "env"}
          class="h-4 w-4"
        />
        <Label for="smtp-secure">TLS (port 465)</Label>
      </div>
    </div>
    <div class="mt-4 flex items-center gap-2">
      <Button
        onclick={saveSmtp}
        disabled={savingSmtp || smtpSource === "env"}
        size="sm"
      >
        {#if savingSmtp}
          <Loader class="mr-2 h-4 w-4 animate-spin" />
        {/if}
        Save
      </Button>
      <Button
        onclick={sendTestEmail}
        disabled={testingSmtp || smtpSource === "none"}
        variant="outline"
        size="sm"
      >
        {#if testingSmtp}
          <Loader class="mr-2 h-4 w-4 animate-spin" />
        {:else}
          <SendIcon class="mr-2 h-4 w-4" />
        {/if}
        Send test email
      </Button>
    </div>
  </Card.Content>
</Card.Root>
```

- [ ] **Step 4: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(manage)/manage/app/templates/+page.svelte"
git commit -m "feat: add SMTP configuration card to templates page"
```

---

## Self-Review Checklist (completed inline)

**Spec coverage:**
- ✅ `smtp` key registered in `siteDataKeys.ts`
- ✅ `GetSMTPConfig()` with ENV→DB fallback
- ✅ `IsEmailSetup` made async, all 3 callers updated
- ✅ `email_notification.ts` updated to use `GetSMTPConfig()`
- ✅ `getSmtpStatus` returns source + config (no password)
- ✅ `saveSmtpConfig` preserves existing password when blank
- ✅ `testSmtp` sends to logged-in admin's email
- ✅ Status badge shows ENV/DB/none
- ✅ Fields disabled when ENV active, save button disabled when ENV active
- ✅ Password field: eye toggle, placeholder hints, blank = keep existing
- ✅ Test email button disabled when not configured

**Type consistency:** `SmtpConfig` interface in the page matches `SMTPConfiguration` from `types.ts` — all field names match. `getSmtpStatus` returns `smtp_secure: boolean` and the UI state uses `boolean`. `saveSmtpConfig` sends `smtp_port: number` and the handler calls `Number(smtp_port)` as a safety cast.

**No placeholders:** All code blocks are complete.
