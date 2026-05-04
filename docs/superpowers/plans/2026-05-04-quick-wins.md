# Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five targeted admin UI improvements: menu reorder + distinct icons, sortable navigation, SVG logo support, monitor type filter, and manual timezone setting.

**Architecture:** All five tasks are independently committable frontend-only or small full-stack changes. Each modifies at most 2 files. The backend already supports monitor type filtering via `MonitorFilter.monitor_type`; SVG support adds an early-return path in `uploadImage` that bypasses sharp. Timezone uses `Intl.supportedValuesOf("timeZone")` — no extra packages.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), TypeScript, Tailwind CSS v4, shadcn-svelte, Lucide icons

---

## File Map

| Task | Files Modified |
|------|---------------|
| 1 – Menu reorder | `src/routes/(manage)/+layout.svelte` |
| 2 – Sortable nav | `src/routes/(manage)/manage/app/site-configurations/+page.svelte` |
| 3 – Monitor type filter | `src/routes/(manage)/manage/app/monitors/+page.svelte` |
| 4 – SVG support | `src/routes/(manage)/manage/api/+server.ts` + `src/routes/(manage)/manage/app/site-configurations/+page.svelte` |
| 5 – Timezone dropdown | `src/routes/(manage)/manage/app/internationalization/+page.svelte` |

---

### Task 1: Menu Reorder + Distinct Icons

**Files:**
- Modify: `src/routes/(manage)/+layout.svelte:24-54`

The current order in `allNavItems` (lines 52–54) is: Users, Roles, Groups.
Target order: Users, Groups, Roles.
Users currently uses `UsersIcon` (multi-person). Change to `UserIcon` (single person).
Groups keeps `UsersRoundIcon`. Roles keeps `ShieldIcon`.

- [ ] **Step 1: Add UserIcon import and reorder allNavItems**

Open `src/routes/(manage)/+layout.svelte`.

Replace:
```typescript
  import UsersIcon from "@lucide/svelte/icons/users";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import UsersRoundIcon from "@lucide/svelte/icons/users-round";
```
With:
```typescript
  import UserIcon from "@lucide/svelte/icons/user";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import UsersRoundIcon from "@lucide/svelte/icons/users-round";
```

Replace the three nav entries (currently lines 52–54):
```typescript
    { title: "Users", url: "/manage/app/users", icon: UsersIcon },
    { title: "Roles", url: "/manage/app/roles", icon: ShieldIcon },
    { title: "Groups", url: "/manage/app/groups", icon: UsersRoundIcon },
```
With:
```typescript
    { title: "Users", url: "/manage/app/users", icon: UserIcon },
    { title: "Groups", url: "/manage/app/groups", icon: UsersRoundIcon },
    { title: "Roles", url: "/manage/app/roles", icon: ShieldIcon },
```

- [ ] **Step 2: Type-check**

```bash
cd .worktrees/feature/granular-user-management && npm run check 2>&1 | tail -10
```
Expected: no errors related to the changed file.

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(manage\)/+layout.svelte
git commit -m "feat: reorder Users/Groups/Roles in sidebar, use distinct UserIcon for Users"
```

---

### Task 2: Sortable Navigation Menu

**Files:**
- Modify: `src/routes/(manage)/manage/app/site-configurations/+page.svelte`

The nav section lives around lines 1042–1093. Each nav item row has a single delete button. We add ↑/↓ buttons and a `moveNavItem` helper.

- [ ] **Step 1: Add ChevronUp/ChevronDown imports**

Open `src/routes/(manage)/manage/app/site-configurations/+page.svelte`.

After:
```typescript
  import Plus from "@lucide/svelte/icons/plus";
```
Add:
```typescript
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
```

- [ ] **Step 2: Add moveNavItem function**

Find the `removeNavItem` function (~line 739):
```typescript
  function removeNavItem(index: number) {
    nav = nav.filter((_, i) => i !== index);
  }
```
After it, add:
```typescript
  function moveNavItem(index: number, direction: "up" | "down") {
    const newNav = [...nav];
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= newNav.length) return;
    [newNav[index], newNav[swapWith]] = [newNav[swapWith], newNav[index]];
    nav = newNav;
  }
```

- [ ] **Step 3: Add Up/Down buttons to the nav item row**

Find the nav item row's action area (~line 1085):
```svelte
            <Button variant="ghost" size="icon" onclick={() => removeNavItem(index)}>
              <XIcon class="h-4 w-4" />
            </Button>
```
Replace with:
```svelte
            <Button variant="ghost" size="icon" disabled={index === 0} onclick={() => moveNavItem(index, "up")}>
              <ChevronUpIcon class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" disabled={index === nav.length - 1} onclick={() => moveNavItem(index, "down")}>
              <ChevronDownIcon class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onclick={() => removeNavItem(index)}>
              <XIcon class="h-4 w-4" />
            </Button>
```

- [ ] **Step 4: Type-check**

```bash
npm run check 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(manage\)/manage/app/site-configurations/+page.svelte
git commit -m "feat: add up/down reorder buttons to navigation menu items"
```

---

### Task 3: Monitor Type Filter

**Files:**
- Modify: `src/routes/(manage)/manage/app/monitors/+page.svelte`

The DB layer (`src/lib/server/db/repositories/monitors.ts:88-90`) already filters by `monitor_type` when present in `MonitorFilter`. The `GetMonitors` controller passes the filter straight through. No backend changes needed.

- [ ] **Step 1: Add typeFilter state and typeOptions**

Open `src/routes/(manage)/manage/app/monitors/+page.svelte`.

After:
```typescript
  let statusFilter = $state("ALL");
```
Add:
```typescript
  let typeFilter = $state("ALL");
```

After `statusOptions`, add:
```typescript
  const typeOptions = [
    { value: "ALL", label: "All Types" },
    { value: "API", label: "API" },
    { value: "PING", label: "Ping" },
    { value: "TCP", label: "TCP" },
    { value: "DNS", label: "DNS" },
    { value: "SSL", label: "SSL" },
    { value: "SQL", label: "SQL" },
    { value: "HEARTBEAT", label: "Heartbeat" },
    { value: "GAMEDIG", label: "GameDig" },
    { value: "GROUP", label: "Group" },
    { value: "GRPC", label: "gRPC" },
    { value: "NONE", label: "None" },
  ];
```

- [ ] **Step 2: Update hasActiveFilters and clearFilters**

Replace:
```typescript
  const hasActiveFilters = $derived(statusFilter !== "ALL" || searchQuery.trim() !== "");
```
With:
```typescript
  const hasActiveFilters = $derived(statusFilter !== "ALL" || typeFilter !== "ALL" || searchQuery.trim() !== "");
```

Replace inside `clearFilters`:
```typescript
  function clearFilters() {
    statusFilter = "ALL";
    searchQuery = "";
    pageNo = 1;
    fetchMonitors();
  }
```
With:
```typescript
  function clearFilters() {
    statusFilter = "ALL";
    typeFilter = "ALL";
    searchQuery = "";
    pageNo = 1;
    fetchMonitors();
  }
```

- [ ] **Step 3: Pass monitor_type in fetchMonitors**

Inside `fetchMonitors`, after:
```typescript
      if (statusFilter !== "ALL") {
        data.status = statusFilter;
      }
```
Add:
```typescript
      if (typeFilter !== "ALL") {
        data.monitor_type = typeFilter;
      }
```

- [ ] **Step 4: Add Type filter dropdown to the UI**

Find the Status filter dropdown block in the `{#if showFilters}` section (~line 128–146):
```svelte
        <div class="flex flex-col gap-1">
          <span class="text-muted-foreground text-xs font-medium">Status</span>
          <Select.Root
            type="single"
            value={statusFilter}
            onValueChange={(v) => {
              if (v) statusFilter = v;
            }}
          >
            <Select.Trigger class="w-40">
              {statusOptions.find((o) => o.value === statusFilter)?.label || "All Status"}
            </Select.Trigger>
            <Select.Content>
              {#each statusOptions as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
```
After that entire `<div class="flex flex-col gap-1">` block, add:
```svelte
        <div class="flex flex-col gap-1">
          <span class="text-muted-foreground text-xs font-medium">Type</span>
          <Select.Root
            type="single"
            value={typeFilter}
            onValueChange={(v) => {
              if (v) typeFilter = v;
            }}
          >
            <Select.Trigger class="w-40">
              {typeOptions.find((o) => o.value === typeFilter)?.label || "All Types"}
            </Select.Trigger>
            <Select.Content>
              {#each typeOptions as option (option.value)}
                <Select.Item value={option.value}>{option.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
```

- [ ] **Step 5: Type-check**

```bash
npm run check 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/\(manage\)/manage/app/monitors/+page.svelte
git commit -m "feat: add monitor type filter to monitors list"
```

---

### Task 4: SVG Logo/Favicon Support

**Files:**
- Modify: `src/routes/(manage)/manage/api/+server.ts:767-828`
- Modify: `src/routes/(manage)/manage/app/site-configurations/+page.svelte:599,842,912,982,1078`

The `uploadImage` function has two SVG throw blocks. We replace them with an early-return path that stores the raw SVG buffer, bypassing sharp.

- [ ] **Step 1: Enable SVG in allowedMimeTypes (backend)**

Open `src/routes/(manage)/manage/api/+server.ts`.

Replace line 767:
```typescript
  const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"];
```
With:
```typescript
  const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif", "image/svg+xml"];
```

- [ ] **Step 2: Remove first SVG throw and add SVG early return**

Find and remove lines 786–788:
```typescript
  if (normalizedRequestedMime === "image/svg+xml" || looksLikeSvg) {
    throw new Error("SVG uploads are not allowed");
  }
```
Replace with:
```typescript
  if (normalizedRequestedMime === "image/svg+xml" || looksLikeSvg) {
    const svgId = `${nanoid(16)}.svg`;
    await db.insertImage({
      id: svgId,
      data: imageBuffer.toString("base64"),
      mime_type: "image/svg+xml",
      original_name: fileName || null,
      width: null,
      height: null,
      size: imageBuffer.length,
    });
    return { id: svgId, url: `/assets/images/${svgId}` };
  }
```

- [ ] **Step 3: Remove second SVG throw (defensive cleanup)**

Find and remove lines 826–828 (the detectedMimeType check):
```typescript
  if (detectedMimeType === "image/svg+xml") {
    throw new Error("SVG uploads are not allowed");
  }
```
Delete those 3 lines entirely. (SVGs return early before this point now, but we remove it for consistency.)

- [ ] **Step 4: Enable SVG in frontend allowedTypes**

Open `src/routes/(manage)/manage/app/site-configurations/+page.svelte`.

Replace line 599:
```typescript
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
```
With:
```typescript
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
```

- [ ] **Step 5: Add SVG to all file input accept attributes**

There are 4 `accept` attributes to update (lines 842, 912, 982, 1078). All currently read:
```
accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
```
Change all 4 occurrences to:
```
accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif,image/svg+xml"
```

Use search-and-replace across the file (there are exactly 4 occurrences — logo, favicon, og-image, and nav icon inputs).

- [ ] **Step 6: Type-check**

```bash
npm run check 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/\(manage\)/manage/api/+server.ts \
        src/routes/\(manage\)/manage/app/site-configurations/+page.svelte
git commit -m "feat: allow SVG uploads for logo, favicon, and navigation icons"
```

---

### Task 5: Manual Timezone Setting

**Files:**
- Modify: `src/routes/(manage)/manage/app/internationalization/+page.svelte`

Add a searchable IANA timezone combobox (Command + Popover pattern) to the existing Timezone Settings card. The value is persisted as `manualTimezone` via `storeSiteData`.

- [ ] **Step 1: Add Popover, Command, and icon imports**

Open `src/routes/(manage)/manage/app/internationalization/+page.svelte`.

After the existing imports (after `import { format } from "date-fns";`), add:
```typescript
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Command from "$lib/components/ui/command/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import CheckIcon from "@lucide/svelte/icons/check";
```

- [ ] **Step 2: Add manualTimezone state and helpers**

After:
```typescript
  let tzToggle = $state("NO");
```
Add:
```typescript
  let manualTimezone = $state("");
  let tzOpen = $state(false);
  const timezones = Intl.supportedValuesOf("timeZone");
```

- [ ] **Step 3: Load manualTimezone in fetchSettings**

Inside `fetchSettings`, find the block that reads `tzToggle`:
```typescript
        if (result.tzToggle) {
          tzToggle = result.tzToggle;
        }
```
After it, add:
```typescript
        if (result.manualTimezone !== undefined) {
          manualTimezone = result.manualTimezone;
        }
```

- [ ] **Step 4: Save manualTimezone in saveTimezone**

Find `saveTimezone` (~line 130). Replace the `data` object:
```typescript
            data: {
              tzToggle: tzToggle
            }
```
With:
```typescript
            data: {
              tzToggle: tzToggle,
              manualTimezone: manualTimezone
            }
```

- [ ] **Step 5: Add timezone combobox to the Timezone Settings card**

Find the Timezone Settings card content section (~line 335–347):
```svelte
      <Card.Content class="space-y-4">
        <p class="text-muted-foreground text-sm">
          Kener automatically detects the user's timezone and displays times accordingly. You can optionally allow users
          to manually switch between different timezones.
        </p>
        <div class="flex items-center space-x-3">
          <Switch
            id="tz-toggle"
            checked={tzToggle === "YES"}
            onCheckedChange={(checked) => (tzToggle = checked ? "YES" : "NO")}
          />
          <Label for="tz-toggle" class="font-normal">Allow users to switch timezones</Label>
        </div>
      </Card.Content>
```
Replace with:
```svelte
      <Card.Content class="space-y-4">
        <p class="text-muted-foreground text-sm">
          Kener automatically detects the user's timezone and displays times accordingly. You can optionally allow users
          to manually switch between different timezones.
        </p>
        <div class="flex items-center space-x-3">
          <Switch
            id="tz-toggle"
            checked={tzToggle === "YES"}
            onCheckedChange={(checked) => (tzToggle = checked ? "YES" : "NO")}
          />
          <Label for="tz-toggle" class="font-normal">Allow users to switch timezones</Label>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Server Timezone Override</Label>
          <p class="text-muted-foreground text-xs">
            Set a fixed IANA timezone for the server. Leave empty to use the system default.
          </p>
          <Popover.Root bind:open={tzOpen}>
            <Popover.Trigger>
              <Button variant="outline" role="combobox" class="w-72 justify-between font-normal">
                {manualTimezone || "System default"}
                <ChevronsUpDownIcon class="text-muted-foreground size-4 shrink-0" />
              </Button>
            </Popover.Trigger>
            <Popover.Content class="w-72 p-0" align="start">
              <Command.Root>
                <Command.Input placeholder="Search timezone..." />
                <Command.List class="max-h-60">
                  <Command.Empty>No timezone found.</Command.Empty>
                  <Command.Group>
                    <Command.Item value="" onSelect={() => { manualTimezone = ""; tzOpen = false; }}>
                      <CheckIcon class="size-4 {manualTimezone === '' ? 'opacity-100' : 'opacity-0'}" />
                      System default
                    </Command.Item>
                    {#each timezones as tz (tz)}
                      <Command.Item value={tz} onSelect={() => { manualTimezone = tz; tzOpen = false; }}>
                        <CheckIcon class="size-4 {manualTimezone === tz ? 'opacity-100' : 'opacity-0'}" />
                        {tz}
                      </Command.Item>
                    {/each}
                  </Command.Group>
                </Command.List>
              </Command.Root>
            </Popover.Content>
          </Popover.Root>
        </div>
      </Card.Content>
```

- [ ] **Step 6: Type-check**

```bash
npm run check 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/\(manage\)/manage/app/internationalization/+page.svelte
git commit -m "feat: add manual timezone override setting with searchable IANA dropdown"
```
