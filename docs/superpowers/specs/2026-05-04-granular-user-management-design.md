# Granular User Management — Design Spec

**Date:** 2026-05-04
**Status:** Approved

---

## Goal

Extend Kener's existing RBAC system so that authenticated users only see the Status Pages and Monitors they are explicitly authorized to access — both internally (team members) and externally (customers).

Currently all permissions are global: a role grants access to *all* resources of a type (e.g. `pages.read` = all pages). This spec adds resource-scoped access control on top of the existing model without breaking it.

---

## Section 1 — Data Model

### New tables

```sql
-- User groups
groups
  id          INTEGER PRIMARY KEY AUTOINCREMENT
  name        TEXT NOT NULL
  description TEXT
  created_at  TIMESTAMP
  updated_at  TIMESTAMP

-- Users ↔ Groups (M:N)
users_groups
  users_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  groups_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  created_at  TIMESTAMP
  updated_at  TIMESTAMP
  PRIMARY KEY (users_id, groups_id)

-- Groups ↔ Roles (M:N)
groups_roles
  groups_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  roles_id    TEXT    NOT NULL REFERENCES roles(id)  ON DELETE CASCADE
  created_at  TIMESTAMP
  updated_at  TIMESTAMP
  PRIMARY KEY (groups_id, roles_id)

-- Roles ↔ Pages (resource-scoped)
roles_pages
  roles_id          TEXT    NOT NULL REFERENCES roles(id)  ON DELETE CASCADE
  pages_id          INTEGER NOT NULL REFERENCES pages(id)  ON DELETE CASCADE
  inherit_monitors  INTEGER NOT NULL DEFAULT 1   -- bool: 1 = monitors of this page are accessible too
  created_at        TIMESTAMP
  updated_at        TIMESTAMP
  PRIMARY KEY (roles_id, pages_id)

-- Roles ↔ Monitors (resource-scoped, direct)
roles_monitors
  roles_id    TEXT    NOT NULL REFERENCES roles(id)    ON DELETE CASCADE
  monitors_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE
  created_at  TIMESTAMP
  updated_at  TIMESTAMP
  PRIMARY KEY (roles_id, monitors_id)
```

### Existing tables — new columns

```sql
pages.is_public       BOOLEAN NOT NULL DEFAULT true
pages.visibility_mode TEXT    NOT NULL DEFAULT 'hidden'
  -- values: 'hidden' | 'teaser' | 'locked'
  -- controls how unauthorized users see this page (see Section 4)
  -- default 'hidden' is the most restrictive safe default; admins can relax it per-page

monitors.is_public    BOOLEAN NOT NULL DEFAULT true
```

### Visibility resolution (pseudo-code)

```
canSeeResource(user, resource):
  if resource.is_public → true
  if !user.isLoggedIn  → false

  directRoles   = user.roles
  groupRoles    = user.groups.flatMap(g => g.roles)
  effectiveRoles = union(directRoles, groupRoles)

  if resource is Page:
    return effectiveRoles.any(r => r.pages.includes(resource))

  if resource is Monitor:
    directAccess = effectiveRoles.any(r => r.monitors.includes(resource))
    pageAccess   = effectiveRoles.any(r =>
                     r.pages.any(p => p.inherit_monitors && p.monitors.includes(resource)))
    return directAccess || pageAccess
```

---

## Section 2 — Groups UI

Location: `/manage/app/groups`

### Groups overview page

- Table: Name, Description, Member count, Role count, Actions (Edit / Delete)
- "New Group" button → opens Edit screen

### Group edit screen (`/manage/app/groups/[id]`)

Two tabs:

**Members tab**
- Search + add users (autocomplete by name/email)
- List of current members with remove action
- Shows user avatar, name, email

**Roles tab**
- Multi-select of available roles (both system roles and custom roles)
- Each assigned role shows which Pages/Monitors it grants (expandable)
- Add/remove roles from the group

---

## Section 3 — Role Editor: Visibility Tab

Location: `/manage/app/roles/[id]`

A new **"Sichtbarkeit"** (Visibility) tab is added to the existing Role editor.

### Layout

Two panels side by side:

**Pages panel**
- List of all pages
- Each row: checkbox to assign, page name, toggle "Monitors erben" (`inherit_monitors`)
- When inherit_monitors = true: all monitors belonging to this page become implicitly accessible via this role

**Monitors panel**
- List of all monitors (filtered: monitors that belong to a page already assigned to *this role* with `inherit_monitors=true` are shown as covered and cannot be double-assigned)
- Each row: checkbox for direct assignment
- Shows which page the monitor belongs to

### Behaviour

- Save behaviour follows the existing role editor pattern (check current implementation before building)
- A role can have both page-level and direct monitor assignments
- The `inherit_monitors` toggle is per-page-per-role

---

## Section 4 — Public Status-Page Behavior

**Decision: Option D — Configurable per Page**

Each Page has a `visibility_mode` setting that controls what unauthorized users (anonymous or logged-in without access) see:

| Mode | Behaviour |
|------|-----------|
| `hidden` | Page/Monitor does not appear at all |
| `teaser` | Name visible, status replaced with 🔒 and "Login required" badge |
| `locked` | Entire page blocked — full-screen login prompt |

### Who is "unauthorized"?

- Anonymous visitor (not logged in)
- Logged-in user without a role that grants access to this page/monitor

### Monitor visibility inherits from page

When a monitor's page has `visibility_mode = 'hidden'`, the monitor is also hidden — regardless of the monitor's own `is_public` flag — unless the monitor has a direct role assignment granting it to the user.

### Admin UI

`visibility_mode` is set per-page in the Page settings under a new "Sichtbarkeit" section:

```
Visibility for unauthorized users
○ Hidden         — do not show this page at all
● Login teaser   — show name, hide status
○ Locked page    — block entire page with login screen
```

---

## Section 5 — User-Detail: Effective Access

Location: `/manage/app/users/[id]` — new tab **"Effektiver Zugriff"**

**Decision: Option B — Grouped by source**

### Layout

The tab shows the user's complete access, grouped by where the permission comes from:

```
[Direct assignment — Role: Editor]
  🗂 Internal Dashboard
     📡 API Monitor  📡 DB Health  (inherited via page)

[Group: Customers — Role: Viewer]
  🗂 Customer Status
     📡 API Gateway  📡 CDN  (inherited via page)

[Group: Engineering — Role: Viewer]
  🗂 DevOps Page
     📡 Kubernetes  📡 CI/CD  📡 Grafana  📡 Vault  📡 Registry  (inherited via page)
```

### Details

- **Read-only** — this tab only shows, never edits (editing happens on the Roles and Groups screens)
- Each section header shows: source badge (Direct / Group name) + role name
- Monitors show "geerbt" (inherited) label when accessible via page inheritance rather than direct assignment
- Empty state: "This user has no resource-scoped access yet."
- The view is computed at render time (no denormalized cache needed at this scale)

---

## Enforcement

### Public status page (`/(kener)/`)

SvelteKit `load` functions call `canSeeResource(user, page)` / `canSeeResource(user, monitor)` server-side. Result fed into existing page rendering:

- `hidden`: resource excluded from response
- `teaser`: resource included with `{ status: null, locked: true }`
- `locked`: entire page load returns `{ locked: true }` → renders login screen

### Manage API (`/(api)/manage/api`)

No change to the existing global permission check (e.g. `pages.read`). Resource-scoped filtering is applied *after* the action-level check for read operations that return lists.

Example: `getPages` still requires `pages.read`, but the returned list is filtered by the calling user's resource-scoped role assignments.

---

## Out of Scope

- Group nesting (groups inside groups)
- Per-monitor `visibility_mode` (only per-page for now)
- API key scoping (API keys retain global permissions)
- Subscription notifications for private monitors (existing subscriber model unchanged)

---

## Open Questions (resolved)

| Question | Decision |
|----------|----------|
| Internal + external users? | Both |
| Public/private granularity | Per-page and per-monitor (`is_public`) |
| Permission model | Role-based, extends existing RBAC |
| Group support | Yes — roles assignable to groups |
| Page vs monitor | Independent, with optional page→monitor inheritance |
| Visibility behavior | Configurable per page (hidden / teaser / locked) |
| User-detail layout | Grouped by source (direct + per group) |
