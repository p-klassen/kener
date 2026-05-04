<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { toast } from "svelte-sonner";

  type Group = {
    id: number;
    name: string;
    description: string | null;
    member_count: number;
    role_count: number;
  };

  const apiUrl = clientResolver(resolve, "/manage/api");

  let groups = $state<Group[]>([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let newName = $state("");
  let newDesc = $state("");
  let creating = $state(false);
  let deleteTarget = $state<Group | null>(null);
  let deleting = $state(false);

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
      toast.error("Failed to load groups");
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
      toast.error("Failed to create group");
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
      toast.error("Failed to delete group");
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
          {#each groups as group (group.id)}
            <tr
              class="hover:bg-muted/30 cursor-pointer border-t"
              onclick={() => goto(clientResolver(resolve, `/manage/app/groups/${group.id}`))}
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
<Dialog.Root bind:open={showCreate}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>New Group</Dialog.Title></Dialog.Header>
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
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showCreate = false)}>Cancel</Button>
      <Button onclick={createGroup} disabled={creating || !newName.trim()}>
        {creating ? "Creating…" : "Create"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete dialog -->
<Dialog.Root open={!!deleteTarget} onOpenChange={(v) => { if (!v) deleteTarget = null; }}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Delete Group</Dialog.Title></Dialog.Header>
    <p>Delete <strong>{deleteTarget?.name}</strong>? This removes all member and role assignments.</p>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteTarget = null)}>Cancel</Button>
      <Button variant="destructive" onclick={deleteGroup} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
