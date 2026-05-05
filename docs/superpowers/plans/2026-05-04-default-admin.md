# Default Administrator + Forced Password Change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Kener to start with a pre-configured admin account (via env vars) that is forced to change its password on first login.

**Architecture:** Add a `must_change_password` DB column; startup logic reads env vars and inserts the admin if no users exist; the sign-in action redirects flagged users to a new `/account/change-password` route; the `(manage)` layout guards against bypass; the change-password action clears the flag on success.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), TypeScript, Knex.js, bcrypt, shadcn-svelte

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `migrations/20260504130000_add_must_change_password.ts` | Create | DB migration — adds `must_change_password` column |
| `src/lib/server/types/db.ts` | Modify | Add field to `UserRecord`, `UserRecordInsert`, `UserRecordPublic` |
| `src/lib/server/db/repositories/users.ts` | Modify | Include field in selects + inserts; add `updateMustChangePassword` |
| `src/lib/server/db/dbimpl.ts` | Modify | Expose `updateMustChangePassword` on the db facade |
| `src/lib/server/controllers/userController.ts` | Modify | Extend `CreateFirstUser` to accept + persist `must_change_password` |
| `scripts/main.ts` | Modify | Auto-create admin from `KENER_ADMIN_EMAIL`/`KENER_ADMIN_PASSWORD` env vars |
| `src/routes/(account)/account/signin/+page.server.ts` | Modify | Redirect to `/account/change-password` if flag is set after login |
| `src/routes/(manage)/+layout.server.ts` | Modify | Block access to all manage routes if flag is set |
| `src/routes/(account)/account/change-password/+page.server.ts` | Create | Load guard + `change` action |
| `src/routes/(account)/account/change-password/+page.svelte` | Create | Two-field password form (matches invitation page style) |

---

### Task 1: DB Migration + Type + Repository Updates

**Files:**
- Create: `migrations/20260504130000_add_must_change_password.ts`
- Modify: `src/lib/server/types/db.ts`
- Modify: `src/lib/server/db/repositories/users.ts`
- Modify: `src/lib/server/db/dbimpl.ts`

- [ ] **Step 1: Create the migration file**

Create `migrations/20260504130000_add_must_change_password.ts`:

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.integer("must_change_password").notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("must_change_password");
  });
}
```

- [ ] **Step 2: Run the migration and verify the column exists**

```bash
npm run migrate
```

Expected output: `Batch 1 run: 1 migrations` (or the next batch number). If using SQLite, verify with:

```bash
node -e "const k=require('./knexfile.js'); const knex=require('knex')(k); knex('users').columnInfo().then(c=>console.log(Object.keys(c))).finally(()=>knex.destroy())"
```

Expected: `must_change_password` appears in the column list.

- [ ] **Step 3: Add `must_change_password` to the TypeScript types**

In `src/lib/server/types/db.ts`, add `must_change_password: number;` to all three user interfaces:

```typescript
// UserRecord (line ~235)
export interface UserRecord {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  is_active: number;
  is_verified: number;
  must_change_password: number;   // ← add
  role_ids: string[];
  created_at: Date;
  updated_at: Date;
}

// UserRecordInsert (line ~247)
export interface UserRecordInsert {
  email: string;
  name: string;
  password_hash: string;
  role_ids: string[];
  is_active?: number;
  is_verified?: number;
  is_owner?: string;
  must_change_password?: number;  // ← add
}

// UserRecordPublic (line ~257)
export interface UserRecordPublic {
  id: number;
  email: string;
  name: string;
  is_active: number;
  is_verified: number;
  is_owner: string;
  must_change_password: number;   // ← add
  role_ids: string[];
  created_at: Date;
  updated_at: Date;
}
```

- [ ] **Step 4: Update the users repository**

In `src/lib/server/db/repositories/users.ts`, make three changes:

**4a. Add `"must_change_password"` to `userColumns`** (line ~23):

```typescript
private readonly userColumns = [
  "id",
  "email",
  "name",
  "is_active",
  "is_verified",
  "is_owner",
  "must_change_password",
  "created_at",
  "updated_at",
] as const;
```

**4b. Add `must_change_password` to `insertData` inside `insertUser`** (line ~86):

```typescript
const insertData = {
  email: data.email,
  name: data.name,
  password_hash: data.password_hash,
  is_owner: data.is_owner || "NO",
  must_change_password: data.must_change_password ?? 0,
  created_at: this.knex.fn.now(),
  updated_at: this.knex.fn.now(),
};
```

**4c. Add the `updateMustChangePassword` method** after `updateUserPassword` (line ~120):

```typescript
async updateMustChangePassword(id: number, value: 0 | 1): Promise<number> {
  return await this.knex("users").where({ id }).update({
    must_change_password: value,
    updated_at: this.knex.fn.now(),
  });
}
```

- [ ] **Step 5: Expose `updateMustChangePassword` on the db facade**

In `src/lib/server/db/dbimpl.ts`, add the declaration in the Users section (~line 117):

```typescript
updateMustChangePassword!: UsersRepository["updateMustChangePassword"];
```

And in the `init` method (~line 516), add the binding alongside `updateUserPassword`:

```typescript
this.updateMustChangePassword = this.users.updateMustChangePassword.bind(this.users);
```

- [ ] **Step 6: Run type check**

```bash
npm run check
```

Expected: no new type errors related to `must_change_password`.

- [ ] **Step 7: Commit**

```bash
git add migrations/20260504130000_add_must_change_password.ts \
        src/lib/server/types/db.ts \
        src/lib/server/db/repositories/users.ts \
        src/lib/server/db/dbimpl.ts
git commit -m "feat: add must_change_password column to users + types + repository"
```

---

### Task 2: Extend `CreateFirstUser` + Startup Admin Creation

**Files:**
- Modify: `src/lib/server/controllers/userController.ts`
- Modify: `scripts/main.ts`

- [ ] **Step 1: Update `CreateFirstUser` signature and body**

In `src/lib/server/controllers/userController.ts`, change the `CreateFirstUser` function (line 197):

```typescript
export const CreateFirstUser = async (data: {
  email: string;
  name: string;
  password: string;
  must_change_password?: number;
}): Promise<number[]> => {
  const normalizedEmail = validateEmailOrThrow(data.email);
  const normalizedName = validateNameOrThrow(data.name);
  if (!data.password) {
    throw new Error("Password cannot be empty");
  }
  if (!ValidatePassword(data.password)) {
    throw new Error(
      "Password must contain at least one digit, one lowercase letter, one uppercase letter, and have a minimum length of 8 characters",
    );
  }
  const user = {
    email: normalizedEmail,
    password_hash: await HashPassword(data.password),
    name: normalizedName,
    role_ids: ["admin"],
    is_owner: "YES",
    must_change_password: data.must_change_password ?? 0,
  };
  return await db.insertUser(user);
};
```

- [ ] **Step 2: Add default admin creation to `scripts/main.ts`**

In `scripts/main.ts`, add the import at the top alongside other imports:

```typescript
import { CreateFirstUser } from "../src/lib/server/controllers/userController.ts";
import dbInstance from "../src/lib/server/db/db.ts";
```

Note: `dbInstance` is already imported as `dbInstance` — use the existing import. Then inside `app.listen(PORT, async () => { ... })`, after `await runSeed()` and before `await db.destroy()`, add:

```typescript
// Auto-create default admin from environment variables (only when DB has zero users)
const adminEmail = process.env.KENER_ADMIN_EMAIL;
const adminPassword = process.env.KENER_ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const countRow = await dbInstance.getUsersCount();
  const userCount = countRow ? Number(countRow.count) : 0;
  if (userCount === 0) {
    try {
      await CreateFirstUser({
        email: adminEmail,
        password: adminPassword,
        name: "Administrator",
        must_change_password: 1,
      });
      console.log(`Default admin created for ${adminEmail}`);
    } catch (err) {
      console.error("Failed to create default admin:", err);
    }
  }
} else if (adminEmail || adminPassword) {
  console.warn("KENER_ADMIN_EMAIL and KENER_ADMIN_PASSWORD must both be set to auto-create the default admin. Skipping.");
}
```

- [ ] **Step 3: Run type check**

```bash
npm run check
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/controllers/userController.ts scripts/main.ts
git commit -m "feat: extend CreateFirstUser with must_change_password + startup admin creation from env vars"
```

---

### Task 3: Redirect at Login

**Files:**
- Modify: `src/routes/(account)/account/signin/+page.server.ts`

- [ ] **Step 1: Add the `must_change_password` redirect in the `login` action**

In `src/routes/(account)/account/signin/+page.server.ts`, replace the final redirect in the `login` action. The existing code (line ~69–79):

```typescript
const token = await GenerateToken(userDB);
const cookieConfig = CookieConfig();
cookies.set(cookieConfig.name, token, {
  path: cookieConfig.path,
  maxAge: cookieConfig.maxAge,
  httpOnly: cookieConfig.httpOnly,
  secure: cookieConfig.secure,
  sameSite: cookieConfig.sameSite,
});

throw redirect(302, serverResolve("/manage/app/site-configurations"));
```

Change the final redirect to:

```typescript
const token = await GenerateToken(userDB);
const cookieConfig = CookieConfig();
cookies.set(cookieConfig.name, token, {
  path: cookieConfig.path,
  maxAge: cookieConfig.maxAge,
  httpOnly: cookieConfig.httpOnly,
  secure: cookieConfig.secure,
  sameSite: cookieConfig.sameSite,
});

if (userDB.must_change_password) {
  throw redirect(302, serverResolve("/account/change-password"));
}
throw redirect(302, serverResolve("/manage/app/site-configurations"));
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(account\)/account/signin/+page.server.ts
git commit -m "feat: redirect to change-password on login when must_change_password is set"
```

---

### Task 4: Route Interceptor in `(manage)` Layout

**Files:**
- Modify: `src/routes/(manage)/+layout.server.ts`

- [ ] **Step 1: Add the bypass guard**

In `src/routes/(manage)/+layout.server.ts`, after the existing `if (!loggedInUser)` redirect (line ~29–31), add:

```typescript
if (loggedInUser.must_change_password) {
  throw redirect(302, serverResolve("/account/change-password"));
}
```

The relevant section becomes:

```typescript
let loggedInUser = await GetLoggedInSession(cookies);

if (!loggedInUser) {
  throw redirect(302, serverResolve("/account/signin"));
}

if (loggedInUser.must_change_password) {
  throw redirect(302, serverResolve("/account/change-password"));
}
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(manage\)/+layout.server.ts
git commit -m "feat: block manage routes for users with must_change_password set"
```

---

### Task 5: New `/account/change-password` Route — Server

**Files:**
- Create: `src/routes/(account)/account/change-password/+page.server.ts`

- [ ] **Step 1: Create the server file**

Create `src/routes/(account)/account/change-password/+page.server.ts`:

```typescript
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { GetLoggedInSession } from "$lib/server/controllers/userController";
import { HashPassword } from "$lib/server/controllers/commonController";
import db from "$lib/server/db/db";
import serverResolve from "$lib/server/resolver.js";

export const load: PageServerLoad = async ({ cookies }) => {
  const loggedInUser = await GetLoggedInSession(cookies);
  if (!loggedInUser) {
    throw redirect(302, serverResolve("/account/signin"));
  }
  if (!loggedInUser.must_change_password) {
    throw redirect(302, serverResolve("/manage/app/site-configurations"));
  }
  return {};
};

export const actions: Actions = {
  change: async ({ request, cookies }) => {
    const loggedInUser = await GetLoggedInSession(cookies);
    if (!loggedInUser) {
      throw redirect(302, serverResolve("/account/signin"));
    }

    const formData = await request.formData();
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!newPassword || !confirmPassword) {
      return fail(400, { error: "Both password fields are required" });
    }
    if (newPassword.length < 8) {
      return fail(400, { error: "Password must be at least 8 characters" });
    }
    if (newPassword !== confirmPassword) {
      return fail(400, { error: "Passwords do not match" });
    }

    const passwordHash = await HashPassword(newPassword);
    await db.updateUserPassword({ id: loggedInUser.id, password_hash: passwordHash });
    await db.updateMustChangePassword(loggedInUser.id, 0);

    throw redirect(302, serverResolve("/manage/app/site-configurations"));
  },
};
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: `$types` for the new route are generated and no errors appear.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(account\)/account/change-password/+page.server.ts
git commit -m "feat: add /account/change-password server route with load guard and change action"
```

---

### Task 6: New `/account/change-password` Route — Svelte Page

**Files:**
- Create: `src/routes/(account)/account/change-password/+page.svelte`

- [ ] **Step 1: Create the Svelte component**

Create `src/routes/(account)/account/change-password/+page.svelte`:

```svelte
<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import LockIcon from "@lucide/svelte/icons/lock";
  import EyeClosedIcon from "@lucide/svelte/icons/eye-closed";
  import EyeOpenIcon from "@lucide/svelte/icons/eye";
  import type { ActionData } from "./$types";

  const { form }: { form: ActionData } = $props();

  let loading = $state(false);
  let showNew = $state(false);
  let showConfirm = $state(false);
</script>

<svelte:head>
  <title>Change Password</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    <Card.Header>
      <Card.Title>Change Your Password</Card.Title>
      <Card.Description>
        You must set a new password before continuing.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <form
        method="POST"
        action="?/change"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            loading = false;
            await update();
          };
        }}
      >
        <Field.Group>
          {#if form?.error}
            <p class="text-sm text-destructive">{form.error}</p>
          {/if}

          <Field.Field class="relative flex flex-col gap-1">
            <Field.Label for="newPassword">New Password</Field.Label>
            <InputGroup.Root>
              <InputGroup.Addon>
                <LockIcon />
              </InputGroup.Addon>
              <InputGroup.Input
                id="newPassword"
                name="newPassword"
                type={showNew ? "text" : "password"}
                placeholder="••••••••"
                required
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button
                  type="button"
                  aria-label={showNew ? "Hide password" : "Show password"}
                  size="icon-xs"
                  onclick={() => (showNew = !showNew)}
                >
                  {#if showNew}
                    <EyeClosedIcon class="size-4" />
                  {:else}
                    <EyeOpenIcon class="size-4" />
                  {/if}
                </InputGroup.Button>
              </InputGroup.Addon>
            </InputGroup.Root>
            <Field.Description>Minimum 8 characters.</Field.Description>
          </Field.Field>

          <Field.Field class="relative flex flex-col gap-1">
            <Field.Label for="confirmPassword">Confirm Password</Field.Label>
            <InputGroup.Root>
              <InputGroup.Addon>
                <LockIcon />
              </InputGroup.Addon>
              <InputGroup.Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                required
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button
                  type="button"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  size="icon-xs"
                  onclick={() => (showConfirm = !showConfirm)}
                >
                  {#if showConfirm}
                    <EyeClosedIcon class="size-4" />
                  {:else}
                    <EyeOpenIcon class="size-4" />
                  {/if}
                </InputGroup.Button>
              </InputGroup.Addon>
            </InputGroup.Root>
          </Field.Field>
        </Field.Group>

        <div class="mt-6">
          <Button type="submit" class="w-full" disabled={loading}>
            {#if loading}
              Saving...
            {:else}
              Set New Password
            {/if}
          </Button>
        </div>
      </form>
    </Card.Content>
  </Card.Root>
</div>
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 3: Start the dev server and manually verify the flow**

```bash
npm run dev
```

Manual test checklist:
1. Set `KENER_ADMIN_EMAIL=admin@example.com` and `KENER_ADMIN_PASSWORD=Admin1234` in your `.env` (or shell), then start with a fresh/empty DB. Confirm the admin account is created on startup.
2. Log in as the admin — confirm you are redirected to `/account/change-password` rather than `/manage`.
3. On the change-password page, submit with:
   - Both fields empty → error "Both password fields are required"
   - Password shorter than 8 chars → error "Password must be at least 8 characters"
   - Passwords that don't match → error "Passwords do not match"
   - Valid matching passwords ≥ 8 chars → redirects to `/manage/app/site-configurations`
4. After changing the password, attempt to navigate back to `/account/change-password` — confirm you are redirected to `/manage`.
5. Attempt to navigate directly to `/manage/app/monitors` while `must_change_password = 1` in the DB — confirm you are redirected to `/account/change-password`.
6. Log in as a normal (non-flagged) user — confirm login goes directly to `/manage/app/site-configurations` without hitting the change-password route.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(account\)/account/change-password/+page.svelte
git commit -m "feat: add /account/change-password Svelte page"
```
