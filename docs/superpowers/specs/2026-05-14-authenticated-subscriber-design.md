# Authenticated Subscriber — Design Spec

## Goal

Introduce a second account type, "Authenticated Subscriber" (`user_type: "subscriber"`), alongside the existing "User" (`user_type: "user"`). Subscribers can log in to the status page to access private pages and monitors their roles grant them, but have no access to `/manage`. They are visually distinguished in the admin UI with a badge.

This is Part 1 of a two-part feature. Part 2 (subscription scope enhancement with page-level scope and permission-filtered editor) builds on this foundation.

---

## Account Types

| Type | `user_type` | `/manage` access | Status-page private content | Subscription scope |
|------|-------------|-----------------|-----------------------------|--------------------|
| User | `"user"` | Yes (per role permissions) | Yes (per roles) | Per role access |
| Authenticated Subscriber | `"subscriber"` | Never | Yes (per roles) | Per role access |
| Public Subscriber | — (no account) | No | Public only | Public only |

---

## Data Model

### DB Migration

One new column on the `users` table:

```sql
ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'user';
```

All existing users default to `"user"` — no behaviour change.

### Updated `UserRecord`

```typescript
// src/lib/server/types/db.ts
export interface UserRecord {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  is_active: number;
  is_verified: number;
  must_change_password: number;
  role_ids: string[];
  preferred_locale: string | null;
  auth_provider: "local" | "oidc" | "ldap";
  external_id: string | null;
  user_type: "user" | "subscriber"; // NEW
  created_at?: Date;
  updated_at?: Date;
}
```

`user_type` is set at creation and editable by admins at any time.

---

## Auth Flow

### Login (`/account/signin`)

Both types use the same login form and validation:
1. Fetch user by email
2. Verify password / LDAP / OIDC
3. Check `is_active`
4. Check `role_ids.length > 0` (subscribers must have at least one role to log in)
5. Generate JWT, set `kener-user` cookie

**Redirect after login:**
- `user_type: "user"` → `/manage/app/site-configurations` (or saved target URL) — unchanged
- `user_type: "subscriber"` → `/` (status page root)
- If `must_change_password: 1` → `/account/change-password` for both types

### `/manage` Guard

The `(manage)` layout server (`+layout.server.ts`) gains an additional check:

```typescript
if (user.user_type === "subscriber") {
  redirect(303, "/");
}
```

Placed after the existing session check, before route-permission checks. Subscribers are always redirected to `/` regardless of which `/manage` URL they attempt to access.

### Status-Page Session

No changes to `(kener)` layout or `GetPageDashboardData()`. The existing logic already:
- Reads the `kener-user` cookie
- Identifies the logged-in user
- Calls `getAccessibleResources(user.id)` to determine accessible page IDs and monitor tags
- Applies `visibility_mode` for pages the user cannot access

Subscribers receive exactly the same treatment as Users on the status page — their roles determine what they see.

---

## Admin UI: `/manage/users`

### Badge

Users with `user_type: "subscriber"` display a "Subscriber" badge (outline variant) next to their name in:
- The user list table
- The edit sheet header

Users with `user_type: "user"` display no badge (default state).

### Create User Dialog — New Field

A "Account Type" selector is added to the create-user form:

```
Account Type
  ● User              (default)
  ○ Authenticated Subscriber
```

- Default: `User` — no change for existing admin workflows
- When "Authenticated Subscriber" is selected: role assignment remains available; an info note reads: "Subscribers have no access to /manage regardless of role permissions."

### Edit User Sheet — Type Change

`user_type` is editable in the edit sheet via the same selector. Changing from `"user"` → `"subscriber"` shows a confirmation: "This user will lose access to /manage immediately."

### User List Filter

The existing Active/Inactive status filter is extended with a Type filter:

```
Type: [All ▾]  →  All / Users / Subscribers
```

Filters are independent and combinable.

### Invitation Email

Same invite flow for both types (email with password-set link). No content difference in scope — optional follow-up.

---

## Status Page: Subscriber Experience

### Header / Navigation

When a subscriber is logged in, the status-page header shows:
- "Logged in as [Name]" indicator
- Logout link → calls existing logout action, redirects to `/`
- No link to `/manage`

The exact component location depends on the active theme's header implementation.

### Content Access

| Content | Subscriber behaviour |
|---------|---------------------|
| `is_public=1` pages | Always visible (same as anonymous) |
| `is_public=0` pages, role has access | Fully visible |
| `is_public=0` pages, no role access | `visibility_mode` applies (hidden/teaser/locked + login prompt) |
| `is_public=1` monitors | Always visible |
| `is_public=0` monitors, accessible via role | Visible |
| `is_public=0` monitors, no access | Hidden |

No code changes required in `GetPageDashboardData()` — existing logic handles all cases.

### Self-Subscription (Part 2 scope)

Authenticated Subscribers will be able to subscribe to pages/monitors they can see directly from the status page. The UI for this (subscribe buttons, self-management) is deferred to Part 2.

---

## Backwards Compatibility

- All existing users receive `user_type: "user"` via the migration default — no behaviour change
- All existing login flows, redirect logic, and role assignments are unchanged
- The `/manage` guard addition is additive — users who could access `/manage` before still can
- No changes to the subscription system in Part 1
