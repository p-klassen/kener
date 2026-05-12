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
  import UsersIcon from "@lucide/svelte/icons/users";
  import ShieldIcon from "@lucide/svelte/icons/shield";

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

  function openEditSheet(group: Group) {
    editingGroup = { ...group };
    editName = group.name;
    editDesc = group.description ?? "";
    saveError = "";
    showEditSheet = true;
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
      // Update local list
      groups = groups.map((g) =>
        g.id === editingGroup!.id
          ? { ...g, name: editName.trim(), description: editDesc.trim() || null }
          : g
      );
      showEditSheet = false;
      toast.success($t("manage.groups.save_success"));
    } catch (e: unknown) {
      saveError = e instanceof Error ? e.message : "Failed to save";
    } finally {
      saving = false;
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
            <Table.Row class="cursor-pointer" onclick={() => goto(clientResolver(resolve, `/manage/app/groups/${group.id}`))}>
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
                    onclick={(e) => { e.stopPropagation(); openEditSheet(group); }}
                  >
                    <PencilIcon class="mr-1 h-4 w-4" />
                    {$t("manage.common.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={(e) => { e.stopPropagation(); deleteTarget = group; }}
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
    <div class="space-y-3">
      <div>
        <Label>{$t("manage.groups.name_label")}</Label>
        <Input bind:value={newName} placeholder={$t("manage.groups.name_placeholder")} />
      </div>
      <div>
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
    <Dialog.Header><Dialog.Title>{$t("manage.groups.delete_dialog_title")}</Dialog.Title></Dialog.Header>
    <p>{$t("manage.groups.delete_confirm")} <strong>{deleteTarget?.name}</strong></p>
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
    <div class="px-4">
      {#if editingGroup}
        <div class="space-y-6 py-6">
          <!-- Stats -->
          <div class="flex gap-4 text-sm">
            <div class="flex items-center gap-1.5 text-muted-foreground">
              <UsersIcon class="h-4 w-4" />
              <span>{editingGroup.member_count} {$t("manage.groups.col_members")}</span>
            </div>
            <div class="flex items-center gap-1.5 text-muted-foreground">
              <ShieldIcon class="h-4 w-4" />
              <span>{editingGroup.role_count} {$t("manage.groups.col_roles")}</span>
            </div>
          </div>

          <!-- Name + Description -->
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

              <div class="flex gap-2 pt-1">
                <Button
                  onclick={saveGroup}
                  disabled={saving || !editName.trim()}
                >
                  {#if saving}<Spinner class="mr-1 h-4 w-4" />{/if}
                  {$t("manage.groups.save_button")}
                </Button>
                <Button
                  variant="outline"
                  onclick={() => goto(clientResolver(resolve, `/manage/app/groups/${editingGroup!.id}`))}
                >
                  {$t("manage.groups.open_detail_button")}
                </Button>
              </div>
            </Card.Content>
          </Card.Root>
        </div>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>
