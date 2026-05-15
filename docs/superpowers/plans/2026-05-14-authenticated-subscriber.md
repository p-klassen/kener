# Authenticated Subscriber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `user_type: "user" | "subscriber"` to the users table so Authenticated Subscribers can log in to the status page and see private content, but are blocked from `/manage`.

**Architecture:** One new DB column (`user_type`) with `"user"` as default. The existing role/permission system handles what each subscriber can see — no new tables needed. The manage layout guard checks `user_type` before any route-permission logic. The status page `ThemePlus` component shows a "Logged in as / Log out" indicator for subscribers.

**Tech Stack:** Knex migrations, SvelteKit server load functions, TypeScript interfaces, Svelte 5 runes, shadcn-svelte Badge component.

---

## File Map

| File | Change |
|------|--------|
| `migrations/20260514120000_add_user_type_to_users.ts` | CREATE — add `user_type` column |
| `src/lib/server/types/db.ts` | MODIFY — `UserRecord`, `UserRecordInsert`, `UserRecordPublic` |
| `src/lib/server/db/repositories/users.ts` | MODIFY — `userColumns`, `insertUser`, new `updateUserType`, filter in `getUsersPaginated`/`getTotalUsers` |
| `src/lib/server/controllers/userController.ts` | MODIFY — `NewUserInput`, `ManualUserUpdateInput`, `SendInvitationEmail`, `ManualUpdateUserData`, controller filter types |
| `src/routes/(manage)/manage/api/+server.ts` | MODIFY — `createNewUser`, `getUsers` actions |
| `src/lib/allPerms.ts` | MODIFY — nothing new (manualUpdate already covers user_type update) |
| `src/routes/(manage)/+layout.server.ts` | MODIFY — add subscriber guard |
| `src/routes/(account)/account/signin/+page.server.ts` | MODIFY — explicit subscriber redirect |
| `src/routes/(account)/account/logout/+page.server.ts` | MODIFY — support `return_to` query param |
| `src/routes/(manage)/manage/app/users/+page.svelte` | MODIFY — badge, type field in create dialog, type update in edit sheet, type filter |
| `src/lib/components/ThemePlus.svelte` | MODIFY — subscriber indicator + logout |
| `src/lib/locales/en.json` | MODIFY — 10 new keys |
| `src/lib/locales/*.json` (21 remaining) | MODIFY — same 10 keys with English values |

---

### Task 1: DB Migration

**Files:**
- Create: `migrations/20260514120000_add_user_type_to_users.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "user_type");
  if (!hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.string("user_type").notNullable().defaultTo("user");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("users", "user_type");
  if (hasCol) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("user_type");
    });
  }
}
```

- [ ] **Step 2: Run the migration**

```bash
npm run migrate
```

Expected: migration runs without error, `users` table now has `user_type TEXT NOT NULL DEFAULT 'user'`.

- [ ] **Step 3: Commit**

```bash
git add migrations/20260514120000_add_user_type_to_users.ts
git commit -m "feat: add user_type column to users table"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/server/types/db.ts`

The `UserRecord` interface starts at line 235, `UserRecordInsert` at 251, `UserRecordPublic` at 265.

- [ ] **Step 1: Add `user_type` to `UserRecord`** (after `external_id` field)

```typescript
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
  auth_provider: string;
  external_id: string | null;
  user_type: "user" | "subscriber";  // ADD THIS LINE
  created_at: Date;
  updated_at: Date;
}
```

- [ ] **Step 2: Add `user_type` to `UserRecordInsert`** (optional, defaults to `"user"`)

```typescript
export interface UserRecordInsert {
  email: string;
  name: string;
  password_hash: string;
  role_ids: string[];
  is_active?: number;
  is_verified?: number;
  is_owner?: string;
  must_change_password?: number;
  preferred_locale?: string | null;
  auth_provider?: string;
  external_id?: string | null;
  user_type?: "user" | "subscriber";  // ADD THIS LINE
}
```

- [ ] **Step 3: Add `user_type` to `UserRecordPublic`** (after `external_id`)

```typescript
export interface UserRecordPublic {
  id: number;
  email: string;
  name: string;
  is_active: number;
  is_verified: number;
  is_owner: string;
  must_change_password: number;
  role_ids: string[];
  preferred_locale: string | null;
  auth_provider: string;
  external_id: string | null;
  user_type: "user" | "subscriber";  // ADD THIS LINE
  created_at: Date;
  updated_at: Date;
}
```

- [ ] **Step 4: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors related to `user_type`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/types/db.ts
git commit -m "feat: add user_type to UserRecord types"
```

---

### Task 3: DB Repository

**Files:**
- Modify: `src/lib/server/db/repositories/users.ts`

- [ ] **Step 1: Add `"user_type"` to `userColumns`** (the `private readonly userColumns` array around line 23)

The array currently ends with `"updated_at"`. Add `"user_type"` before `"updated_at"`:

```typescript
private readonly userColumns = [
  "id",
  "email",
  "name",
  "is_active",
  "is_verified",
  "is_owner",
  "must_change_password",
  "auth_provider",
  "external_id",
  "preferred_locale",
  "user_type",       // ADD THIS LINE
  "created_at",
  "updated_at",
] as const;
```

- [ ] **Step 2: Update `insertUser` to persist `user_type`** (around line 87)

In the `insertData` object inside `insertUser`, add `user_type`:

```typescript
const insertData = {
  email: data.email,
  name: data.name,
  password_hash: data.password_hash,
  is_owner: data.is_owner || "NO",
  must_change_password: data.must_change_password ?? 0,
  auth_provider: data.auth_provider ?? "local",
  external_id: data.external_id ?? null,
  user_type: data.user_type ?? "user",   // ADD THIS LINE
  created_at: this.knex.fn.now(),
  updated_at: this.knex.fn.now(),
};
```

- [ ] **Step 3: Add `updateUserType` method** (add after the `updateUserName` method around line 163)

```typescript
async updateUserType(id: number, user_type: "user" | "subscriber"): Promise<number> {
  return await this.knex("users").where({ id }).update({
    user_type,
    updated_at: this.knex.fn.now(),
  });
}
```

- [ ] **Step 4: Add `user_type` filter to `getUsersPaginated`** (around line 142)

```typescript
async getUsersPaginated(
  page: number,
  limit: number,
  filter?: { is_active?: number; user_type?: string },
): Promise<UserRecordPublic[]> {
  const query = this.knex("users")
    .select(...this.userColumns)
    .orderBy("created_at", "desc")
    .limit(limit)
    .offset((page - 1) * limit);
  if (filter?.is_active !== undefined) {
    query.where("is_active", filter.is_active);
  }
  if (filter?.user_type !== undefined) {
    query.where("user_type", filter.user_type);
  }
  const rows = await query;
  return await this.enrichManyWithRoleIds(rows);
}
```

- [ ] **Step 5: Add `user_type` filter to `getTotalUsers`** (around line 155)

```typescript
async getTotalUsers(filter?: { is_active?: number; user_type?: string }): Promise<CountResult | undefined> {
  const query = this.knex("users").count("* as count");
  if (filter?.is_active !== undefined) {
    query.where("is_active", filter.is_active);
  }
  if (filter?.user_type !== undefined) {
    query.where("user_type", filter.user_type);
  }
  return await query.first<CountResult>();
}
```

- [ ] **Step 6: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db/repositories/users.ts
git commit -m "feat: add user_type to users repository"
```

---

### Task 4: User Controller

**Files:**
- Modify: `src/lib/server/controllers/userController.ts`

- [ ] **Step 1: Add `user_type` to `NewUserInput` interface** (around line 30)

```typescript
interface NewUserInput {
  email: string;
  name: string;
  password: string;
  plainPassword: string;
  role_ids: string[];
  user_type?: "user" | "subscriber";  // ADD THIS LINE
}
```

- [ ] **Step 2: Pass `user_type` in `CreateNewUser`** (around line 188, in the `let user = {...}` object)

```typescript
let user = {
  email: normalizedEmail,
  password_hash: await HashPassword(data.password),
  name: normalizedName,
  role_ids: data.role_ids,
  user_type: data.user_type ?? "user",  // ADD THIS LINE
};
```

- [ ] **Step 3: Update `SendInvitationEmail` signature to accept `user_type`** (around line 404)

```typescript
export const SendInvitationEmail = async (
  email: string,
  role_ids: string[],
  name: string,
  user_type: "user" | "subscriber" = "user",  // ADD THIS PARAMETER
) => {
```

Then in the `db.insertUser` call inside `SendInvitationEmail` (around line 431):

```typescript
await db.insertUser({
  email: normalizedEmail,
  password_hash: "",
  name: normalizedName,
  role_ids: role_ids,
  is_active: 0,
  user_type,           // ADD THIS LINE
});
```

- [ ] **Step 4: Add `user_type` to `ManualUserUpdateInput`** (around line 17)

```typescript
interface ManualUserUpdateInput {
  updateType: string;
  role_ids?: string[];
  is_active?: number;
  password?: string;
  passwordPlain?: string;
  user_type?: "user" | "subscriber";  // ADD THIS LINE
}
```

- [ ] **Step 5: Handle `updateType === "user_type"` in `ManualUpdateUserData`** (around line 363, before the final `else` branch)

Add this block before `} else {`:

```typescript
} else if (data.updateType === "user_type") {
  if (!data.user_type || (data.user_type !== "user" && data.user_type !== "subscriber")) {
    throw new Error("user_type must be 'user' or 'subscriber'");
  }
  if (forUser.is_owner === "YES" && data.user_type === "subscriber") {
    throw new Error("Owner account cannot be changed to subscriber");
  }
  return await db.updateUserType(forUser.id, data.user_type);
```

- [ ] **Step 6: Update `GetAllUsersPaginated` filter type** (around line 68)

```typescript
export const GetAllUsersPaginated = async (
  data: PaginationInput,
  filter?: { is_active?: number; user_type?: string },
): Promise<UserRecordPublic[]> => {
  return await db.getUsersPaginated(data.page, data.limit, filter);
};
```

- [ ] **Step 7: Update `GetAllUsersPaginatedDashboard` filter type** (around line 75)

```typescript
export const GetAllUsersPaginatedDashboard = async (
  data: PaginationInput,
  filter?: { is_active?: number; user_type?: string },
): Promise<UserRecordDashboard[]> => {
  const users = await db.getUsersPaginated(data.page, data.limit, filter);
  // ... rest unchanged
```

- [ ] **Step 8: Update `GetUsersCount` filter type** (around line 97)

```typescript
export const GetUsersCount = async (filter?: { is_active?: number; user_type?: string }) => {
  return await db.getTotalUsers(filter);
};
```

- [ ] **Step 9: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/controllers/userController.ts
git commit -m "feat: propagate user_type through user controller"
```

---

### Task 5: API Handler

**Files:**
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Pass `user_type` in `createNewUser` action** (around line 248)

Find:
```typescript
} else if (action == "createNewUser") {
  await SendInvitationEmail(data.email, data.role_ids, data.name);
```

Replace with:
```typescript
} else if (action == "createNewUser") {
  const newUserType: "user" | "subscriber" =
    data.user_type === "subscriber" ? "subscriber" : "user";
  await SendInvitationEmail(data.email, data.role_ids, data.name, newUserType);
```

- [ ] **Step 2: Pass `user_type` filter in `getUsers` action** (around line 266)

Find the `getUsers` block and update the filter construction:

```typescript
} else if (action == "getUsers") {
  const page = parseInt(String(data.page)) || 1;
  const limit = parseInt(String(data.limit)) || 10;
  const filter: { is_active?: number; user_type?: string } = {};
  if (data.is_active !== undefined && data.is_active !== null) {
    filter.is_active = parseInt(String(data.is_active));
  }
  if (data.user_type && data.user_type !== "all") {
    filter.user_type = String(data.user_type);
  }
  const hasFilter = Object.keys(filter).length > 0 ? filter : undefined;
  const users = await GetAllUsersPaginatedDashboard({ page, limit }, hasFilter);
  const totalResult = await GetUsersCount(hasFilter);
  const total = totalResult ? Number(totalResult.count) : 0;
  resp = { users, total };
```

- [ ] **Step 3: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(manage\)/manage/api/+server.ts
git commit -m "feat: add user_type to createNewUser and getUsers API actions"
```

---

### Task 6: Auth Guards

**Files:**
- Modify: `src/routes/(manage)/+layout.server.ts`
- Modify: `src/routes/(account)/account/signin/+page.server.ts`

- [ ] **Step 1: Add subscriber guard to manage layout** (`src/routes/(manage)/+layout.server.ts`)

After the `must_change_password` check (around line 34), add:

```typescript
if (loggedInUser.must_change_password) {
  throw redirect(302, serverResolve("/account/change-password"));
}

// ADD THESE LINES:
if (loggedInUser.user_type === "subscriber") {
  throw redirect(303, serverResolve("/"));
}
```

- [ ] **Step 2: Update signin `load` to redirect subscribers to `/`** (`src/routes/(account)/account/signin/+page.server.ts`)

Find (around line 19):
```typescript
if (!!parentData.loggedInUser && parentData.isSetupComplete) {
  const permissions = await GetUserPermissions(parentData.loggedInUser.id);
  const dest = permissions.size > 0 ? "/manage/app/site-configurations" : "/";
  throw redirect(302, serverResolve(dest));
}
```

Replace with:
```typescript
if (!!parentData.loggedInUser && parentData.isSetupComplete) {
  if (parentData.loggedInUser.user_type === "subscriber") {
    throw redirect(302, serverResolve("/"));
  }
  const permissions = await GetUserPermissions(parentData.loggedInUser.id);
  const dest = permissions.size > 0 ? "/manage/app/site-configurations" : "/";
  throw redirect(302, serverResolve(dest));
}
```

- [ ] **Step 3: Update the `login` action redirect** (around line 95)

Find:
```typescript
const loginPermissions = await GetUserPermissions(userDB.id);
throw redirect(302, serverResolve(loginPermissions.size > 0 ? "/manage/app/site-configurations" : "/"));
```

Replace with:
```typescript
if (userDB.user_type === "subscriber") {
  throw redirect(302, serverResolve("/"));
}
const loginPermissions = await GetUserPermissions(userDB.id);
throw redirect(302, serverResolve(loginPermissions.size > 0 ? "/manage/app/site-configurations" : "/"));
```

- [ ] **Step 4: Update the `ldap` action redirect** (around line 119)

Find:
```typescript
const ldapPermissions = await GetUserPermissions(userDB.id);
ldapRedirect = serverResolve(ldapPermissions.size > 0 ? "/manage/app/site-configurations" : "/");
```

Replace with:
```typescript
if (userDB.user_type === "subscriber") {
  ldapRedirect = serverResolve("/");
} else {
  const ldapPermissions = await GetUserPermissions(userDB.id);
  ldapRedirect = serverResolve(ldapPermissions.size > 0 ? "/manage/app/site-configurations" : "/");
}
```

- [ ] **Step 5: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(manage\)/+layout.server.ts src/routes/\(account\)/account/signin/+page.server.ts
git commit -m "feat: block subscribers from /manage, redirect to status page"
```

---

### Task 7: Logout `return_to` Support

**Files:**
- Modify: `src/routes/(account)/account/logout/+page.server.ts`

- [ ] **Step 1: Update the logout action to support `return_to`**

Replace the entire file content:

```typescript
import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import serverResolve from "$lib/server/resolver.js";

export const load: PageServerLoad = async () => {
  throw redirect(302, serverResolve("/account/signin"));
};

export const actions: Actions = {
  default: async ({ cookies, url }) => {
    cookies.delete("kener-user", { path: serverResolve("/") });
    const returnTo = url.searchParams.get("return_to") ?? "";
    const dest = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account/signin";
    throw redirect(302, serverResolve(dest));
  },
};
```

- [ ] **Step 2: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(account\)/account/logout/+page.server.ts
git commit -m "feat: support return_to query param in logout action"
```

---

### Task 8: i18n Keys

**Files:**
- Modify: `src/lib/locales/en.json`
- Modify: all other 21 locale files in `src/lib/locales/`

- [ ] **Step 1: Add 10 new keys to `en.json`**

Find the block with `"manage.users.eff_access_direct_monitors"` (around line 1128) and add after it:

```json
"manage.users.account_type_label": "Account Type",
"manage.users.type_user": "User",
"manage.users.type_subscriber": "Authenticated Subscriber",
"manage.users.subscriber_badge": "Subscriber",
"manage.users.type_all": "All",
"manage.users.subscriber_info": "Subscribers have no access to /manage regardless of role permissions.",
"manage.users.change_type_warning": "This user will lose access to /manage immediately.",
"manage.users.update_type_desc": "Change account type. Users can access /manage; Subscribers can only view the status page.",
"manage.users.update_type_button": "Update Type",
"kener.subscriber_logout": "Log out"
```

- [ ] **Step 2: Add the same 10 keys to all other 21 locale files using a script**

```bash
node -e "
const fs = require('fs');
const path = require('path');
const localesDir = 'src/lib/locales';
const newKeys = {
  'manage.users.account_type_label': 'Account Type',
  'manage.users.type_user': 'User',
  'manage.users.type_subscriber': 'Authenticated Subscriber',
  'manage.users.subscriber_badge': 'Subscriber',
  'manage.users.type_all': 'All',
  'manage.users.subscriber_info': 'Subscribers have no access to /manage regardless of role permissions.',
  'manage.users.change_type_warning': 'This user will lose access to /manage immediately.',
  'manage.users.update_type_desc': 'Change account type. Users can access /manage; Subscribers can only view the status page.',
  'manage.users.update_type_button': 'Update Type',
  'kener.subscriber_logout': 'Log out',
};
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== 'en.json');
for (const file of files) {
  const fp = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  let changed = false;
  for (const [k, v] of Object.entries(newKeys)) {
    if (!(k in data)) { data[k] = v; changed = true; }
  }
  if (changed) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
}
console.log('Done');
"
```

Expected output: `Done`

- [ ] **Step 3: Commit**

```bash
git add src/lib/locales/
git commit -m "feat: add user_type i18n keys to all 22 locales"
```

---

### Task 9: Admin UI — Users Page

**Files:**
- Modify: `src/routes/(manage)/manage/app/users/+page.svelte`

- [ ] **Step 1: Add `user_type` to the `NewUser` interface and state**

Find the `NewUser` interface near the top of `<script>` and add `user_type`:

```typescript
interface NewUser {
  name: string;
  email: string;
  role_ids: string[];
  user_type: "user" | "subscriber";
}
```

Find `resetNewUser()` and update the default:

```typescript
function resetNewUser() {
  newUser = {
    name: "",
    email: "",
    role_ids: [],
    user_type: "user",
  };
}
```

Find the initial `newUser = $state<NewUser>({...})` and add `user_type: "user"`:

```typescript
let newUser = $state<NewUser>({
  name: "",
  email: "",
  role_ids: [],
  user_type: "user",
});
```

- [ ] **Step 2: Add `typeFilter` state and update `fetchUsers`**

After the `statusFilter` state line, add:

```typescript
let typeFilter = $state<"all" | "user" | "subscriber">("all");
```

Update the `fetchUsers` function body to include `user_type` in the request:

```typescript
body: JSON.stringify({
  action: "getUsers",
  data: {
    page,
    limit,
    is_active: statusFilter === "ACTIVE" ? 1 : 0,
    user_type: typeFilter !== "all" ? typeFilter : undefined,
  }
})
```

- [ ] **Step 3: Add type filter buttons in the template**

Find the existing status filter buttons block (the two buttons for Active/Inactive). After the closing `</div>` of that group, add a second button group for type filtering:

```svelte
<div class="flex items-center gap-1">
  {#each [["all", $t("manage.users.type_all")], ["user", $t("manage.users.type_user")], ["subscriber", $t("manage.users.type_subscriber")]] as [val, label]}
    <Button
      variant={typeFilter === val ? "default" : "outline"}
      size="sm"
      onclick={() => { typeFilter = val as typeof typeFilter; page = 1; fetchUsers(); }}
    >
      {label}
    </Button>
  {/each}
</div>
```

- [ ] **Step 4: Add Subscriber badge to the user list**

Find where user names are rendered in the table/list. Locate the column that shows the user's name and add a badge after it. Import `Badge` if not already imported:

```svelte
import { Badge } from "$lib/components/ui/badge/index.js";
```

In the user name cell:

```svelte
{user.name}
{#if user.user_type === "subscriber"}
  <Badge variant="outline" class="ml-1 text-xs">{$t("manage.users.subscriber_badge")}</Badge>
{/if}
```

- [ ] **Step 5: Add Account Type selector to the Create User dialog**

In the create-user form (around the role selection area), add the account type selector. Place it after the email field and before the roles section:

```svelte
<div class="space-y-1">
  <Label>{$t("manage.users.account_type_label")}</Label>
  <div class="flex gap-2">
    <Button
      size="sm"
      variant={newUser.user_type === "user" ? "default" : "outline"}
      onclick={() => (newUser.user_type = "user")}
      type="button"
    >
      {$t("manage.users.type_user")}
    </Button>
    <Button
      size="sm"
      variant={newUser.user_type === "subscriber" ? "default" : "outline"}
      onclick={() => (newUser.user_type = "subscriber")}
      type="button"
    >
      {$t("manage.users.type_subscriber")}
    </Button>
  </div>
  {#if newUser.user_type === "subscriber"}
    <p class="text-muted-foreground text-xs">{$t("manage.users.subscriber_info")}</p>
  {/if}
</div>
```

- [ ] **Step 6: Add user_type update to the Edit sheet**

In the edit sheet where other update sections are (roles, activate/deactivate, etc.), add a section for changing user type. Find the edit sheet content area and add:

```svelte
<!-- Account Type -->
<div class="space-y-2 border-t pt-4">
  <p class="text-sm font-medium">{$t("manage.users.update_type_desc")}</p>
  <div class="flex gap-2">
    <Button
      size="sm"
      variant={toEditUser?.user_type === "user" ? "default" : "outline"}
      disabled={toEditUser?.actions?.updatingRole}
      onclick={async () => {
        if (toEditUser?.user_type === "user") return;
        if (!confirm($t("manage.users.change_type_warning"))) return;
        // call manualUpdate with updateType: "user_type"
        const res = await fetch(clientResolver(resolve, "/manage/api"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "manualUpdate",
            data: { id: toEditUser?.id, updateType: "user_type", user_type: "user" }
          })
        });
        const result = await res.json();
        if (result.error) {
          toast.error(result.error);
        } else {
          if (toEditUser) toEditUser.user_type = "user";
          const idx = users.findIndex(u => u.id === toEditUser?.id);
          if (idx >= 0) users[idx] = { ...users[idx], user_type: "user" };
          toast.success($t("manage.users.update_type_button") + " ✓");
        }
      }}
    >
      {$t("manage.users.type_user")}
    </Button>
    <Button
      size="sm"
      variant={toEditUser?.user_type === "subscriber" ? "default" : "outline"}
      disabled={toEditUser?.actions?.updatingRole}
      onclick={async () => {
        if (toEditUser?.user_type === "subscriber") return;
        if (!confirm($t("manage.users.change_type_warning"))) return;
        const res = await fetch(clientResolver(resolve, "/manage/api"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "manualUpdate",
            data: { id: toEditUser?.id, updateType: "user_type", user_type: "subscriber" }
          })
        });
        const result = await res.json();
        if (result.error) {
          toast.error(result.error);
        } else {
          if (toEditUser) toEditUser.user_type = "subscriber";
          const idx = users.findIndex(u => u.id === toEditUser?.id);
          if (idx >= 0) users[idx] = { ...users[idx], user_type: "subscriber" };
          toast.success($t("manage.users.update_type_button") + " ✓");
        }
      }}
    >
      {$t("manage.users.type_subscriber")}
    </Button>
  </div>
</div>
```

- [ ] **Step 7: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(manage\)/manage/app/users/+page.svelte
git commit -m "feat: add subscriber badge, type filter, and type toggle to users admin UI"
```

---

### Task 10: Status Page Subscriber Indicator

**Files:**
- Modify: `src/lib/components/ThemePlus.svelte`

- [ ] **Step 1: Add subscriber info import and derived**

In the `<script>` section of `ThemePlus.svelte`, after the existing imports, add:

```typescript
import LogOut from "@lucide/svelte/icons/log-out";
```

After the `loginDetails` derived (around line 38), add:

```typescript
const subscriberInfo = $derived.by((): { name: string } | null => {
  const user = page.data?.loggedInUser;
  if (!user || user.user_type !== "subscriber") return null;
  return { name: user.name };
});

const logoutUrl = $derived(clientResolver(resolve, "/account/logout?return_to=/"));
```

- [ ] **Step 2: Add subscriber indicator to the template**

In the template, after the `{#if loginDetails}` block (around line 161) and before the closing `</div>` of the `ml-auto` flex container, add:

```svelte
{#if subscriberInfo}
  <div class="flex items-center gap-1">
    <span class="text-muted-foreground hidden text-xs sm:inline">
      {subscriberInfo.name}
    </span>
    <form method="POST" action={logoutUrl}>
      <Button
        type="submit"
        size="icon-sm"
        variant="outline"
        aria-label={$t("kener.subscriber_logout")}
        title={$t("kener.subscriber_logout")}
        class="bg-background/80 dark:bg-background/70 border-foreground/10 rounded-full border shadow-none backdrop-blur-md"
      >
        <LogOut class="h-4 w-4" />
      </Button>
    </form>
  </div>
{/if}
```

- [ ] **Step 3: Run type check**

```bash
npm run check 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ThemePlus.svelte
git commit -m "feat: show subscriber name and logout button on status page"
```

---

## Final Verification

- [ ] **Start dev server and verify:**

```bash
npm run dev
```

1. Log in as a regular user → lands on `/manage` ✓
2. Create an Authenticated Subscriber via `/manage/users` → badge visible ✓
3. Log in as the subscriber → lands on `/` (status page) ✓
4. Try navigating to `/manage` as subscriber → redirected to `/` ✓
5. Status page shows subscriber name + logout icon ✓
6. Click logout → returns to `/` ✓
7. Type filter on users page filters correctly ✓
