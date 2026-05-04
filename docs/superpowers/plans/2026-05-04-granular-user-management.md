# Granular User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Kener's RBAC so users can be granted access to specific Pages and Monitors (via Roles assigned to Users or Groups), with configurable visibility for unauthorized visitors.

**Architecture:** New DB tables (`groups`, `users_groups`, `groups_roles`, `roles_pages`, `roles_monitors`) extend the existing `roles`/`users_roles` schema. A `canSeeResource()` utility computes effective access at request time by unioning direct-role and group-role assignments. The public status page uses this to filter/style resources; the manage admin gets three new UI areas: Groups CRUD, Role Visibility tab, User Effective Access tab.

**Tech Stack:** Knex.js (migrations + queries), TypeScript, SvelteKit 5 (Svelte 5 runes), shadcn-svelte, Tailwind CSS v4. No test framework — verification via `npm run check` + manual browser testing.

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `migrations/20260504120000_add_granular_access_tables.ts` | DB schema changes |
| `src/lib/server/db/repositories/groups.ts` | Groups CRUD + members + group-roles |
| `src/lib/server/db/repositories/resource-access.ts` | roles_pages, roles_monitors, effective access query |
| `src/lib/server/controllers/groupsController.ts` | Business logic wrapper over GroupsRepository |
| `src/lib/server/controllers/resourceAccessController.ts` | Business logic for role resource assignments + effective access |
| `src/lib/server/utils/canSeeResource.ts` | Pure function: does user have access to a page/monitor? |
| `src/routes/(manage)/manage/app/groups/+page.svelte` | Groups overview (list + create) |
| `src/routes/(manage)/manage/app/groups/[group_id]/+page.svelte` | Group detail (members + roles tabs) |

### Modified files
| Path | Change |
|------|--------|
| `src/lib/server/types/db.ts` | Add 6 new record types |
| `src/lib/allPerms.ts` | Add groups.read / groups.write permissions + dispatcher entries |
| `src/lib/server/db/repositories/pages.ts` | Include `is_public`, `visibility_mode` in select columns |
| `src/lib/server/controllers/dashboardController.ts` | Filter resources through canSeeResource; pass visibility_mode |
| `src/routes/(manage)/manage/api/+server.ts` | Import new controllers, wire ~15 new actions |
| `src/routes/(kener)/[page_path]/+page.server.ts` | Pass locked/teaser state to page |
| `src/routes/(kener)/[page_path]/+page.svelte` | Render locked/teaser UI |
| `src/routes/(manage)/manage/app/roles/+page.svelte` | Add Visibility tab |
| `src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte` | Add visibility_mode radio group |
| `src/routes/(manage)/manage/app/users/+page.svelte` | Add Effective Access tab to user detail |

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/20260504120000_add_granular_access_tables.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// migrations/20260504120000_add_granular_access_tables.ts
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. groups
  if (!(await knex.schema.hasTable("groups"))) {
    await knex.schema.createTable("groups", (table) => {
      table.increments("id").primary();
      table.text("name").notNullable();
      table.text("description").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }

  // 2. users_groups
  if (!(await knex.schema.hasTable("users_groups"))) {
    await knex.schema.createTable("users_groups", (table) => {
      table.integer("users_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
      table.integer("groups_id").unsigned().notNullable().references("id").inTable("groups").onDelete("CASCADE");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["users_id", "groups_id"]);
    });
  }

  // 3. groups_roles
  if (!(await knex.schema.hasTable("groups_roles"))) {
    await knex.schema.createTable("groups_roles", (table) => {
      table.integer("groups_id").unsigned().notNullable().references("id").inTable("groups").onDelete("CASCADE");
      table.string("roles_id", 100).notNullable().references("id").inTable("roles").onDelete("CASCADE");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["groups_id", "roles_id"]);
    });
  }

  // 4. roles_pages
  if (!(await knex.schema.hasTable("roles_pages"))) {
    await knex.schema.createTable("roles_pages", (table) => {
      table.string("roles_id", 100).notNullable().references("id").inTable("roles").onDelete("CASCADE");
      table.integer("pages_id").unsigned().notNullable().references("id").inTable("pages").onDelete("CASCADE");
      table.integer("inherit_monitors").notNullable().defaultTo(1);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["roles_id", "pages_id"]);
    });
  }

  // 5. roles_monitors
  if (!(await knex.schema.hasTable("roles_monitors"))) {
    await knex.schema.createTable("roles_monitors", (table) => {
      table.string("roles_id", 100).notNullable().references("id").inTable("roles").onDelete("CASCADE");
      // Use monitor_tag (text) as FK, consistent with page_monitors table
      table.string("monitor_tag", 100).notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.primary(["roles_id", "monitor_tag"]);
    });
  }

  // 6. New columns on pages
  const hasIsPublicPage = await knex.schema.hasColumn("pages", "is_public");
  if (!hasIsPublicPage) {
    await knex.schema.alterTable("pages", (table) => {
      table.integer("is_public").notNullable().defaultTo(1);  // 1 = true
    });
  }
  const hasVisibilityMode = await knex.schema.hasColumn("pages", "visibility_mode");
  if (!hasVisibilityMode) {
    await knex.schema.alterTable("pages", (table) => {
      table.string("visibility_mode", 20).notNullable().defaultTo("hidden");
    });
  }

  // 7. New column on monitors
  const hasIsPublicMonitor = await knex.schema.hasColumn("monitors", "is_public");
  if (!hasIsPublicMonitor) {
    await knex.schema.alterTable("monitors", (table) => {
      table.integer("is_public").notNullable().defaultTo(1);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("roles_monitors");
  await knex.schema.dropTableIfExists("roles_pages");
  await knex.schema.dropTableIfExists("groups_roles");
  await knex.schema.dropTableIfExists("users_groups");
  await knex.schema.dropTableIfExists("groups");
  // Column drops omitted — SQLite limitations; run a separate migration if needed
}
```

- [ ] **Step 2: Run the migration and verify**

```bash
npm run migrate
```

Expected: Migration runs without error. Then open a SQLite shell (or check DB) to verify the 5 new tables exist:
```bash
# For SQLite (default):
sqlite3 kener.db ".tables" | tr ' ' '\n' | sort | grep -E "groups|roles_pages|roles_monitors"
```
Expected output includes: `groups`, `groups_roles`, `roles_monitors`, `roles_pages`, `users_groups`

- [ ] **Step 3: Commit**

```bash
git add migrations/20260504120000_add_granular_access_tables.ts
git commit -m "feat: add granular access DB migration (groups, roles_pages, roles_monitors)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/server/types/db.ts`

- [ ] **Step 1: Add new record types at the end of `src/lib/server/types/db.ts`**

Append after the last existing type in the file:

```typescript
// ============ groups table ============
export interface GroupRecord {
  id: number;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface GroupRecordInsert {
  name: string;
  description?: string | null;
}

// ============ users_groups table ============
export interface UserGroupRecord {
  users_id: number;
  groups_id: number;
  created_at: Date;
  updated_at: Date;
}

// ============ groups_roles table ============
export interface GroupRoleRecord {
  groups_id: number;
  roles_id: string;
  created_at: Date;
  updated_at: Date;
}

// ============ roles_pages table ============
export interface RolePageRecord {
  roles_id: string;
  pages_id: number;
  inherit_monitors: number;  // 0 | 1
  created_at: Date;
  updated_at: Date;
}

// ============ roles_monitors table ============
export interface RoleMonitorRecord {
  roles_id: string;
  monitor_tag: string;
  created_at: Date;
  updated_at: Date;
}

// ============ effective access (computed, not a DB table) ============
export interface EffectiveAccessEntry {
  source: "direct" | "group";
  group_name?: string;    // set when source === 'group'
  role_id: string;
  role_name: string;
  pages: Array<{
    page_id: number;
    page_title: string;
    page_path: string;
    inherit_monitors: boolean;
    monitors: Array<{ monitor_tag: string; monitor_name: string }>;
  }>;
  direct_monitors: Array<{ monitor_tag: string; monitor_name: string }>;
}
```

- [ ] **Step 2: Update PageRecord to include new columns**

Find the `PageRecord` interface in `src/lib/server/types/db.ts` and add the two new fields:

```typescript
export interface PageRecord {
  id: number;
  page_path: string;
  page_title: string;
  page_header: string;
  page_subheader: string | null;
  page_logo: string | null;
  page_settings_json: string | null;
  is_public: number;          // ← new (0 | 1)
  visibility_mode: string;    // ← new ('hidden' | 'teaser' | 'locked')
  created_at: Date;
  updated_at: Date;
}
```

Also add to `PageRecordInsert`:

```typescript
export interface PageRecordInsert {
  page_path: string;
  page_title: string;
  page_header: string;
  page_subheader?: string | null;
  page_logo?: string | null;
  page_settings_json?: string | null;
  is_public?: number;         // ← new
  visibility_mode?: string;   // ← new
}
```

- [ ] **Step 3: Update MonitorRecord to include is_public**

In the `MonitorRecord` interface, add:

```typescript
export interface MonitorRecord {
  id: number;
  tag: string;
  name: string;
  // ... existing fields unchanged ...
  is_public: number;    // ← new (0 | 1)
  is_hidden: string;
  monitor_settings_json: string | null;
  created_at?: Date;
  updated_at?: Date;
}
```

- [ ] **Step 4: Type-check**

```bash
npm run check
```

Expected: No new type errors. Fix any that appear.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/types/db.ts
git commit -m "feat: add types for groups, roles_pages, roles_monitors, effective access"
```

---

## Task 3: GroupsRepository

**Files:**
- Create: `src/lib/server/db/repositories/groups.ts`

- [ ] **Step 1: Create the repository**

```typescript
// src/lib/server/db/repositories/groups.ts
import { BaseRepository, type CountResult } from "./base.js";
import type {
  GroupRecord,
  GroupRecordInsert,
  UserGroupRecord,
  GroupRoleRecord,
  UserRecordPublic,
  RoleRecord,
} from "../../types/db.js";

export class GroupsRepository extends BaseRepository {
  // ============ Groups ============

  async getAllGroups(): Promise<GroupRecord[]> {
    return this.knex("groups").select("*").orderBy("name", "asc");
  }

  async getGroupById(id: number): Promise<GroupRecord | undefined> {
    return this.knex("groups").where("id", id).first();
  }

  async createGroup(data: GroupRecordInsert): Promise<GroupRecord> {
    const [id] = await this.knex("groups").insert({
      name: data.name,
      description: data.description ?? null,
      created_at: this.knex.fn.now(),
      updated_at: this.knex.fn.now(),
    });
    return this.knex("groups").where("id", id).first() as Promise<GroupRecord>;
  }

  async updateGroup(id: number, data: Partial<GroupRecordInsert>): Promise<number> {
    return this.knex("groups")
      .where("id", id)
      .update({ ...data, updated_at: this.knex.fn.now() });
  }

  async deleteGroup(id: number): Promise<number> {
    return this.knex("groups").where("id", id).delete();
  }

  async getGroupsCount(): Promise<number> {
    const result = await this.knex("groups").count("* as count").first<CountResult>();
    return Number(result?.count ?? 0);
  }

  // ============ Group Members (users_groups) ============

  async getGroupMembers(groupId: number): Promise<UserRecordPublic[]> {
    return this.knex("users_groups")
      .join("users", "users_groups.users_id", "users.id")
      .where("users_groups.groups_id", groupId)
      .select(
        "users.id",
        "users.email",
        "users.name",
        "users.is_active",
        "users.is_verified",
        "users.is_owner",
        "users.created_at",
        "users.updated_at",
      )
      .then((rows) => rows.map((r) => ({ ...r, role_ids: [] }) as UserRecordPublic));
  }

  async addGroupMember(groupId: number, userId: number): Promise<void> {
    const exists = await this.knex("users_groups")
      .where({ groups_id: groupId, users_id: userId })
      .first();
    if (!exists) {
      await this.knex("users_groups").insert({
        groups_id: groupId,
        users_id: userId,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      });
    }
  }

  async removeGroupMember(groupId: number, userId: number): Promise<number> {
    return this.knex("users_groups")
      .where({ groups_id: groupId, users_id: userId })
      .delete();
  }

  async getMemberCount(groupId: number): Promise<number> {
    const result = await this.knex("users_groups")
      .where("groups_id", groupId)
      .count("* as count")
      .first<CountResult>();
    return Number(result?.count ?? 0);
  }

  // ============ Group Roles (groups_roles) ============

  async getGroupRoles(groupId: number): Promise<RoleRecord[]> {
    return this.knex("groups_roles")
      .join("roles", "groups_roles.roles_id", "roles.id")
      .where("groups_roles.groups_id", groupId)
      .select("roles.*");
  }

  async addGroupRole(groupId: number, roleId: string): Promise<void> {
    const exists = await this.knex("groups_roles")
      .where({ groups_id: groupId, roles_id: roleId })
      .first();
    if (!exists) {
      await this.knex("groups_roles").insert({
        groups_id: groupId,
        roles_id: roleId,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      });
    }
  }

  async removeGroupRole(groupId: number, roleId: string): Promise<number> {
    return this.knex("groups_roles")
      .where({ groups_id: groupId, roles_id: roleId })
      .delete();
  }

  async getRoleCount(groupId: number): Promise<number> {
    const result = await this.knex("groups_roles")
      .where("groups_id", groupId)
      .count("* as count")
      .first<CountResult>();
    return Number(result?.count ?? 0);
  }

  // ============ Lookup: which groups does a user belong to? ============

  async getGroupsForUser(userId: number): Promise<GroupRecord[]> {
    return this.knex("users_groups")
      .join("groups", "users_groups.groups_id", "groups.id")
      .where("users_groups.users_id", userId)
      .select("groups.*");
  }
}
```

- [ ] **Step 2: Register GroupsRepository on the db singleton**

Open `src/lib/server/db/db.ts` (find the file that exports `db` — search for it with `grep -r "class.*Repository" src/lib/server/db/db.ts`). Add:

```typescript
import { GroupsRepository } from "./repositories/groups.js";
// ... add to the db class:
readonly groups: GroupsRepository;
// ... in constructor:
this.groups = new GroupsRepository(knex);
```

Check the existing pattern in `db.ts` for how other repositories are registered and follow the exact same pattern.

- [ ] **Step 3: Type-check**

```bash
npm run check
```

Expected: No errors. Fix any type issues in GroupsRepository.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/repositories/groups.ts src/lib/server/db/db.ts
git commit -m "feat: add GroupsRepository (groups CRUD, members, group-roles)"
```

---

## Task 4: ResourceAccessRepository

**Files:**
- Create: `src/lib/server/db/repositories/resource-access.ts`

- [ ] **Step 1: Create the repository**

```typescript
// src/lib/server/db/repositories/resource-access.ts
import { BaseRepository } from "./base.js";
import type { RolePageRecord, RoleMonitorRecord, EffectiveAccessEntry } from "../../types/db.js";

export class ResourceAccessRepository extends BaseRepository {
  // ============ roles_pages ============

  async getRolePages(roleId: string): Promise<RolePageRecord[]> {
    return this.knex("roles_pages").where("roles_id", roleId).select("*");
  }

  async setRolePages(
    roleId: string,
    assignments: Array<{ pages_id: number; inherit_monitors: boolean }>,
  ): Promise<void> {
    await this.knex("roles_pages").where("roles_id", roleId).delete();
    if (assignments.length === 0) return;
    await this.knex("roles_pages").insert(
      assignments.map((a) => ({
        roles_id: roleId,
        pages_id: a.pages_id,
        inherit_monitors: a.inherit_monitors ? 1 : 0,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })),
    );
  }

  // ============ roles_monitors ============

  async getRoleMonitors(roleId: string): Promise<RoleMonitorRecord[]> {
    return this.knex("roles_monitors").where("roles_id", roleId).select("*");
  }

  async setRoleMonitors(roleId: string, monitorTags: string[]): Promise<void> {
    await this.knex("roles_monitors").where("roles_id", roleId).delete();
    if (monitorTags.length === 0) return;
    await this.knex("roles_monitors").insert(
      monitorTags.map((tag) => ({
        roles_id: roleId,
        monitor_tag: tag,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })),
    );
  }

  // ============ Effective access for a user ============
  // Returns the user's full resource access grouped by source (direct role / group).

  async getEffectiveAccess(userId: number): Promise<EffectiveAccessEntry[]> {
    const entries: EffectiveAccessEntry[] = [];

    // 1. Collect (source, role) pairs: direct + via groups
    const directRoleRows: Array<{ role_id: string; role_name: string }> = await this.knex("users_roles")
      .join("roles", "users_roles.roles_id", "roles.id")
      .where("users_roles.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select("roles.id as role_id", "roles.role_name");

    const groupRoleRows: Array<{
      group_id: number;
      group_name: string;
      role_id: string;
      role_name: string;
    }> = await this.knex("users_groups")
      .join("groups", "users_groups.groups_id", "groups.id")
      .join("groups_roles", "groups.id", "groups_roles.groups_id")
      .join("roles", "groups_roles.roles_id", "roles.id")
      .where("users_groups.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select(
        "groups.id as group_id",
        "groups.name as group_name",
        "roles.id as role_id",
        "roles.role_name",
      );

    // 2. For each (source, role) pair, fetch pages + monitors
    const buildEntry = async (
      source: "direct" | "group",
      role_id: string,
      role_name: string,
      group_name?: string,
    ): Promise<EffectiveAccessEntry> => {
      // Pages assigned to this role
      const rolePages = await this.knex("roles_pages")
        .join("pages", "roles_pages.pages_id", "pages.id")
        .where("roles_pages.roles_id", role_id)
        .select(
          "pages.id as page_id",
          "pages.page_title",
          "pages.page_path",
          "roles_pages.inherit_monitors",
        );

      const pagesWithMonitors = await Promise.all(
        rolePages.map(async (rp) => {
          let monitors: Array<{ monitor_tag: string; monitor_name: string }> = [];
          if (rp.inherit_monitors) {
            const pm = await this.knex("page_monitors")
              .join("monitors", "page_monitors.monitor_tag", "monitors.tag")
              .where("page_monitors.page_id", rp.page_id)
              .select("monitors.tag as monitor_tag", "monitors.name as monitor_name");
            monitors = pm;
          }
          return {
            page_id: rp.page_id as number,
            page_title: rp.page_title as string,
            page_path: rp.page_path as string,
            inherit_monitors: Boolean(rp.inherit_monitors),
            monitors,
          };
        }),
      );

      // Direct monitor assignments for this role
      const directMonitors = await this.knex("roles_monitors")
        .join("monitors", "roles_monitors.monitor_tag", "monitors.tag")
        .where("roles_monitors.roles_id", role_id)
        .select("monitors.tag as monitor_tag", "monitors.name as monitor_name");

      return {
        source,
        group_name,
        role_id,
        role_name,
        pages: pagesWithMonitors,
        direct_monitors: directMonitors,
      };
    };

    for (const r of directRoleRows) {
      entries.push(await buildEntry("direct", r.role_id, r.role_name));
    }
    for (const r of groupRoleRows) {
      entries.push(await buildEntry("group", r.role_id, r.role_name, r.group_name));
    }

    return entries;
  }

  // ============ Access check (used by canSeeResource) ============
  // Returns the set of page IDs and monitor tags a user can see.

  async getAccessibleResources(userId: number): Promise<{
    pageIds: Set<number>;
    monitorTags: Set<string>;
  }> {
    const pageIds = new Set<number>();
    const monitorTags = new Set<string>();

    // All effective role IDs (direct + via groups)
    const directRoleIds: Array<{ roles_id: string }> = await this.knex("users_roles")
      .join("roles", "users_roles.roles_id", "roles.id")
      .where("users_roles.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select("users_roles.roles_id");

    const groupRoleIds: Array<{ roles_id: string }> = await this.knex("users_groups")
      .join("groups_roles", "users_groups.groups_id", "groups_roles.groups_id")
      .join("roles", "groups_roles.roles_id", "roles.id")
      .where("users_groups.users_id", userId)
      .where("roles.status", "ACTIVE")
      .select("groups_roles.roles_id");

    const allRoleIds = [...new Set([
      ...directRoleIds.map((r) => r.roles_id),
      ...groupRoleIds.map((r) => r.roles_id),
    ])];

    if (allRoleIds.length === 0) return { pageIds, monitorTags };

    // Pages via roles_pages
    const rolePageRows: Array<{ pages_id: number; inherit_monitors: number }> = await this.knex("roles_pages")
      .whereIn("roles_id", allRoleIds)
      .select("pages_id", "inherit_monitors");

    for (const rp of rolePageRows) {
      pageIds.add(rp.pages_id);
      if (rp.inherit_monitors) {
        const pm: Array<{ monitor_tag: string }> = await this.knex("page_monitors")
          .where("page_id", rp.pages_id)
          .select("monitor_tag");
        pm.forEach((r) => monitorTags.add(r.monitor_tag));
      }
    }

    // Direct monitors via roles_monitors
    const directMonRows: Array<{ monitor_tag: string }> = await this.knex("roles_monitors")
      .whereIn("roles_id", allRoleIds)
      .select("monitor_tag");
    directMonRows.forEach((r) => monitorTags.add(r.monitor_tag));

    return { pageIds, monitorTags };
  }
}
```

- [ ] **Step 2: Register ResourceAccessRepository on the db singleton**

In `src/lib/server/db/db.ts`, following the existing pattern:

```typescript
import { ResourceAccessRepository } from "./repositories/resource-access.js";
// in class:
readonly resourceAccess: ResourceAccessRepository;
// in constructor:
this.resourceAccess = new ResourceAccessRepository(knex);
```

- [ ] **Step 3: Type-check**

```bash
npm run check
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/repositories/resource-access.ts src/lib/server/db/db.ts
git commit -m "feat: add ResourceAccessRepository (roles_pages, roles_monitors, access check)"
```

---

## Task 5: Update PagesRepository Column List

**Files:**
- Modify: `src/lib/server/db/repositories/pages.ts`

- [ ] **Step 1: Find the column selection in PagesRepository**

Open `src/lib/server/db/repositories/pages.ts`. Find where `getAllPages`, `getPageById`, `getPageByPath` select columns. If they use `select("*")`, no change needed. If they use an explicit column list, add `is_public` and `visibility_mode`.

- [ ] **Step 2: Verify pages return the new fields**

Run `npm run check`. If `PageRecord` now has `is_public` and `visibility_mode` but the repository returns `unknown` for them, add the columns to any explicit `select()` calls.

- [ ] **Step 3: Commit if any changes were needed**

```bash
git add src/lib/server/db/repositories/pages.ts
git commit -m "feat: include is_public, visibility_mode in pages repository selects"
```

---

## Task 6: New Permissions

**Files:**
- Modify: `src/lib/allPerms.ts`

- [ ] **Step 1: Add groups permissions to the `permissions` array**

In `src/lib/allPerms.ts`, add after the `// Roles` block:

```typescript
  // Groups
  { id: "groups.read", permission_name: "View groups and their members/roles" },
  { id: "groups.write", permission_name: "Create, update, and delete groups; manage members and role assignments" },
```

- [ ] **Step 2: Add groups actions to `ACTION_PERMISSION_MAP`**

```typescript
  // Groups
  getGroups: "groups.read",
  getGroup: "groups.read",
  getGroupMembers: "groups.read",
  getGroupRoles: "groups.read",
  createGroup: "groups.write",
  updateGroup: "groups.write",
  deleteGroup: "groups.write",
  addGroupMember: "groups.write",
  removeGroupMember: "groups.write",
  addGroupRole: "groups.write",
  removeGroupRole: "groups.write",

  // Resource access (role ↔ pages/monitors)
  getRolePages: "roles.read",
  getRoleMonitors: "roles.read",
  setRolePages: "roles.assign_permissions",
  setRoleMonitors: "roles.assign_permissions",

  // User effective access
  getUserEffectiveAccess: "users.read",
```

- [ ] **Step 3: Add groups route to `ROUTE_PERMISSION_MAP`**

```typescript
  "/(manage)/manage/app/groups": "groups.read",
  "/(manage)/manage/app/groups/[group_id]": "groups.read",
```

- [ ] **Step 4: Add groups permissions to the `admin` role seed**

Open `seeds/roles.ts`. The `rolePermissions` object derives `admin: allPermissionIds` automatically (all permissions), so no change needed there. Verify `editor` gets appropriate access: add `groups.read` and `groups.write` to editor if not already covered by `allPermissionIds.filter(id => id !== "api_keys.delete")`. (It will be covered automatically — no change needed.)

- [ ] **Step 5: Re-run seeds to insert new permissions**

```bash
npm run seed
```

Expected: New permissions inserted into `permissions` table, assigned to `admin` and `editor` roles.

- [ ] **Step 6: Type-check**

```bash
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/allPerms.ts seeds/roles.ts
git commit -m "feat: add groups.read/write permissions and resource access action mappings"
```

---

## Task 7: GroupsController + API Dispatcher Wiring

**Files:**
- Create: `src/lib/server/controllers/groupsController.ts`
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Create GroupsController**

```typescript
// src/lib/server/controllers/groupsController.ts
import db from "../db/db.js";
import type { GroupRecordInsert } from "../types/db.js";

export async function GetAllGroups() {
  const groups = await db.groups.getAllGroups();
  const withCounts = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      member_count: await db.groups.getMemberCount(g.id),
      role_count: await db.groups.getRoleCount(g.id),
    })),
  );
  return withCounts;
}

export async function GetGroupById(id: number) {
  return db.groups.getGroupById(id);
}

export async function CreateGroup(data: GroupRecordInsert) {
  if (!data.name?.trim()) throw new Error("Group name is required");
  return db.groups.createGroup(data);
}

export async function UpdateGroup(id: number, data: Partial<GroupRecordInsert>) {
  const updated = await db.groups.updateGroup(id, data);
  if (updated === 0) throw new Error("Group not found");
  return db.groups.getGroupById(id);
}

export async function DeleteGroup(id: number) {
  await db.groups.deleteGroup(id);
}

export async function GetGroupMembers(groupId: number) {
  return db.groups.getGroupMembers(groupId);
}

export async function AddGroupMember(groupId: number, userId: number) {
  await db.groups.addGroupMember(groupId, userId);
}

export async function RemoveGroupMember(groupId: number, userId: number) {
  await db.groups.removeGroupMember(groupId, userId);
}

export async function GetGroupRoles(groupId: number) {
  return db.groups.getGroupRoles(groupId);
}

export async function AddGroupRole(groupId: number, roleId: string) {
  await db.groups.addGroupRole(groupId, roleId);
}

export async function RemoveGroupRole(groupId: number, roleId: string) {
  await db.groups.removeGroupRole(groupId, roleId);
}
```

- [ ] **Step 2: Import GroupsController in the manage API dispatcher**

In `src/routes/(manage)/manage/api/+server.ts`, add this import alongside the other controller imports (near line 114):

```typescript
import {
  GetAllGroups,
  GetGroupById,
  CreateGroup,
  UpdateGroup,
  DeleteGroup,
  GetGroupMembers,
  AddGroupMember,
  RemoveGroupMember,
  GetGroupRoles,
  AddGroupRole,
  RemoveGroupRole,
} from "$lib/server/controllers/groupsController.js";
```

- [ ] **Step 3: Wire groups actions into the dispatcher**

Find the end of the existing `if/else if` chain in `+server.ts` (before the final `else` or closing of the try block). Add:

```typescript
    } else if (action == "getGroups") {
      resp = await GetAllGroups();
    } else if (action == "getGroup") {
      resp = await GetGroupById(data.id);
    } else if (action == "createGroup") {
      resp = await CreateGroup(data);
    } else if (action == "updateGroup") {
      const { id, ...updateData } = data;
      resp = await UpdateGroup(id, updateData);
    } else if (action == "deleteGroup") {
      await DeleteGroup(data.id);
      resp = { success: true };
    } else if (action == "getGroupMembers") {
      resp = await GetGroupMembers(data.groupId);
    } else if (action == "addGroupMember") {
      await AddGroupMember(data.groupId, data.userId);
      resp = { success: true };
    } else if (action == "removeGroupMember") {
      await RemoveGroupMember(data.groupId, data.userId);
      resp = { success: true };
    } else if (action == "getGroupRoles") {
      resp = await GetGroupRoles(data.groupId);
    } else if (action == "addGroupRole") {
      await AddGroupRole(data.groupId, data.roleId);
      resp = { success: true };
    } else if (action == "removeGroupRole") {
      await RemoveGroupRole(data.groupId, data.roleId);
      resp = { success: true };
```

- [ ] **Step 4: Type-check**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/controllers/groupsController.ts src/routes/\(manage\)/manage/api/+server.ts
git commit -m "feat: add GroupsController and wire groups actions into manage API dispatcher"
```

---

## Task 8: ResourceAccessController + Dispatcher Wiring

**Files:**
- Create: `src/lib/server/controllers/resourceAccessController.ts`
- Modify: `src/routes/(manage)/manage/api/+server.ts`

- [ ] **Step 1: Create ResourceAccessController**

```typescript
// src/lib/server/controllers/resourceAccessController.ts
import db from "../db/db.js";

export async function GetRolePages(roleId: string) {
  return db.resourceAccess.getRolePages(roleId);
}

export async function SetRolePages(
  roleId: string,
  assignments: Array<{ pages_id: number; inherit_monitors: boolean }>,
) {
  await db.resourceAccess.setRolePages(roleId, assignments);
}

export async function GetRoleMonitors(roleId: string) {
  return db.resourceAccess.getRoleMonitors(roleId);
}

export async function SetRoleMonitors(roleId: string, monitorTags: string[]) {
  await db.resourceAccess.setRoleMonitors(roleId, monitorTags);
}

export async function GetUserEffectiveAccess(userId: number) {
  return db.resourceAccess.getEffectiveAccess(userId);
}
```

- [ ] **Step 2: Import and wire in the dispatcher**

In `src/routes/(manage)/manage/api/+server.ts`, add:

```typescript
import {
  GetRolePages,
  SetRolePages,
  GetRoleMonitors,
  SetRoleMonitors,
  GetUserEffectiveAccess,
} from "$lib/server/controllers/resourceAccessController.js";
```

Add to the if/else chain:

```typescript
    } else if (action == "getRolePages") {
      resp = await GetRolePages(data.roleId);
    } else if (action == "setRolePages") {
      await SetRolePages(data.roleId, data.assignments);
      resp = { success: true };
    } else if (action == "getRoleMonitors") {
      resp = await GetRoleMonitors(data.roleId);
    } else if (action == "setRoleMonitors") {
      await SetRoleMonitors(data.roleId, data.monitorTags);
      resp = { success: true };
    } else if (action == "getUserEffectiveAccess") {
      resp = await GetUserEffectiveAccess(data.userId);
```

- [ ] **Step 3: Type-check**

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/controllers/resourceAccessController.ts src/routes/\(manage\)/manage/api/+server.ts
git commit -m "feat: add ResourceAccessController and wire role resource actions into dispatcher"
```

---

## Task 9: canSeeResource Utility + Public Page Enforcement

**Files:**
- Create: `src/lib/server/utils/canSeeResource.ts`
- Modify: `src/lib/server/controllers/dashboardController.ts`
- Modify: `src/routes/(kener)/[page_path]/+page.server.ts` (and `+page.svelte`)

- [ ] **Step 1: Create canSeeResource utility**

```typescript
// src/lib/server/utils/canSeeResource.ts
import db from "../db/db.js";
import type { UserRecordPublic } from "../types/db.js";

export type ResourceVisibility =
  | { visible: true }
  | { visible: false; mode: "hidden" | "teaser" | "locked" };

export async function canSeePage(
  user: UserRecordPublic | null,
  pageId: number,
  isPublic: number,
): Promise<boolean> {
  if (isPublic) return true;
  if (!user) return false;
  const { pageIds } = await db.resourceAccess.getAccessibleResources(user.id);
  return pageIds.has(pageId);
}

export async function canSeeMonitor(
  user: UserRecordPublic | null,
  monitorTag: string,
  isPublic: number,
): Promise<boolean> {
  if (isPublic) return true;
  if (!user) return false;
  const { monitorTags } = await db.resourceAccess.getAccessibleResources(user.id);
  return monitorTags.has(monitorTag);
}

// Returns how a private page should be rendered for an unauthorized user.
// Call only when canSeePage returned false.
export function getPageVisibility(visibilityMode: string): "hidden" | "teaser" | "locked" {
  if (visibilityMode === "teaser" || visibilityMode === "locked") return visibilityMode;
  return "hidden";
}
```

- [ ] **Step 2: Update GetPageDashboardData to filter resources**

In `src/lib/server/controllers/dashboardController.ts`, modify the function signature to accept the requesting user:

```typescript
export const GetPageDashboardData = async (
  pagePath: string,
  layoutData: LayoutServerData,
): Promise<PageDashboardData | null> => {
```

(The `layoutData.loggedInUser` is already available — use it for access checks.)

After `const { page: pageDetails, monitors: pageMonitors } = pageData;`, add:

```typescript
  // Resource visibility check
  const user = layoutData.loggedInUser;
  if (!pageDetails.is_public) {
    const hasAccess = user
      ? (await db.resourceAccess.getAccessibleResources(user.id)).pageIds.has(pageDetails.id)
      : false;
    if (!hasAccess) {
      const mode = pageDetails.visibility_mode as "hidden" | "teaser" | "locked";
      if (mode === "hidden") return null;
      // Return locked/teaser state — caller renders appropriate UI
      return {
        locked: true,
        lockedMode: mode,
        pageDetails: { ...pageDetails } as any,
        // minimal fields — component checks locked=true before rendering status
        pageStatus: BuildPageStatus([], GetMinuteStartNowTimestampUTC()),
        ongoingIncidents: [],
        ongoingMaintenances: [],
        upcomingMaintenances: [],
        monitorTags: [],
        monitorGroupMembersByTag: {},
        socialPagePreviewImage: layoutData.socialPreviewImage,
        metaPageTitle: layoutData.metaSiteTitle,
        metaPageDescription: layoutData.metaSiteDescription,
      } as any;
    }
  }

  // Filter monitors on this page to only those the user can see
  let visibleMonitorTags: string[];
  if (user) {
    const { monitorTags: accessibleTags } = await db.resourceAccess.getAccessibleResources(user.id);
    visibleMonitorTags = pageMonitors
      .filter((pm) => {
        // Public monitors are always shown; private ones require access
        // (Note: monitor is_public check requires joining — do it via accessibleTags or direct query)
        return true; // placeholder — see step 3
      })
      .map((pm) => pm.monitor_tag);
  } else {
    visibleMonitorTags = pageMonitors.map((pm) => pm.monitor_tag);
  }
```

**Note for step 3:** The monitor filtering logic needs to check `monitors.is_public` per monitor tag. Replace the placeholder above with:

```typescript
  // Fetch all monitors for this page with their is_public flag
  import db from "../db/db.js"; // (already imported via controller chain)

  const monitorPublicFlags: Array<{ tag: string; is_public: number }> = await db.knex("monitors")
    .whereIn("tag", pageMonitors.map((pm) => pm.monitor_tag))
    .select("tag", "is_public");
  const isPublicByTag = new Map(monitorPublicFlags.map((m) => [m.tag, m.is_public]));

  const accessibleMonitorTags = user
    ? (await db.resourceAccess.getAccessibleResources(user.id)).monitorTags
    : new Set<string>();

  visibleMonitorTags = pageMonitors
    .filter((pm) => {
      const isPublic = isPublicByTag.get(pm.monitor_tag) ?? 1;
      if (isPublic) return true;
      return accessibleMonitorTags.has(pm.monitor_tag);
    })
    .map((pm) => pm.monitor_tag);
```

Then replace the `monitorTags` const further down to use `visibleMonitorTags`:
```typescript
  const monitorTags = visibleMonitorTags;
```

- [ ] **Step 3: Update PageDashboardData type to allow locked state**

In `src/lib/server/types/` (find where `PageDashboardData` is defined — search with `grep -rn "PageDashboardData" src/`), add optional fields:

```typescript
export interface PageDashboardData {
  // ... existing fields ...
  locked?: boolean;
  lockedMode?: "teaser" | "locked";
}
```

- [ ] **Step 4: Update the kener page component to render locked/teaser states**

Find `src/routes/(kener)/[page_path]/+page.svelte`. In the template, add at the top of the page body:

```svelte
{#if data.locked && data.lockedMode === 'locked'}
  <div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <span class="text-4xl">🔒</span>
    <h2 class="text-xl font-semibold">{$t('page.private_title') || 'This page is private'}</h2>
    <p class="text-muted-foreground text-sm">{$t('page.private_description') || 'Sign in to view this status page.'}</p>
    <a href="/account/signin" class="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">
      {$t('common.sign_in') || 'Sign in'}
    </a>
  </div>
{:else if data.locked && data.lockedMode === 'teaser'}
  <!-- Show page header but replace monitor list with locked indicators -->
  <!-- ... existing page header rendering ... -->
  <div class="flex items-center gap-2 rounded border border-dashed p-3 opacity-60">
    <span>🔒</span>
    <span class="text-muted-foreground text-sm">{$t('page.login_required') || 'Login required to view status'}</span>
    <a href="/account/signin" class="text-primary ml-auto text-xs underline">{$t('common.sign_in') || 'Sign in'}</a>
  </div>
{:else}
  <!-- existing page content -->
{/if}
```

Adapt the exact component structure to match the existing template — look at what's currently in the `+page.svelte` to find the right insertion point.

- [ ] **Step 5: Type-check + run dev server**

```bash
npm run check
npm run dev
```

Navigate to a status page (`http://localhost:5173/`) and verify:
- Public pages still load normally
- A private page (after setting `is_public = 0` in the DB directly for testing) shows the appropriate locked/teaser state

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/utils/canSeeResource.ts \
        src/lib/server/controllers/dashboardController.ts \
        src/routes/\(kener\)/\[page_path\]/+page.svelte
git commit -m "feat: enforce resource-scoped visibility on public status pages"
```

---

## Task 10: Page Settings — visibility_mode Admin UI

**Files:**
- Modify: `src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte`

- [ ] **Step 1: Find the page settings form**

Open `src/routes/(manage)/manage/app/pages/[page_id]/+page.svelte`. Find where `updatePage` is called. The page object will now have `is_public` and `visibility_mode` fields from the DB.

- [ ] **Step 2: Add visibility controls to the page form**

In the page edit form, add a new section. Find a natural location near other page-level settings and insert:

```svelte
<!-- Visibility -->
<div class="space-y-3">
  <Label>Visibility</Label>
  <div class="flex items-center gap-2">
    <Switch
      id="is_public"
      checked={!!page.is_public}
      onCheckedChange={(v) => (page.is_public = v ? 1 : 0)}
    />
    <Label for="is_public" class="font-normal">Public (visible to everyone)</Label>
  </div>

  {#if !page.is_public}
    <div class="ml-6 space-y-2">
      <p class="text-muted-foreground text-xs">How should unauthorized users see this page?</p>
      {#each [
        { value: 'hidden', label: 'Hidden', desc: 'Does not appear at all' },
        { value: 'teaser', label: 'Login teaser', desc: 'Shows name, hides status' },
        { value: 'locked', label: 'Locked page', desc: 'Full-screen login prompt' },
      ] as opt}
        <label class="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name="visibility_mode"
            value={opt.value}
            checked={page.visibility_mode === opt.value}
            onchange={() => (page.visibility_mode = opt.value)}
            class="mt-0.5"
          />
          <span>
            <span class="text-sm font-medium">{opt.label}</span>
            <span class="text-muted-foreground ml-1 text-xs">— {opt.desc}</span>
          </span>
        </label>
      {/each}
    </div>
  {/if}
</div>
```

Make sure `page.is_public` and `page.visibility_mode` are part of the object passed to the `updatePage` action call. The `updatePage` action in the dispatcher calls `UpdatePage(id, updateData)` which passes everything through to `db.pages.updatePage()`.

- [ ] **Step 3: Type-check + manual test**

```bash
npm run check
npm run dev
```

Go to `/manage/app/pages` → open a page → verify the visibility section appears, toggle public/private, change mode, save, refresh, and confirm values persist.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(manage\)/manage/app/pages/\[page_id\]/+page.svelte
git commit -m "feat: add visibility_mode controls to page settings admin UI"
```

---

## Task 11: Groups Overview Page

**Files:**
- Create: `src/routes/(manage)/manage/app/groups/+page.svelte`

- [ ] **Step 1: Create the groups overview page**

Follow the exact same structure as `src/routes/(manage)/manage/app/roles/+page.svelte`. The page needs:
- Table of groups: Name, Description, Members, Roles, Actions
- Create group dialog
- Delete group confirmation dialog
- Navigation to group detail on row click

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "$lib/components/ui/dialog";
  import { goto } from "$app/navigation";

  const apiUrl = "/manage/api";

  type Group = {
    id: number;
    name: string;
    description: string | null;
    member_count: number;
    role_count: number;
  };

  let groups = $state<Group[]>([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let newName = $state("");
  let newDesc = $state("");
  let creating = $state(false);
  let deleteTarget = $state<Group | null>(null);
  let deleting = $state(false);

  async function api(action: string, data: Record<string, unknown> = {}) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  async function loadGroups() {
    loading = true;
    groups = await api("getGroups");
    loading = false;
  }

  async function createGroup() {
    if (!newName.trim()) return;
    creating = true;
    try {
      const g = await api("createGroup", { name: newName.trim(), description: newDesc.trim() || null });
      showCreate = false;
      newName = "";
      newDesc = "";
      goto(`/manage/app/groups/${g.id}`);
    } finally {
      creating = false;
    }
  }

  async function deleteGroup() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await api("deleteGroup", { id: deleteTarget.id });
      deleteTarget = null;
      await loadGroups();
    } finally {
      deleting = false;
    }
  }

  onMount(loadGroups);
</script>

<div class="space-y-4 p-6">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Groups</h1>
    <Button onclick={() => (showCreate = true)}>New Group</Button>
  </div>

  {#if loading}
    <p class="text-muted-foreground">Loading…</p>
  {:else if groups.length === 0}
    <p class="text-muted-foreground">No groups yet. Create one to get started.</p>
  {:else}
    <div class="rounded-md border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="px-4 py-2 text-left font-medium">Name</th>
            <th class="px-4 py-2 text-left font-medium">Description</th>
            <th class="px-4 py-2 text-right font-medium">Members</th>
            <th class="px-4 py-2 text-right font-medium">Roles</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {#each groups as group}
            <tr
              class="hover:bg-muted/30 cursor-pointer border-t"
              onclick={() => goto(`/manage/app/groups/${group.id}`)}
            >
              <td class="px-4 py-2 font-medium">{group.name}</td>
              <td class="text-muted-foreground px-4 py-2">{group.description ?? "—"}</td>
              <td class="px-4 py-2 text-right">{group.member_count}</td>
              <td class="px-4 py-2 text-right">{group.role_count}</td>
              <td class="px-4 py-2 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={(e) => { e.stopPropagation(); deleteTarget = group; }}
                >Delete</Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Create dialog -->
<Dialog bind:open={showCreate}>
  <DialogContent>
    <DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
    <div class="space-y-3">
      <div>
        <Label>Name</Label>
        <Input bind:value={newName} placeholder="e.g. Customers" />
      </div>
      <div>
        <Label>Description (optional)</Label>
        <Input bind:value={newDesc} placeholder="What is this group for?" />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onclick={() => (showCreate = false)}>Cancel</Button>
      <Button onclick={createGroup} disabled={creating || !newName.trim()}>
        {creating ? "Creating…" : "Create"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Delete dialog -->
<Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) deleteTarget = null; }}>
  <DialogContent>
    <DialogHeader><DialogTitle>Delete Group</DialogTitle></DialogHeader>
    <p>Delete <strong>{deleteTarget?.name}</strong>? This removes all member and role assignments. Status page access granted via this group will be revoked.</p>
    <DialogFooter>
      <Button variant="outline" onclick={() => (deleteTarget = null)}>Cancel</Button>
      <Button variant="destructive" onclick={deleteGroup} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Add Groups link to the sidebar navigation**

Find the sidebar navigation file (search: `grep -rn "roles\|manage/app" src/routes/(manage)/manage/+layout.svelte`). Add a Groups link next to the Roles link, following the same markup pattern.

- [ ] **Step 3: Type-check + manual test**

```bash
npm run check
npm run dev
```

Navigate to `/manage/app/groups`. Verify: groups list loads, create dialog works, delete dialog works, clicking a row navigates to the detail page (404 is fine until Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(manage\)/manage/app/groups/+page.svelte
git commit -m "feat: add Groups overview page (/manage/app/groups)"
```

---

## Task 12: Group Detail Page (Members + Roles Tabs)

**Files:**
- Create: `src/routes/(manage)/manage/app/groups/[group_id]/+page.svelte`

- [ ] **Step 1: Create the group detail page**

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import { Tabs, TabsList, TabsTrigger, TabsContent } from "$lib/components/ui/tabs";

  const apiUrl = "/manage/api";
  const groupId = $derived(Number($page.params.group_id));

  type Member = { id: number; name: string; email: string };
  type Role = { id: string; role_name: string; readonly: number };
  type User = { id: number; name: string; email: string };
  type Group = { id: number; name: string; description: string | null };

  let group = $state<Group | null>(null);
  let members = $state<Member[]>([]);
  let groupRoles = $state<Role[]>([]);
  let allUsers = $state<User[]>([]);
  let allRoles = $state<Role[]>([]);
  let memberSearch = $state("");
  let roleSearch = $state("");
  let loading = $state(true);
  let editingName = $state(false);
  let draftName = $state("");
  let draftDesc = $state("");

  async function api(action: string, data: Record<string, unknown> = {}) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  async function loadAll() {
    loading = true;
    [group, members, groupRoles, allUsers, allRoles] = await Promise.all([
      api("getGroup", { id: groupId }),
      api("getGroupMembers", { groupId }),
      api("getGroupRoles", { groupId }),
      api("getUsers"),
      api("getRoles"),
    ]);
    draftName = group?.name ?? "";
    draftDesc = group?.description ?? "";
    loading = false;
  }

  async function saveGroupName() {
    await api("updateGroup", { id: groupId, name: draftName, description: draftDesc });
    group = { ...group!, name: draftName, description: draftDesc };
    editingName = false;
  }

  async function addMember(userId: number) {
    await api("addGroupMember", { groupId, userId });
    members = await api("getGroupMembers", { groupId });
  }

  async function removeMember(userId: number) {
    await api("removeGroupMember", { groupId, userId });
    members = members.filter((m) => m.id !== userId);
  }

  async function addRole(roleId: string) {
    await api("addGroupRole", { groupId, roleId });
    groupRoles = await api("getGroupRoles", { groupId });
  }

  async function removeRole(roleId: string) {
    await api("removeGroupRole", { groupId, roleId });
    groupRoles = groupRoles.filter((r) => r.id !== roleId);
  }

  const memberIds = $derived(new Set(members.map((m) => m.id)));
  const groupRoleIds = $derived(new Set(groupRoles.map((r) => r.id)));

  const availableUsers = $derived(
    allUsers.filter(
      (u) => !memberIds.has(u.id) &&
        (memberSearch === "" ||
          u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(memberSearch.toLowerCase())),
    ),
  );

  const availableRoles = $derived(
    allRoles.filter(
      (r) => !groupRoleIds.has(r.id) &&
        (roleSearch === "" || r.role_name.toLowerCase().includes(roleSearch.toLowerCase())),
    ),
  );

  onMount(loadAll);
</script>

{#if loading}
  <p class="p-6 text-muted-foreground">Loading…</p>
{:else if !group}
  <p class="p-6">Group not found.</p>
{:else}
  <div class="space-y-4 p-6">
    <!-- Header -->
    {#if editingName}
      <div class="flex items-center gap-2">
        <Input bind:value={draftName} class="max-w-xs text-xl font-bold" />
        <Input bind:value={draftDesc} placeholder="Description" class="max-w-sm" />
        <Button onclick={saveGroupName}>Save</Button>
        <Button variant="outline" onclick={() => (editingName = false)}>Cancel</Button>
      </div>
    {:else}
      <div class="flex items-center gap-3">
        <div>
          <h1 class="text-2xl font-bold">{group.name}</h1>
          {#if group.description}<p class="text-muted-foreground text-sm">{group.description}</p>{/if}
        </div>
        <Button variant="ghost" size="sm" onclick={() => (editingName = true)}>Edit</Button>
      </div>
    {/if}

    <Tabs defaultValue="members">
      <TabsList>
        <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
        <TabsTrigger value="roles">Roles ({groupRoles.length})</TabsTrigger>
      </TabsList>

      <!-- Members Tab -->
      <TabsContent value="members" class="space-y-4 pt-4">
        <div>
          <h3 class="mb-2 text-sm font-medium">Current Members</h3>
          {#if members.length === 0}
            <p class="text-muted-foreground text-sm">No members yet.</p>
          {:else}
            <div class="space-y-1">
              {#each members as m}
                <div class="flex items-center justify-between rounded border px-3 py-2">
                  <div>
                    <span class="font-medium">{m.name}</span>
                    <span class="text-muted-foreground ml-2 text-xs">{m.email}</span>
                  </div>
                  <Button variant="ghost" size="sm" onclick={() => removeMember(m.id)}>Remove</Button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium">Add Members</h3>
          <Input bind:value={memberSearch} placeholder="Search users…" class="mb-2 max-w-xs" />
          <div class="max-h-48 space-y-1 overflow-y-auto">
            {#each availableUsers as u}
              <div class="flex items-center justify-between rounded border px-3 py-2">
                <div>
                  <span class="font-medium">{u.name}</span>
                  <span class="text-muted-foreground ml-2 text-xs">{u.email}</span>
                </div>
                <Button variant="outline" size="sm" onclick={() => addMember(u.id)}>Add</Button>
              </div>
            {/each}
            {#if availableUsers.length === 0}
              <p class="text-muted-foreground text-sm">No more users to add.</p>
            {/if}
          </div>
        </div>
      </TabsContent>

      <!-- Roles Tab -->
      <TabsContent value="roles" class="space-y-4 pt-4">
        <div>
          <h3 class="mb-2 text-sm font-medium">Assigned Roles</h3>
          {#if groupRoles.length === 0}
            <p class="text-muted-foreground text-sm">No roles assigned.</p>
          {:else}
            <div class="space-y-1">
              {#each groupRoles as r}
                <div class="flex items-center justify-between rounded border px-3 py-2">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{r.role_name}</span>
                    {#if r.readonly}<Badge variant="secondary">System</Badge>{/if}
                  </div>
                  <Button variant="ghost" size="sm" onclick={() => removeRole(r.id)}>Remove</Button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div>
          <h3 class="mb-2 text-sm font-medium">Add Roles</h3>
          <Input bind:value={roleSearch} placeholder="Search roles…" class="mb-2 max-w-xs" />
          <div class="max-h-48 space-y-1 overflow-y-auto">
            {#each availableRoles as r}
              <div class="flex items-center justify-between rounded border px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{r.role_name}</span>
                  {#if r.readonly}<Badge variant="secondary">System</Badge>{/if}
                </div>
                <Button variant="outline" size="sm" onclick={() => addRole(r.id)}>Add</Button>
              </div>
            {/each}
            {#if availableRoles.length === 0}
              <p class="text-muted-foreground text-sm">No more roles to add.</p>
            {/if}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
{/if}
```

- [ ] **Step 2: Verify `getUsers` and `getRoles` actions exist in the dispatcher**

Check `src/routes/(manage)/manage/api/+server.ts` for `action == "getUsers"` and `action == "getRoles"`. These likely already exist (roles page uses them). If `getUsers` returns paginated data, switch to `getAllUsers` — check which action name returns a flat list.

- [ ] **Step 3: Type-check + manual test**

```bash
npm run check
npm run dev
```

Create a group, navigate to its detail. Test: add/remove members, add/remove roles. Verify counts update.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(manage\)/manage/app/groups/\[group_id\]/+page.svelte
git commit -m "feat: add Group detail page (members + roles tabs)"
```

---

## Task 13: Role Editor — Visibility Tab

**Files:**
- Modify: `src/routes/(manage)/manage/app/roles/+page.svelte`

- [ ] **Step 1: Add Visibility tab state to the roles page**

In `src/routes/(manage)/manage/app/roles/+page.svelte`, find the section where the role detail sheet/panel is opened. Add state variables for the Visibility tab:

```typescript
// Add near existing role state:
type RolePage = { roles_id: string; pages_id: number; inherit_monitors: number };
type RoleMonitor = { roles_id: string; monitor_tag: string };
type PageWithMonitors = { id: number; page_title: string; page_path: string; monitors: Array<{ monitor_tag: string; name: string }> };

let visibilityRoleId = $state<string | null>(null);
let visRolePages = $state<RolePage[]>([]);
let visRoleMonitors = $state<RoleMonitor[]>([]);
let allPagesForVis = $state<PageWithMonitors[]>([]);
let visLoading = $state(false);
let visSaving = $state(false);

async function openVisibility(roleId: string) {
  visibilityRoleId = roleId;
  visLoading = true;
  const [pages, monitors, allPages] = await Promise.all([
    apiCall("getRolePages", { roleId }),
    apiCall("getRoleMonitors", { roleId }),
    apiCall("getPages"),
  ]);
  visRolePages = pages;
  visRoleMonitors = monitors;
  allPagesForVis = allPages;
  visLoading = false;
}

function isPageAssigned(pageId: number): boolean {
  return visRolePages.some((rp) => rp.pages_id === pageId);
}

function getPageInherit(pageId: number): boolean {
  return visRolePages.find((rp) => rp.pages_id === pageId)?.inherit_monitors === 1;
}

function togglePage(pageId: number) {
  if (isPageAssigned(pageId)) {
    visRolePages = visRolePages.filter((rp) => rp.pages_id !== pageId);
  } else {
    visRolePages = [...visRolePages, { roles_id: visibilityRoleId!, pages_id: pageId, inherit_monitors: 1 }];
  }
}

function toggleInherit(pageId: number) {
  visRolePages = visRolePages.map((rp) =>
    rp.pages_id === pageId ? { ...rp, inherit_monitors: rp.inherit_monitors ? 0 : 1 } : rp,
  );
}

function isMonitorDirectlyAssigned(tag: string): boolean {
  return visRoleMonitors.some((rm) => rm.monitor_tag === tag);
}

function isMonitorCoveredByPage(tag: string): boolean {
  // Covered if monitor belongs to an assigned page with inherit_monitors=1
  return visRolePages
    .filter((rp) => rp.inherit_monitors)
    .some((rp) => {
      const p = allPagesForVis.find((p) => p.id === rp.pages_id);
      return p?.monitors.some((m) => m.monitor_tag === tag);
    });
}

function toggleMonitor(tag: string) {
  if (isMonitorDirectlyAssigned(tag)) {
    visRoleMonitors = visRoleMonitors.filter((rm) => rm.monitor_tag !== tag);
  } else {
    visRoleMonitors = [...visRoleMonitors, { roles_id: visibilityRoleId!, monitor_tag: tag }];
  }
}

async function saveVisibility() {
  if (!visibilityRoleId) return;
  visSaving = true;
  await Promise.all([
    apiCall("setRolePages", {
      roleId: visibilityRoleId,
      assignments: visRolePages.map((rp) => ({
        pages_id: rp.pages_id,
        inherit_monitors: rp.inherit_monitors === 1,
      })),
    }),
    apiCall("setRoleMonitors", {
      roleId: visibilityRoleId,
      monitorTags: visRoleMonitors.map((rm) => rm.monitor_tag),
    }),
  ]);
  visSaving = false;
  visibilityRoleId = null;
}
```

- [ ] **Step 2: Add Visibility button to each role row and the Visibility panel/sheet**

In the roles table row, find the existing action buttons (e.g., Permissions, Users) and add:

```svelte
<Button variant="outline" size="sm" onclick={() => openVisibility(role.id)}>
  Visibility
</Button>
```

Add a new Sheet/Dialog (following the existing sheet pattern in the file) for the visibility editor:

```svelte
<!-- Visibility Sheet -->
{#if visibilityRoleId !== null}
  <Sheet open={true} onOpenChange={(v) => { if (!v) visibilityRoleId = null; }}>
    <SheetContent class="w-[600px] overflow-y-auto sm:max-w-[600px]">
      <SheetHeader>
        <SheetTitle>Resource Visibility</SheetTitle>
        <SheetDescription>
          Assign Pages and Monitors this role can access. Users with this role see only these resources (plus public ones).
        </SheetDescription>
      </SheetHeader>

      {#if visLoading}
        <p class="mt-4 text-muted-foreground">Loading…</p>
      {:else}
        <div class="mt-4 grid grid-cols-2 gap-6">
          <!-- Pages panel -->
          <div>
            <h3 class="mb-2 text-sm font-semibold">Pages</h3>
            <div class="space-y-2">
              {#each allPagesForVis as p}
                <div class="rounded border p-2">
                  <label class="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPageAssigned(p.id)}
                      onchange={() => togglePage(p.id)}
                    />
                    <span class="text-sm font-medium">{p.page_title}</span>
                    <span class="text-muted-foreground text-xs">/{p.page_path}</span>
                  </label>
                  {#if isPageAssigned(p.id)}
                    <label class="ml-5 mt-1 flex cursor-pointer items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={getPageInherit(p.id)}
                        onchange={() => toggleInherit(p.id)}
                      />
                      Inherit monitors ({p.monitors.length})
                    </label>
                  {/if}
                </div>
              {/each}
              {#if allPagesForVis.length === 0}
                <p class="text-muted-foreground text-xs">No pages.</p>
              {/if}
            </div>
          </div>

          <!-- Monitors panel -->
          <div>
            <h3 class="mb-2 text-sm font-semibold">Direct Monitors</h3>
            <p class="text-muted-foreground mb-2 text-xs">Monitors already covered via page inheritance are shown as covered.</p>
            <div class="space-y-1">
              {#each allPagesForVis.flatMap(p => p.monitors) as m}
                {#if !isMonitorCoveredByPage(m.monitor_tag)}
                  <label class="flex cursor-pointer items-center gap-2 rounded border px-2 py-1">
                    <input
                      type="checkbox"
                      checked={isMonitorDirectlyAssigned(m.monitor_tag)}
                      onchange={() => toggleMonitor(m.monitor_tag)}
                    />
                    <span class="text-sm">{m.name ?? m.monitor_tag}</span>
                  </label>
                {:else}
                  <div class="text-muted-foreground flex items-center gap-2 rounded border border-dashed px-2 py-1 opacity-50">
                    <span class="text-xs">✓ {m.name ?? m.monitor_tag}</span>
                    <span class="text-xs">(via page)</span>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <Button variant="outline" onclick={() => (visibilityRoleId = null)}>Cancel</Button>
          <Button onclick={saveVisibility} disabled={visSaving}>
            {visSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      {/if}
    </SheetContent>
  </Sheet>
{/if}
```

- [ ] **Step 3: Type-check + manual test**

```bash
npm run check
npm run dev
```

Go to `/manage/app/roles` → click Visibility on a role → assign pages with inherit_monitors → save → reopen and verify persistence. Test that a monitor covered by a page shows as "(via page)" and cannot be double-assigned.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(manage\)/manage/app/roles/+page.svelte
git commit -m "feat: add Visibility tab to role editor (pages + monitors assignment)"
```

---

## Task 14: User Detail — Effective Access Tab

**Files:**
- Modify: `src/routes/(manage)/manage/app/users/+page.svelte`

- [ ] **Step 1: Add effective access state to the users page**

Open `src/routes/(manage)/manage/app/users/+page.svelte`. Find where the user detail sheet/panel is opened. Add:

```typescript
import type { EffectiveAccessEntry } from "$lib/server/types/db";  // adjust if client-safe type needed

let effectiveAccessUserId = $state<number | null>(null);
let effectiveAccess = $state<EffectiveAccessEntry[]>([]);
let accessLoading = $state(false);

async function openEffectiveAccess(userId: number) {
  effectiveAccessUserId = userId;
  accessLoading = true;
  effectiveAccess = await apiCall("getUserEffectiveAccess", { userId });
  accessLoading = false;
}
```

- [ ] **Step 2: Add Effective Access button to user rows**

In the users table, add a button per row:

```svelte
<Button variant="outline" size="sm" onclick={() => openEffectiveAccess(user.id)}>
  Access
</Button>
```

- [ ] **Step 3: Add the Effective Access sheet**

```svelte
{#if effectiveAccessUserId !== null}
  <Sheet open={true} onOpenChange={(v) => { if (!v) effectiveAccessUserId = null; }}>
    <SheetContent class="w-[560px] overflow-y-auto sm:max-w-[560px]">
      <SheetHeader>
        <SheetTitle>Effective Access</SheetTitle>
        <SheetDescription>Resources this user can access, grouped by source.</SheetDescription>
      </SheetHeader>

      {#if accessLoading}
        <p class="mt-4 text-muted-foreground">Loading…</p>
      {:else if effectiveAccess.length === 0}
        <p class="mt-4 text-muted-foreground text-sm">This user has no resource-scoped access yet.</p>
      {:else}
        <div class="mt-4 space-y-4">
          {#each effectiveAccess as entry}
            <div class="rounded border p-3">
              <!-- Source header -->
              <div class="mb-2 flex items-center gap-2">
                {#if entry.source === "direct"}
                  <span class="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">Direct</span>
                {:else}
                  <span class="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200">Group: {entry.group_name}</span>
                {/if}
                <span class="text-muted-foreground text-xs">Role: {entry.role_name}</span>
              </div>

              <!-- Pages -->
              {#each entry.pages as p}
                <div class="ml-2 mt-1">
                  <div class="flex items-center gap-1 text-sm font-medium">
                    <span>🗂</span> {p.page_title}
                  </div>
                  {#if p.inherit_monitors && p.monitors.length > 0}
                    <div class="ml-4 mt-0.5 flex flex-wrap gap-1">
                      {#each p.monitors as m}
                        <span class="rounded bg-muted px-1.5 py-0.5 text-xs">{m.monitor_name} <span class="text-muted-foreground">(geerbt)</span></span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}

              <!-- Direct monitors -->
              {#if entry.direct_monitors.length > 0}
                <div class="ml-2 mt-1">
                  <span class="text-muted-foreground text-xs">Direct monitors:</span>
                  <div class="mt-0.5 flex flex-wrap gap-1">
                    {#each entry.direct_monitors as m}
                      <span class="rounded bg-muted px-1.5 py-0.5 text-xs">📡 {m.monitor_name}</span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if entry.pages.length === 0 && entry.direct_monitors.length === 0}
                <p class="text-muted-foreground ml-2 text-xs">No resources assigned to this role yet.</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </SheetContent>
  </Sheet>
{/if}
```

- [ ] **Step 4: Type-check + manual test**

```bash
npm run check
npm run dev
```

Go to `/manage/app/users` → click Access on a user → verify the sheet shows grouped access by source. Test a user with direct roles, a user in groups, and a user with no resource access.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(manage\)/manage/app/users/+page.svelte
git commit -m "feat: add Effective Access tab to user detail panel"
```

---

## Self-Review Checklist (completed inline)

**Spec coverage:**
- ✅ Data model (Task 1-2): all 5 new tables + new columns on pages + monitors
- ✅ Groups UI overview (Task 11): list + create + delete
- ✅ Groups UI detail (Task 12): members tab + roles tab
- ✅ Role Visibility tab (Task 13): pages panel + monitors panel + inherit toggle + save
- ✅ Page visibility_mode admin setting (Task 10)
- ✅ Public page enforcement (Task 9): hidden/teaser/locked + monitor filtering
- ✅ User effective access (Task 14): grouped by source (direct/group)
- ✅ Permissions + API wiring (Tasks 6-8)

**Gaps checked:**
- Groups sidebar navigation link: covered in Task 11 Step 2
- `getPages` action in dispatcher returns monitors per page: already true (checked in code at line 388-397)
- `EffectiveAccessEntry` references `monitor_name` — this is returned from the DB join as `monitors.name`; the type uses `monitor_name` as alias. Consistent throughout Tasks 4 and 14. ✅
- `allPagesForVis` from `getPages` action already returns `monitors` array per page (per dispatcher line 391-396). ✅

**Placeholder scan:** No TBD/TODO patterns.

**Type consistency:**
- `visRolePages` → `RolePage` (roles_id, pages_id, inherit_monitors) — matches Task 4's `RolePageRecord` ✅
- `visRoleMonitors` → `RoleMonitor` (roles_id, monitor_tag) — matches Task 4's `RoleMonitorRecord` ✅
- `EffectiveAccessEntry.pages[].monitors` → `{ monitor_tag, monitor_name }` — matches Task 4 join aliases ✅
