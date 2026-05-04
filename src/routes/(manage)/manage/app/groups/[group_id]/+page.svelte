<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { toast } from "svelte-sonner";

  const apiUrl = clientResolver(resolve, "/manage/api");
  const groupId = $derived(Number(page.params.group_id));

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

  async function loadAll() {
    loading = true;
    try {
      const usersResult = await apiCall("getUsers", { page: 1, limit: 1000 });
      [group, members, groupRoles, allRoles] = await Promise.all([
        apiCall("getGroup", { id: groupId }),
        apiCall("getGroupMembers", { groupId }),
        apiCall("getGroupRoles", { groupId }),
        apiCall("getRoles"),
      ]);
      allUsers = usersResult.users ?? usersResult;
      draftName = group?.name ?? "";
      draftDesc = group?.description ?? "";
    } catch (e) {
      toast.error("Failed to load group");
    } finally {
      loading = false;
    }
  }

  async function saveGroupName() {
    try {
      await apiCall("updateGroup", { id: groupId, name: draftName, description: draftDesc });
      group = { ...group!, name: draftName, description: draftDesc };
      editingName = false;
    } catch (e) {
      toast.error("Failed to save group");
    }
  }

  async function addMember(userId: number) {
    try {
      await apiCall("addGroupMember", { groupId, userId });
      members = await apiCall("getGroupMembers", { groupId });
    } catch (e) {
      toast.error("Failed to add member");
    }
  }

  async function removeMember(userId: number) {
    try {
      await apiCall("removeGroupMember", { groupId, userId });
      members = members.filter((m) => m.id !== userId);
    } catch (e) {
      toast.error("Failed to remove member");
    }
  }

  async function addRole(roleId: string) {
    try {
      await apiCall("addGroupRole", { groupId, roleId });
      groupRoles = await apiCall("getGroupRoles", { groupId });
    } catch (e) {
      toast.error("Failed to add role");
    }
  }

  async function removeRole(roleId: string) {
    try {
      await apiCall("removeGroupRole", { groupId, roleId });
      groupRoles = groupRoles.filter((r) => r.id !== roleId);
    } catch (e) {
      toast.error("Failed to remove role");
    }
  }

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

  onMount(loadAll);
</script>

{#if loading}
  <p class="p-6 text-muted-foreground">Loading…</p>
{:else if !group}
  <p class="p-6">Group not found.</p>
{:else}
  <div class="space-y-4 p-6">
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

    <Tabs.Root value="members">
      <Tabs.List>
        <Tabs.Trigger value="members">Members ({members.length})</Tabs.Trigger>
        <Tabs.Trigger value="roles">Roles ({groupRoles.length})</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="members" class="space-y-4 pt-4">
        <div>
          <h3 class="mb-2 text-sm font-medium">Current Members</h3>
          {#if members.length === 0}
            <p class="text-muted-foreground text-sm">No members yet.</p>
          {:else}
            <div class="space-y-1">
              {#each members as m (m.id)}
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
            {#each availableUsers as u (u.id)}
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
      </Tabs.Content>

      <Tabs.Content value="roles" class="space-y-4 pt-4">
        <div>
          <h3 class="mb-2 text-sm font-medium">Assigned Roles</h3>
          {#if groupRoles.length === 0}
            <p class="text-muted-foreground text-sm">No roles assigned.</p>
          {:else}
            <div class="space-y-1">
              {#each groupRoles as r (r.id)}
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
            {#each availableRoles as r (r.id)}
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
      </Tabs.Content>
    </Tabs.Root>
  </div>
{/if}
