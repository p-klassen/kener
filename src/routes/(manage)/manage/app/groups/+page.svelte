<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
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
      Loading…
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
                    onclick={(e) => { e.stopPropagation(); goto(clientResolver(resolve, `/manage/app/groups/${group.id}`)); }}
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
        <Label>Description (optional)</Label>
        <Input bind:value={newDesc} placeholder={$t("manage.groups.desc_placeholder")} />
      </div>
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (showCreate = false)}>{$t("manage.common.cancel")}</Button>
      <Button onclick={createGroup} disabled={creating || !newName.trim()}>
        {creating ? "Creating…" : $t("manage.common.create")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Delete dialog -->
<Dialog.Root open={!!deleteTarget} onOpenChange={(v) => { if (!v) deleteTarget = null; }}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>{$t("manage.groups.delete_dialog_title")}</Dialog.Title></Dialog.Header>
    <p>Delete <strong>{deleteTarget?.name}</strong>? This removes all member and role assignments.</p>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteTarget = null)}>{$t("manage.common.cancel")}</Button>
      <Button variant="destructive" onclick={deleteGroup} disabled={deleting}>
        {deleting ? "Deleting…" : $t("manage.common.delete")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
