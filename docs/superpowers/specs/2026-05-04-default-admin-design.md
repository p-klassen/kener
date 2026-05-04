# Default Administrator + Forced Password Change — Design Spec

**Date:** 2026-05-04

## Overview

Allow Kener to be deployed with a pre-configured administrator account via environment variables. On first login the admin is forced to change the temporary password before accessing the dashboard.

---

## Scope

- Applies only to the auto-created default admin (env-var path).
- Invited users are unaffected — they already set their own password when accepting an invitation.
- If env vars are not set, the existing first-user signup flow at `/account/signin` is unchanged.

---

## Database

**Migration:** Add `must_change_password INTEGER NOT NULL DEFAULT 0` to the `users` table.

**Type update:** `UserRecord` and `UserRecordInsert` in `src/lib/server/types/db.ts` get `must_change_password: number` (0 or 1).

---

## Startup Logic

**File:** `scripts/main.ts`

After migrations and seeds run, insert a new step:

```typescript
const adminEmail = process.env.KENER_ADMIN_EMAIL;
const adminPassword = process.env.KENER_ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const userCount = await db.getUserCount();
  if (userCount === 0) {
    await CreateFirstUser({
      email: adminEmail,
      password: adminPassword,
      name: "Administrator",
      must_change_password: 1,
    });
  }
}
```

`CreateFirstUser` in `src/lib/server/controllers/userController.ts` is extended to accept and persist `must_change_password`.

---

## Login Flow

**File:** `src/routes/(account)/account/signin/+page.server.ts`

After successful authentication, check the user record:

```typescript
if (user.must_change_password) {
  redirect(302, clientResolver(resolve, "/account/change-password"));
}
// otherwise redirect to /manage/app/site-configurations as before
```

---

## Redirect Interceptor

**File:** `src/hooks.server.ts`

For all requests to `/(manage)/` routes where a session exists, add a guard:

```typescript
if (loggedInUser?.must_change_password) {
  throw redirect(302, "/account/change-password");
}
```

This prevents the user from bypassing the password change by navigating directly to a manage URL.

---

## New Route: `/account/change-password`

### `+page.server.ts`

- **Load guard:** If no session → redirect to `/account/signin`. If session exists but `must_change_password = 0` → redirect to `/manage`.
- **Action `change`:**
  1. Validate: both fields present, equal, minimum 8 characters.
  2. Hash new password with bcrypt (same cost factor as existing password hashing).
  3. Update user: set `password_hash`, set `must_change_password = 0`.
  4. Redirect to `/manage/app/site-configurations`.

### `+page.svelte`

- Follows the visual style of `/account/signin` and `/account/invitation` (same layout wrapper, shadcn-svelte Card, Button, Input, Label components).
- Fields: "New password" + "Confirm password". No "current password" field.
- Displays validation errors inline (password too short, passwords don't match).
- Submit button shows spinner while action is running.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `KENER_ADMIN_EMAIL` | No | Email for the auto-created admin account |
| `KENER_ADMIN_PASSWORD` | No | Temporary password (will be forced to change on first login) |

Both must be set together. If only one is set, the auto-creation is skipped and a warning is logged.

---

## Constraints

- Auto-creation only runs when the DB has zero users. Subsequent restarts with the same env vars do nothing.
- The `must_change_password` flag is a general-purpose column — it can be reused in future for other forced-change scenarios.
- No email is sent for the default admin (credentials come from env vars).
