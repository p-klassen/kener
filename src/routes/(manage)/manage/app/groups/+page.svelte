<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { toast } from "svelte-sonner";
  import { t } from "$lib/stores/i18n";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import SaveIcon from "@lucide/svelte/icons/save";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ShieldIcon from "@lucide/svelte/icons/shield";

  type Group = {
    id: number;
    name: string;
    description: string | null;
    member_count: number;
    role_count: number;
  };

  type Member = { id: number; name: string; email: string };
  type Role = { id: string; role_name: string; readonly: number };
  type User = { id: number; name: string; email: string };

  const apiUrl = clientResolver(resolve, "/manage/api");

  let groups = $state<Group[]>([]);
  let loading = $state(true);

  // Create dialog state
  let showCreate = $state(false);
  let newName = $state("");
  let newDesc = $state("");
  let creating = $state(false);

  // Delete dialog state
  let deleteTarget = $state<Group | null>(null);
  let deleting = $state(false);

  // Edit sheet state
  let showEditSheet = $state(false);
  let editingGroup = $state<Group | null>(null);
  let editName = $state("");
  let editDesc = $state("");
  let saving = $state(false);
  let saveError = $state("");

  // Members & roles state (loaded when sheet opens)
  let sheetLoading = $state(false);
  let members = $state<Member[]>([]);
  let groupRoles = $state<Role[]>([]);
  let allUsers = $state<User[]>([]);
  let allRoles = $state<Role[]>([]);
  let memberSearch = $state("");
  let roleSearch = $state("");

  const memberIds = $derived(new Set(members.map((m) => m.id)));
  const groupRoleIds = $derived(new Set(groupRoles.map((r) => r.id)));

  const availableUsers = $derived(
    allUsers.filter(
      (u) =>
        !memberIds.has(u.id) &&
        (memberSearch === "" ||
          u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(memberSearch.toLowerCase())),
    ),
  );

  const availableRoles = $derived(
    allRoles.filter(
      (r) =>
        !groupRoleIds.has(r.id) &&
        (roleSearch === "" || r.role_name.toLowerCase().includes(roleSearch.toLowerCase())),
    ),
  );

  async function apiCall(action: string, data: Record<string, unknown> = {}) {
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
    try {
      groups = await apiCall("getGroups");
    } catch (e) {
      toast.error($t("manage.groups.error_load"));
    } finally {
      loading = false;
    }
  }

  async function createGroup() {
    if (!newName.trim()) return;
    creating = true;
    try {
      const g = await apiCall("createGroup", { name: newName.trim(), description: newDesc.trim() || null });
      showCreate = false;
      newName = "";
      newDesc = "";
      goto(clientResolver(resolve, `/manage/app/groups/${g.id}`));
    } catch (e) {
      toast.error($t("manage.groups.error_create"));
    } finally {
      creating = false;
    }
  }

  async function deleteGroup() {
    if (!deleteTarget) return;
    deleting = true;
    try {
      await apiCall("deleteGroup", { id: deleteTarget.id });
      deleteTarget = null;
      await loadGroups();
    } catch (e) {
      toast.error($t("manage.groups.error_delete"));
    } finally {
      deleting = false;
    }
  }

  async function openEditSheet(group: Group) {
    editingGroup = { ...group };
    editName = group.name;
    editDesc = group.description ?? "";
    saveError = "";
    memberSearch = "";
    roleSearch = "";
    members = [];
    groupRoles = [];
    allUsers = [];
    allRoles = [];
    showEditSheet = true;
    sheetLoading = true;
    try {
      const usersResult = await apiCall("getUsers", { page: 1, limit: 1000 });
      [members, groupRoles, allRoles] = await Promise.all([
        apiCall("getGroupMembers", { groupId: group.id }),
        apiCall("getGroupRoles", { groupId: group.id }),
        apiCall("getRoles"),
      ]);
      allUsers = usersResult.users ?? usersResult;
    } catch (e) {
      toast.error($t("manage.group_detail.load_error"));
    } finally {
      sheetLoading = false;
    }
  }

  async function saveGroup() {
    if (!editingGroup || !editName.trim()) return;
    saving = true;
    saveError = "";
    try {
      await apiCall("updateGroup", {
        id: editingGroup.id,
        name: editName.trim(),
        description: editDesc.trim() || null,
      });
      groups = groups.map((g) =>
        g.id === editingGroup!.id
          ? { ...g, name: editName.trim(), description: editDesc.trim() || null }
          : g,
      );
      toast.success($t("manage.groups.save_success"));
    } catch (e: unknown) {
      saveError = e instanceof Error ? e.message : $t("manage.groups.error_save");
    } finally {
      saving = false;
    }
  }

  async function addMember(userId: number) {
    if (!editingGroup) return;
    try {
      await apiCall("addGroupMember", { groupId: editingGroup.id, userId });
      members = await apiCall("getGroupMembers", { groupId: editingGroup.id });
      groups = groups.map((g) => (g.id === editingGroup!.id ? { ...g, member_count: members.length } : g));
    } catch (e) {
      toast.error($t("manage.group_detail.add_member_error"));
    }
  }

  async function removeMember(userId: number) {
    if (!editingGroup) return;
    try {
      await apiCall("removeGroupMember", { groupId: editingGroup.id, userId });
      members = members.filter((m) => m.id !== userId);
      groups = groups.map((g) => (g.id === editingGroup!.id ? { ...g, member_count: members.length } : g));
    } catch (e) {
      toast.error($t("manage.group_detail.remove_member_error"));
    }
  }

  async function addRole(roleId: string) {
    if (!editingGroup) return;
    try {
      await apiCall("addGroupRole", { groupId: editingGroup.id, roleId });
      groupRoles = await apiCall("getGroupRoles", { groupId: editingGroup.id });
      groups = groups.map((g) => (g.id === editingGroup!.id ? { ...g, role_count: groupRoles.length } : g));
    } catch (e) {
      toast.error($t("manage.group_detail.add_role_error"));
    }
  }

  async function removeRole(roleId: string) {
    if (!editingGroup) return;
    try {
      await apiCall("removeGroupRole", { groupId: editingGroup.id, roleId });
      groupRoles = groupRoles.filter((r) => r.id !== roleId);
      groups = groups.map((g) => (g.id === editingGroup!.id ? { ...g, role_count: groupRoles.length } : g));
    } catch (e) {
      toast.error($t("manage.group_detail.remove_role_error"));
    }
  }

  onMount(loadGroups);
</script>

<div class="flex w-full flex-col gap-4 p-4">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-2xl font-bold">{$t("manage.groups.title")}</h1>
    <Button onclick={() => (showCreate = true)}>
      <PlusIcon class="mr-1 h-4 w-4" />
      {$t("manage.groups.add_button")}
    </Button>
  </div>

  {#if loading}
    <div class="text-muted-foreground flex items-center gap-2 py-8">
      <Spinner class="h-4 w-4" />
      {$t("manage.groups.loading")}
    </div>
  {:else if groups.length === 0}
    <p class="text-muted-foreground py-8 text-center">{$t("manage.groups.no_groups")}</p>
  {:else}
    <div class="ktable overflow-hidden rounded-xl border">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{$t("manage.groups.col_name")}</Table.Head>
            <Table.Head>{$t("manage.groups.col_description")}</Table.Head>
            <Table.Head class="text-right">{$t("manage.groups.col_members")}</Table.Head>
            <Table.Head class="text-right">{$t("manage.groups.col_roles")}</Table.Head>
            <Table.Head class="text-right"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each groups as group (group.id)}
            <Table.Row>
              <Table.Cell class="font-medium">{group.name}</Table.Cell>
              <Table.Cell class="text-muted-foreground">{group.description ?? "—"}</Table.Cell>
              <Table.Cell class="text-right">
                <Badge variant="secondary">{group.member_count}</Badge>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Badge variant="outline">{group.role_count}</Badge>
              </Table.Cell>
              <Table.Cell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => openEditSheet(group)}
                  >
                    <PencilIcon class="mr-1 h-4 w-4" />
                    {$t("manage.common.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => { deleteTarget = group; }}
                  >
                    <TrashIcon class="mr-1 h-4 w-4 text-destructive" />
                    {$t("manage.common.delete")}
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
</div>

<!-- Create dialog -->
<Dialog.Root bind:open={showCreate}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>{$t("manage.groups.create_dialog_title")}</Dialog.Title></Dialog.Header>
    <div class="space-y-4">
      <div class="space-y-1.5">
        <Label>{$t("manage.groups.name_label")}</Label>
        <Input bind:value={newName} placeholder={$t("manage.groups.name_placeholder")} />
      </div>
      <div class="space-y-1.5">
        <Label>{$t("manage.groups.desc_label")}</Label>
        <Input bind:value={newDesc} placeholder={$t("manage.groups.desc_placeholder")} />
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showCreate = false)}>{$t("manage.common.cancel")}</Button>
      <Button onclick={createGroup} disabled={creating || !newName.trim()}>
        {creating ? "…" : $t("manage.common.create")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete dialog -->
<Dialog.Root open={!!deleteTarget} onOpenChange={(v) => { if (!v) deleteTarget = null; }}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{$t("manage.groups.delete_dialog_title")}</Dialog.Title>
      <Dialog.Description>{$t("manage.groups.delete_confirm")} <strong>{deleteTarget?.name}</strong></Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteTarget = null)}>{$t("manage.common.cancel")}</Button>
      <Button variant="destructive" onclick={deleteGroup} disabled={deleting}>
        {#if deleting}<Spinner class="mr-1 h-4 w-4" />{/if}
        {$t("manage.common.delete")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Edit Sheet -->
<Sheet.Root bind:open={showEditSheet}>
  <Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-xl">
    <Sheet.Header>
      <Sheet.Title>{$t("manage.groups.edit_sheet_title")}</Sheet.Title>
      <Sheet.Description>{$t("manage.groups.edit_sheet_desc")}</Sheet.Description>
    </Sheet.Header>

    {#if editingGroup}
      <div class="space-y-4 px-4 pb-6">
        {#if sheetLoading}
          <div class="text-muted-foreground flex items-center gap-2 py-4">
            <Spinner class="h-4 w-4" />
            {$t("manage.groups.loading")}
          </div>
        {/if}

        <!-- Name & Description -->
        <Card.Root>
          <Card.Content class="space-y-4 p-4">
            <div class="space-y-1.5">
              <Label for="edit-name">{$t("manage.groups.name_label")}</Label>
              <Input
                id="edit-name"
                bind:value={editName}
                placeholder={$t("manage.groups.name_placeholder")}
                disabled={saving}
              />
            </div>
            <div class="space-y-1.5">
              <Label for="edit-desc">{$t("manage.groups.desc_label")}</Label>
              <Input
                id="edit-desc"
                bind:value={editDesc}
                placeholder={$t("manage.groups.desc_placeholder")}
                disabled={saving}
              />
            </div>
            {#if saveError}
              <p class="text-destructive text-sm">{saveError}</p>
            {/if}
          </Card.Content>
          <Card.Footer class="flex justify-end border-t pt-6">
            <Button onclick={saveGroup} disabled={saving || !editName.trim()}>
              {#if saving}
                <Spinner class="h-4 w-4 animate-spin" />
              {:else}
                <SaveIcon class="h-4 w-4" />
              {/if}
              {$t("manage.common.save")}
            </Button>
          </Card.Footer>
        </Card.Root>

        <!-- Members -->
        <Card.Root>
          <Card.Header class="pb-2">
            <div class="flex items-center gap-2">
              <UsersIcon class="h-4 w-4" />
              <span class="font-medium">{$t("manage.group_detail.tab_members")} ({members.length})</span>
            </div>
          </Card.Header>
          <Card.Content class="space-y-3 p-4 pt-0">
            {#if members.length === 0 && !sheetLoading}
              <p class="text-muted-foreground text-sm">{$t("manage.group_detail.no_members")}</p>
            {:else}
              <div class="space-y-1">
                {#each members as m (m.id)}
                  <div class="flex items-center justify-between rounded border px-3 py-2">
                    <div>
                      <span class="text-sm font-medium">{m.name}</span>
                      <span class="text-muted-foreground ml-2 text-xs">{m.email}</span>
                    </div>
                    <Button variant="ghost" size="sm" onclick={() => removeMember(m.id)}>
                      {$t("manage.group_detail.remove_button")}
                    </Button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="border-t pt-3">
              <p class="mb-2 text-sm font-medium">{$t("manage.group_detail.add_members")}</p>
              <Input
                bind:value={memberSearch}
                placeholder={$t("manage.group_detail.search_users")}
                class="mb-2"
              />
              <div class="max-h-40 space-y-1 overflow-y-auto">
                {#each availableUsers as u (u.id)}
                  <div class="flex items-center justify-between rounded border px-3 py-2">
                    <div>
                      <span class="text-sm font-medium">{u.name}</span>
                      <span class="text-muted-foreground ml-2 text-xs">{u.email}</span>
                    </div>
                    <Button variant="outline" size="sm" onclick={() => addMember(u.id)}>
                      {$t("manage.groups.add_button_short")}
                    </Button>
                  </div>
                {/each}
                {#if availableUsers.length === 0 && !sheetLoading}
                  <p class="text-muted-foreground text-sm">{$t("manage.group_detail.no_more_users")}</p>
                {/if}
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Roles -->
        <Card.Root>
          <Card.Header class="pb-2">
            <div class="flex items-center gap-2">
              <ShieldIcon class="h-4 w-4" />
              <span class="font-medium">{$t("manage.group_detail.tab_roles")} ({groupRoles.length})</span>
            </div>
          </Card.Header>
          <Card.Content class="space-y-3 p-4 pt-0">
            {#if groupRoles.length === 0 && !sheetLoading}
              <p class="text-muted-foreground text-sm">{$t("manage.group_detail.no_roles")}</p>
            {:else}
              <div class="space-y-1">
                {#each groupRoles as r (r.id)}
                  <div class="flex items-center justify-between rounded border px-3 py-2">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium">{r.role_name}</span>
                      {#if r.readonly}
                        <Badge variant="secondary">{$t("manage.group_detail.system_badge")}</Badge>
                      {/if}
                    </div>
                    <Button variant="ghost" size="sm" onclick={() => removeRole(r.id)}>
                      {$t("manage.group_detail.remove_button")}
                    </Button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="border-t pt-3">
              <p class="mb-2 text-sm font-medium">{$t("manage.group_detail.add_roles")}</p>
              <Input
                bind:value={roleSearch}
                placeholder={$t("manage.group_detail.search_roles")}
                class="mb-2"
              />
              <div class="max-h-40 space-y-1 overflow-y-auto">
                {#each availableRoles as r (r.id)}
                  <div class="flex items-center justify-between rounded border px-3 py-2">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium">{r.role_name}</span>
                      {#if r.readonly}
                        <Badge variant="secondary">{$t("manage.group_detail.system_badge")}</Badge>
                      {/if}
                    </div>
                    <Button variant="outline" size="sm" onclick={() => addRole(r.id)}>
                      {$t("manage.groups.add_button_short")}
                    </Button>
                  </div>
                {/each}
                {#if availableRoles.length === 0 && !sheetLoading}
                  <p class="text-muted-foreground text-sm">{$t("manage.group_detail.no_more_roles")}</p>
                {/if}
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  </Sheet.Content>
</Sheet.Root>
