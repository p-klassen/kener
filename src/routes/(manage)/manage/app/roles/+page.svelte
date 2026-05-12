<script lang="ts">
  import * as Accordion from "$lib/components/ui/accordion/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import * as Checkbox from "$lib/components/ui/checkbox/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import LockIcon from "@lucide/svelte/icons/lock";
  import KeyIcon from "@lucide/svelte/icons/key";
  import UsersIcon from "@lucide/svelte/icons/users";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import UserMinusIcon from "@lucide/svelte/icons/user-minus";
  import UserPlusIcon from "@lucide/svelte/icons/user-plus";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import type { UserRecordPublic, RoleRecord } from "$lib/server/types/db.js";
  import { t } from "$lib/stores/i18n";

  interface Permission {
    id: string;
    permission_name: string;
  }

  interface RoleUser extends UserRecordPublic {
    roles_id: string;
  }

  interface PageData {
    userDb: UserRecordPublic;
    userPermissions: string[];
  }

  let { data }: { data: PageData } = $props();
  let currentUser = $derived(data.userDb);
  let userPermissions = $derived(data.userPermissions);

  function hasPermission(perm: string): boolean {
    return userPermissions.includes(perm);
  }

  // State
  let loading = $state(true);
  let roles = $state<RoleRecord[]>([]);
  let allPermissions = $state<Permission[]>([]);
  let allUsers = $state<UserRecordPublic[]>([]);

  // Create role dialog
  let showCreateDialog = $state(false);
  let creatingRole = $state(false);
  let createError = $state("");
  let newRole = $state({ role_id: "", name: "" });
  let createPermissionMode = $state<"pick" | "clone">("pick");
  let cloneFromRoleId = $state("");

  // Delete role dialog
  let showDeleteDialog = $state(false);
  let deletingRole = $state(false);
  let roleToDelete = $state<RoleRecord | null>(null);
  let deleteAction = $state<"migrate" | "remove">("remove");
  let deleteTargetRoleId = $state("");

  // Edit role dialog
  let showEditDialog = $state(false);
  let editingRole = $state(false);
  let editError = $state("");
  let roleToEdit = $state<RoleRecord | null>(null);
  let editRole = $state({ name: "", status: "ACTIVE" });

  // Permissions sheet
  let showPermissionsSheet = $state(false);
  let permissionsRole = $state<RoleRecord | null>(null);
  let rolePermissionIds = $state<Set<string>>(new Set());
  let savingPermissions = $state(false);
  let loadingPermissions = $state(false);

  // Users sheet
  let showUsersSheet = $state(false);
  let usersRole = $state<RoleRecord | null>(null);
  let roleUsers = $state<RoleUser[]>([]);
  let loadingUsers = $state(false);
  let addingUserId = $state<number | null>(null);
  let removingUserId = $state<number | null>(null);

  // Visibility sheet
  type RolePage = { roles_id: string; pages_id: number; inherit_monitors: number };
  type RoleMonitor = { roles_id: string; monitor_tag: string };
  type PageWithMonitors = { id: number; page_title: string; page_path: string; monitors: Array<{ monitor_tag: string; name: string }> };

  let visibilityRoleId = $state<string | null>(null);
  let visRolePages = $state<RolePage[]>([]);
  let visRoleMonitors = $state<RoleMonitor[]>([]);
  let allPagesForVis = $state<PageWithMonitors[]>([]);
  let visLoading = $state(false);
  let visSaving = $state(false);

  const apiUrl = clientResolver(resolve, "/manage/api");

  async function apiCall(action: string, data: Record<string, unknown> = {}) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data })
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  async function fetchRoles() {
    loading = true;
    try {
      const result = await apiCall("getRoles");
      roles = result;
    } catch {
      toast.error("Failed to load roles");
    } finally {
      loading = false;
    }
  }

  async function fetchAllPermissions() {
    try {
      allPermissions = await apiCall("getAllPermissions");
    } catch {
      toast.error("Failed to load permissions");
    }
  }

  async function fetchAllUsers() {
    try {
      const result = await apiCall("getUsers", { page: 1, limit: 1000 });
      allUsers = result.users || [];
    } catch {
      toast.error("Failed to load users");
    }
  }

  function openCreateDialog(prefill?: { role_id: string; name: string; cloneFromRoleId: string }) {
    if (prefill) {
      newRole = { role_id: prefill.role_id, name: prefill.name };
      createPermissionMode = "clone";
      cloneFromRoleId = prefill.cloneFromRoleId;
    } else {
      newRole = { role_id: "", name: "" };
      createPermissionMode = "pick";
      cloneFromRoleId = "";
    }
    createError = "";
    showCreateDialog = true;
  }

  // Create role
  async function handleCreateRole() {
    createError = "";
    if (!newRole.role_id.trim()) {
      createError = "Role ID is required";
      return;
    }
    if (!newRole.name.trim()) {
      createError = "Role name is required";
      return;
    }
    if (createPermissionMode === "clone" && !cloneFromRoleId) {
      createError = "Please select a role to clone permissions from";
      return;
    }
    creatingRole = true;
    try {
      const created = await apiCall("createRole", { role_id: newRole.role_id, name: newRole.name });

      // Clone permissions if selected
      if (createPermissionMode === "clone" && cloneFromRoleId) {
        const sourcePerms = await apiCall("getRolePermissions", { roleId: cloneFromRoleId });
        const permIds = sourcePerms.map((p: { permissions_id: string }) => p.permissions_id);
        if (permIds.length > 0) {
          await apiCall("updateRolePermissions", {
            roleId: newRole.role_id.trim().toLowerCase().replace(/\s+/g, "_"),
            permissionIds: permIds
          });
        }
      }

      toast.success("Role created");
      showCreateDialog = false;
      const createdRoleId = newRole.role_id.trim().toLowerCase().replace(/\s+/g, "_");
      newRole = { role_id: "", name: "" };
      cloneFromRoleId = "";
      createPermissionMode = "pick";
      await fetchRoles();

      // Open permissions sheet for the newly created role
      const createdRole = roles.find((r) => r.id === createdRoleId);
      if (createdRole) {
        openPermissions(createdRole);
      }
    } catch (e: unknown) {
      createError = e instanceof Error ? e.message : "Failed to create role";
    } finally {
      creatingRole = false;
    }
  }

  // Delete role
  async function handleDeleteRole() {
    if (!roleToDelete) return;
    deletingRole = true;
    try {
      const options =
        deleteAction === "migrate"
          ? { action: "migrate" as const, targetRoleId: deleteTargetRoleId }
          : { action: "remove" as const };
      await apiCall("deleteRole", { roleId: roleToDelete.id, options });
      toast.success("Role deleted");
      showDeleteDialog = false;
      roleToDelete = null;
      await fetchRoles();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    } finally {
      deletingRole = false;
    }
  }

  // Edit role
  function openEditDialog(role: RoleRecord) {
    roleToEdit = role;
    editRole = { name: role.role_name, status: role.status };
    editError = "";
    showEditDialog = true;
  }

  async function handleEditRole() {
    if (!roleToEdit) return;
    editError = "";
    if (!editRole.name.trim()) {
      editError = "Role name is required";
      return;
    }
    editingRole = true;
    try {
      await apiCall("updateRole", {
        roleId: roleToEdit.id,
        name: editRole.name,
        status: editRole.status
      });
      toast.success("Role updated");
      showEditDialog = false;
      roleToEdit = null;
      await fetchRoles();
    } catch (e: unknown) {
      editError = e instanceof Error ? e.message : "Failed to update role";
    } finally {
      editingRole = false;
    }
  }

  // Open permissions sheet
  async function openPermissions(role: RoleRecord) {
    permissionsRole = role;
    rolePermissionIds = new Set();
    showPermissionsSheet = true;
    loadingPermissions = true;
    try {
      const perms = await apiCall("getRolePermissions", { roleId: role.id });
      rolePermissionIds = new Set(perms.map((p: { permissions_id: string }) => p.permissions_id));
    } catch {
      toast.error("Failed to load permissions");
    } finally {
      loadingPermissions = false;
    }
  }

  // Save permissions
  async function savePermissions() {
    if (!permissionsRole) return;
    savingPermissions = true;
    try {
      await apiCall("updateRolePermissions", {
        roleId: permissionsRole.id,
        permissionIds: Array.from(rolePermissionIds)
      });
      toast.success("Permissions updated");
      showPermissionsSheet = false;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update permissions");
    } finally {
      savingPermissions = false;
    }
  }

  function togglePermission(permId: string) {
    const next = new Set(rolePermissionIds);
    if (next.has(permId)) {
      next.delete(permId);
    } else {
      next.add(permId);
    }
    rolePermissionIds = next;
  }

  // Open users sheet
  async function openUsers(role: RoleRecord) {
    usersRole = role;
    roleUsers = [];
    showUsersSheet = true;
    loadingUsers = true;
    try {
      const canAssign = hasPermission("roles.assign_users");
      const [users] = await Promise.all([
        apiCall("getRoleUsers", { roleId: role.id }),
        canAssign ? fetchAllUsers() : Promise.resolve()
      ]);
      roleUsers = users;
    } catch {
      toast.error("Failed to load role users");
    } finally {
      loadingUsers = false;
    }
  }

  // Add user to role
  async function addUser(userId: number) {
    if (!usersRole) return;
    addingUserId = userId;
    try {
      await apiCall("addUserToRole", { roleId: usersRole.id, userId });
      toast.success("User added to role");
      roleUsers = await apiCall("getRoleUsers", { roleId: usersRole.id });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add user");
    } finally {
      addingUserId = null;
    }
  }

  // Remove user from role
  async function removeUser(userId: number) {
    if (!usersRole) return;
    removingUserId = userId;
    try {
      await apiCall("removeUserFromRole", { roleId: usersRole.id, userId });
      toast.success("User removed from role");
      roleUsers = await apiCall("getRoleUsers", { roleId: usersRole.id });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove user");
    } finally {
      removingUserId = null;
    }
  }

  async function openVisibility(roleId: string) {
    visibilityRoleId = roleId;
    visLoading = true;
    try {
      const [pages, monitors, allPages] = await Promise.all([
        apiCall("getRolePages", { roleId }),
        apiCall("getRoleMonitors", { roleId }),
        apiCall("getPages"),
      ]);
      visRolePages = pages;
      visRoleMonitors = monitors;
      allPagesForVis = allPages;
    } catch (e) {
      toast.error("Failed to load visibility settings");
      visibilityRoleId = null;
    } finally {
      visLoading = false;
    }
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
    try {
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
      visibilityRoleId = null;
    } finally {
      visSaving = false;
    }
  }

  let groupedPermissions = $derived.by(() => {
    const groups: Array<{ group: string; label: string; permissions: Permission[] }> = [];
    const groupMap = new Map<string, Permission[]>();
    for (const perm of allPermissions) {
      const dotIndex = perm.id.indexOf(".");
      const group = dotIndex > -1 ? perm.id.substring(0, dotIndex) : perm.id;
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(perm);
    }
    for (const [group, perms] of groupMap) {
      const label = group.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      groups.push({ group, label, permissions: perms });
    }
    return groups;
  });

  function groupGrantedCount(perms: Permission[]): number {
    return perms.filter((p) => rolePermissionIds.has(p.id)).length;
  }

  let availableUsersToAdd = $derived(allUsers.filter((u) => !roleUsers.some((ru) => ru.id === u.id)));

  onMount(async () => {
    await Promise.all([fetchRoles(), fetchAllPermissions()]);
  });
</script>

<div class="kener-manage flex flex-1 flex-col gap-4 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <ShieldIcon class="h-5 w-5" />
      <h2 class="text-xl font-semibold">{$t("manage.roles.title")}</h2>
    </div>
    {#if hasPermission("roles.write")}
      <Button onclick={() => openCreateDialog()}>
        <PlusIcon class="mr-1 h-4 w-4" />
        {$t("manage.roles.add_button")}
      </Button>
    {/if}
  </div>

  <!-- Roles Table -->
  <div class="">
    {#if loading}
      <div class="flex items-center justify-center p-8">
        <Spinner class="h-6 w-6" />
      </div>
    {:else if roles.length === 0}
      <div class="text-muted-foreground p-8 text-center text-sm">{$t("manage.roles.no_roles")}</div>
    {:else}
      <div class="ktable overflow-hidden rounded-xl border">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{$t("manage.roles.col_id")}</Table.Head>
              <Table.Head>{$t("manage.roles.col_name")}</Table.Head>
              <Table.Head>{$t("manage.roles.col_status")}</Table.Head>
              <Table.Head>{$t("manage.roles.col_type")}</Table.Head>
              <Table.Head class="text-right"></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each roles as role (role.id)}
              <Table.Row>
                <Table.Cell class="font-mono text-sm">{role.id}</Table.Cell>
                <Table.Cell>{role.role_name}</Table.Cell>
                <Table.Cell>
                  <Badge variant={role.status === "ACTIVE" ? "default" : "secondary"}>
                    {role.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {#if role.readonly === 1}
                    <Badge variant="outline">
                      <LockIcon class="mr-1 h-3 w-3" />
                      {$t("manage.roles.readonly_badge")}
                    </Badge>
                  {:else}
                    <Badge variant="outline">{$t("manage.roles.custom_badge")}</Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onclick={() => openPermissions(role)}>
                      <KeyIcon class="mr-1 h-4 w-4" />
                      {$t("manage.roles.permissions_button")}
                    </Button>
                    <Button variant="ghost" size="sm" onclick={() => openUsers(role)}>
                      <UsersIcon class="mr-1 h-4 w-4" />
                      {$t("manage.roles.users_button")}
                    </Button>
                    <Button variant="outline" size="sm" onclick={() => openVisibility(role.id)}>
                      <EyeIcon class="mr-1 h-4 w-4" />
                      {$t("manage.roles.visibility_button")}
                    </Button>
                    {#if hasPermission("roles.write")}
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() =>
                          openCreateDialog({
                            role_id: role.id + "-copy",
                            name: role.role_name + " Copy",
                            cloneFromRoleId: role.id
                          })}
                      >
                        <CopyIcon class="mr-1 h-4 w-4" />
                        {$t("manage.roles.duplicate")}
                      </Button>
                    {/if}
                    {#if role.readonly !== 1 && hasPermission("roles.write")}
                      <Button variant="ghost" size="sm" onclick={() => openEditDialog(role)}>
                        <PencilIcon class="mr-1 h-4 w-4" />
                        {$t("manage.common.edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => {
                          roleToDelete = role;
                          deleteAction = "remove";
                          deleteTargetRoleId = "";
                          showDeleteDialog = true;
                        }}
                      >
                        <TrashIcon class="text-destructive mr-1 h-4 w-4" />
                        {$t("manage.common.delete")}
                      </Button>
                    {/if}
                  </div>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </div>
</div>

<!-- Edit Role Dialog -->
<Dialog.Root bind:open={showEditDialog}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{$t("manage.roles.edit_dialog_title")}</Dialog.Title>
      <Dialog.Description>
        Update <span class="font-semibold">{roleToEdit?.role_name}</span> role.
      </Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label for="edit-role-name">{$t("manage.roles.edit_name_label")}</Label>
        <Input id="edit-role-name" bind:value={editRole.name} />
      </div>
      <div class="grid gap-2">
        <Label for="edit-role-status">{$t("manage.roles.edit_status_label")}</Label>
        <select
          id="edit-role-status"
          class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
          bind:value={editRole.status}
        >
          <option value="ACTIVE">{$t("manage.roles.status_active")}</option>
          <option value="INACTIVE">{$t("manage.roles.status_inactive")}</option>
        </select>
      </div>
      {#if editError}
        <p class="text-destructive text-sm">{editError}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showEditDialog = false)}>{$t("manage.common.cancel")}</Button>
      <Button onclick={handleEditRole} disabled={editingRole}>
        {#if editingRole}
          <Spinner class="mr-2 h-4 w-4" />
        {/if}
        {$t("manage.common.save")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Create Role Dialog -->
<Dialog.Root bind:open={showCreateDialog}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{$t("manage.roles.create_dialog_title")}</Dialog.Title>
      <Dialog.Description>{$t("manage.roles.create_dialog_desc")}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label for="role-id">{$t("manage.roles.create_id_label")}</Label>
        <Input id="role-id" placeholder={$t("manage.roles.create_id_placeholder")} bind:value={newRole.role_id} />
        <p class="text-muted-foreground text-xs">{$t("manage.roles.create_id_hint")}</p>
      </div>
      <div class="grid gap-2">
        <Label for="role-name">{$t("manage.roles.create_name_label")}</Label>
        <Input id="role-name" placeholder={$t("manage.roles.create_name_placeholder")} bind:value={newRole.name} />
      </div>
      <div class="grid gap-2">
        <Label>{$t("manage.roles.create_permissions_label")}</Label>
        <div class="flex gap-2">
          <Button
            variant={createPermissionMode === "pick" ? "default" : "outline"}
            size="sm"
            onclick={() => {
              createPermissionMode = "pick";
              cloneFromRoleId = "";
            }}
          >
            {$t("manage.roles.create_pick_after")}
          </Button>
          <Button
            variant={createPermissionMode === "clone" ? "default" : "outline"}
            size="sm"
            onclick={() => (createPermissionMode = "clone")}
          >
            {$t("manage.roles.create_clone_from_button")}
          </Button>
        </div>
      </div>
      {#if createPermissionMode === "clone"}
        <div class="grid gap-2">
          <Label for="clone-role">{$t("manage.roles.create_clone_label")}</Label>
          <select
            id="clone-role"
            class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
            bind:value={cloneFromRoleId}
          >
            <option value="">{$t("manage.roles.select_role_placeholder")}</option>
            {#each roles.filter((r) => r.status === "ACTIVE") as r (r.id)}
              <option value={r.id}>{r.role_name}</option>
            {/each}
          </select>
        </div>
      {/if}
      {#if createError}
        <p class="text-destructive text-sm">{createError}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showCreateDialog = false)}>{$t("manage.common.cancel")}</Button>
      <Button onclick={handleCreateRole} disabled={creatingRole}>
        {#if creatingRole}
          <Spinner class="mr-2 h-4 w-4" />
        {/if}
        {$t("manage.common.create")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete Role Dialog -->
<Dialog.Root bind:open={showDeleteDialog}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{$t("manage.roles.delete_dialog_title")}</Dialog.Title>
      <Dialog.Description>
        {$t("manage.roles.delete_dialog_desc")} <span class="font-semibold">{roleToDelete?.role_name}</span>?
      </Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label>{$t("manage.roles.delete_users_label")}</Label>
        <div class="flex gap-2">
          <Button
            variant={deleteAction === "remove" ? "default" : "outline"}
            size="sm"
            onclick={() => (deleteAction = "remove")}
          >
            {$t("manage.roles.delete_remove_action")}
          </Button>
          <Button
            variant={deleteAction === "migrate" ? "default" : "outline"}
            size="sm"
            onclick={() => (deleteAction = "migrate")}
          >
            {$t("manage.roles.delete_migrate_action")}
          </Button>
        </div>
      </div>
      {#if deleteAction === "migrate"}
        <div class="grid gap-2">
          <Label for="target-role">{$t("manage.roles.delete_target_label")}</Label>
          <select
            id="target-role"
            class="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
            bind:value={deleteTargetRoleId}
          >
            <option value="">{$t("manage.roles.select_role_placeholder")}</option>
            {#each roles.filter((r) => r.id !== roleToDelete?.id && r.status === "ACTIVE") as r (r.id)}
              <option value={r.id}>{r.role_name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showDeleteDialog = false)}>{$t("manage.common.cancel")}</Button>
      <Button
        variant="destructive"
        onclick={handleDeleteRole}
        disabled={deletingRole || (deleteAction === "migrate" && !deleteTargetRoleId)}
      >
        {#if deletingRole}
          <Spinner class="mr-2 h-4 w-4" />
        {/if}
        {$t("manage.common.delete")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Permissions Sheet -->
<Sheet.Root bind:open={showPermissionsSheet}>
  <Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-xl">
    <Sheet.Header>
      <Sheet.Title>
        {$t("manage.roles.perm_sheet_title")} — {permissionsRole?.role_name}
      </Sheet.Title>
      <Sheet.Description>
        {#if permissionsRole?.readonly === 1}
          {$t("manage.roles.perm_sheet_readonly_desc")}
        {:else}
          {$t("manage.roles.perm_sheet_editable_desc")}
        {/if}
      </Sheet.Description>
    </Sheet.Header>
    <div class=" p-4">
      {#if loadingPermissions}
        <div class="flex items-center justify-center p-8">
          <Spinner class="h-6 w-6" />
        </div>
      {:else}
        <div class="rounded-xl border">
          <Accordion.Root type="multiple">
            {#each groupedPermissions as group (group.group)}
              {@const granted = groupGrantedCount(group.permissions)}
              <Accordion.Item value={group.group}>
                <Accordion.Trigger class="px-4">
                  <div>
                    <span class="capitalize">{group.label}</span>
                    <Badge
                      variant={granted === group.permissions.length ? "default" : granted > 0 ? "secondary" : "outline"}
                      class="ml-2"
                    >
                      {granted}/{group.permissions.length}
                    </Badge>
                  </div>
                </Accordion.Trigger>
                <Accordion.Content class="px-4">
                  <div class="flex flex-col gap-2 pt-0">
                    {#each group.permissions as perm (perm.id)}
                      <Button
                        variant={rolePermissionIds.has(perm.id) ? "outline" : "ghost"}
                        class="h-auto justify-start gap-3 p-3 text-left {rolePermissionIds.has(perm.id)
                          ? 'border-primary bg-primary/5'
                          : ''}"
                        disabled={permissionsRole?.readonly === 1 || !hasPermission("roles.assign_permissions")}
                        onclick={() => togglePermission(perm.id)}
                      >
                        <Checkbox.Root
                          checked={rolePermissionIds.has(perm.id)}
                          disabled={permissionsRole?.readonly === 1 || !hasPermission("roles.assign_permissions")}
                        />
                        <div class="flex flex-col">
                          <span class="text-sm font-medium">{perm.permission_name}</span>
                        </div>
                      </Button>
                    {/each}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            {/each}
          </Accordion.Root>
        </div>

        {#if permissionsRole?.readonly !== 1 && hasPermission("roles.assign_permissions")}
          <div class="flex justify-end gap-2 p-4">
            <Button variant="outline" onclick={() => (showPermissionsSheet = false)}>{$t("manage.common.cancel")}</Button>
            <Button onclick={savePermissions} disabled={savingPermissions}>
              {#if savingPermissions}
                <Spinner class="mr-2 h-4 w-4" />
              {/if}
              {$t("manage.roles.perm_save_button")}
            </Button>
          </div>
        {/if}
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>

<!-- Users Sheet -->
<Sheet.Root bind:open={showUsersSheet}>
  <Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-xl">
    <Sheet.Header>
      <Sheet.Title>
        {$t("manage.roles.users_sheet_title")} — {usersRole?.role_name}
      </Sheet.Title>
      <Sheet.Description>{$t("manage.roles.users_sheet_desc")}</Sheet.Description>
    </Sheet.Header>

    {#if loadingUsers}
      <div class="flex items-center justify-center p-8">
        <Spinner class="h-6 w-6" />
      </div>
    {:else}
      <!-- Current users in role -->
      <div class="p-4">
        <h4 class="mb-2 text-sm font-medium">{$t("manage.roles.current_users_header")} ({roleUsers.length})</h4>
        {#if roleUsers.length === 0}
          <p class="text-muted-foreground text-sm">{$t("manage.roles.no_users_in_role")}</p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each roleUsers as user (user.id)}
              <div class="flex items-center justify-between rounded-md border p-3">
                <div class="flex flex-col">
                  <span class="text-sm font-medium">{user.name}</span>
                  <span class="text-muted-foreground text-xs">{user.email}</span>
                </div>
                {#if hasPermission("roles.assign_users")}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removingUserId === user.id}
                    onclick={() => removeUser(user.id)}
                  >
                    {#if removingUserId === user.id}
                      <Spinner class="h-4 w-4" />
                    {:else}
                      <UserMinusIcon class="text-destructive h-4 w-4" />
                    {/if}
                  </Button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if hasPermission("roles.assign_users")}
        <Separator />

        <!-- Add users -->
        <div class="p-4">
          <h4 class="mb-2 text-sm font-medium">{$t("manage.roles.add_users_header")}</h4>
          {#if availableUsersToAdd.length === 0}
            <p class="text-muted-foreground text-sm">{$t("manage.roles.all_users_in_role")}</p>
          {:else}
            <div class="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {#each availableUsersToAdd as user (user.id)}
                <div class="flex items-center justify-between rounded-md border p-3">
                  <div class="flex flex-col">
                    <span class="text-sm font-medium">{user.name}</span>
                    <span class="text-muted-foreground text-xs">{user.email}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={addingUserId === user.id}
                    onclick={() => addUser(user.id)}
                  >
                    {#if addingUserId === user.id}
                      <Spinner class="h-4 w-4" />
                    {:else}
                      <UserPlusIcon class="h-4 w-4" />
                    {/if}
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </Sheet.Content>
</Sheet.Root>

<!-- Visibility Sheet -->
{#if visibilityRoleId !== null}
  <Sheet.Root open={true} onOpenChange={(v) => { if (!v) visibilityRoleId = null; }}>
    <Sheet.Content class="flex w-[520px] flex-col overflow-hidden sm:max-w-[520px]">
      <Sheet.Header class="px-6 pt-6">
        <Sheet.Title>{$t("manage.roles.vis_sheet_title")}</Sheet.Title>
        <Sheet.Description>
          {$t("manage.roles.vis_sheet_desc")}
        </Sheet.Description>
      </Sheet.Header>

      {#if visLoading}
        <div class="flex flex-1 items-center justify-center">
          <Spinner class="h-6 w-6" />
        </div>
      {:else}
        <div class="flex-1 space-y-6 overflow-y-auto px-6 py-4">

          <!-- Pages section -->
          <div class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold">{$t("manage.roles.vis_pages_header")}</h3>
              <p class="text-muted-foreground text-xs">{$t("manage.roles.vis_pages_desc")}</p>
            </div>
            {#if allPagesForVis.length === 0}
              <p class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">{$t("manage.roles.vis_no_pages")}</p>
            {:else}
              <div class="space-y-2">
                {#each allPagesForVis as p (p.id)}
                  <div class="rounded-lg border p-3 transition-colors {isPageAssigned(p.id) ? 'border-primary/40 bg-primary/5' : ''}">
                    <label class="flex cursor-pointer items-start gap-3">
                      <Checkbox.Root
                        checked={isPageAssigned(p.id)}
                        onCheckedChange={() => togglePage(p.id)}
                        class="mt-0.5"
                      />
                      <div class="min-w-0 flex-1">
                        <span class="text-sm font-medium">{p.page_title}</span>
                        <span class="text-muted-foreground ml-1.5 font-mono text-xs">/{p.page_path}</span>
                        {#if p.monitors.length > 0}
                          <p class="text-muted-foreground text-xs">{p.monitors.length} monitor{p.monitors.length !== 1 ? 's' : ''}</p>
                        {/if}
                      </div>
                    </label>
                    {#if isPageAssigned(p.id) && p.monitors.length > 0}
                      <label class="mt-2 flex cursor-pointer items-center gap-2 pl-7">
                        <input
                          type="checkbox"
                          checked={getPageInherit(p.id)}
                          onchange={() => toggleInherit(p.id)}
                          class="accent-primary h-3.5 w-3.5"
                        />
                        <span class="text-muted-foreground text-xs">Grant access to all {p.monitors.length} monitors on this page</span>
                      </label>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Monitors section -->
          {#if allPagesForVis.flatMap((p) => p.monitors).length > 0}
            {@const allMonitors = allPagesForVis.flatMap((p) => p.monitors)}
            <div class="space-y-3">
              <div>
                <h3 class="text-sm font-semibold">{$t("manage.roles.vis_monitors_header")}</h3>
                <p class="text-muted-foreground text-xs">{$t("manage.roles.vis_monitors_desc")}</p>
              </div>
              <div class="space-y-1.5">
                {#each allMonitors as m (m.monitor_tag)}
                  {@const coveredByPage = isMonitorCoveredByPage(m.monitor_tag)}
                  <div class="flex items-center gap-3 rounded-lg border px-3 py-2 {coveredByPage ? 'border-dashed opacity-60' : ''}">
                    {#if coveredByPage}
                      <div class="text-primary flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-xs">✓</div>
                    {:else}
                      <Checkbox.Root
                        checked={isMonitorDirectlyAssigned(m.monitor_tag)}
                        onCheckedChange={() => toggleMonitor(m.monitor_tag)}
                      />
                    {/if}
                    <span class="text-sm {coveredByPage ? 'text-muted-foreground' : ''}">{m.name ?? m.monitor_tag}</span>
                    {#if coveredByPage}
                      <span class="text-muted-foreground ml-auto text-xs">{$t("manage.roles.vis_via_page")}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

        </div>

        <!-- Footer -->
        <div class="border-t px-6 py-4">
          <div class="flex justify-end gap-2">
            <Button variant="outline" onclick={() => (visibilityRoleId = null)}>{$t("manage.common.cancel")}</Button>
            <Button onclick={saveVisibility} disabled={visSaving}>
              {#if visSaving}<Spinner class="mr-2 h-4 w-4" />{/if}
              {$t("manage.common.save")}
            </Button>
          </div>
        </div>
      {/if}
    </Sheet.Content>
  </Sheet.Root>
{/if}
