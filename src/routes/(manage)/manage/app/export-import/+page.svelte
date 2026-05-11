<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import Loader from "@lucide/svelte/icons/loader";
  import { toast } from "svelte-sonner";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  import { page } from "$app/state";

  type Scope = "config" | "users_groups_roles" | "everything";

  let exporting: Scope | null = $state(null);
  let importing = $state(false);
  let importFileInput: HTMLInputElement | undefined = $state();
  let pendingImportScope: Scope | null = $state(null);
  let importResult: { imported: Record<string, number> } | null = $state(null);

  const canWrite = $derived((page.data.userPermissions ?? []).includes("settings.write"));

  async function doExport(scope: Scope) {
    exporting = scope;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exportData", data: { scope } }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || response.statusText);
      }
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      a.href = url;
      a.download = `kener-export-${scope}-${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success($t("manage.export_import.export_success"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      exporting = null;
    }
  }

  function triggerImport(scope: Scope) {
    pendingImportScope = scope;
    importFileInput?.click();
  }

  async function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !pendingImportScope) return;
    input.value = "";

    importing = true;
    importResult = null;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "importData", data: { payload } }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || response.statusText);
      }
      importResult = await response.json();
      toast.success($t("manage.export_import.import_success"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      importing = false;
      pendingImportScope = null;
    }
  }
</script>

<input bind:this={importFileInput} type="file" accept=".json" class="hidden" onchange={onFileSelected} />

<div class="flex w-full flex-col gap-6">
  <div>
    <h1 class="text-2xl font-semibold">{$t("manage.export_import.title")}</h1>
    <p class="text-muted-foreground mt-1 text-sm">{$t("manage.export_import.description")}</p>
  </div>

  <Tabs.Root value="config">
    <Tabs.List>
      <Tabs.Trigger value="config">{$t("manage.export_import.tab_config")}</Tabs.Trigger>
      <Tabs.Trigger value="users_groups_roles">{$t("manage.export_import.tab_users")}</Tabs.Trigger>
      <Tabs.Trigger value="everything">{$t("manage.export_import.tab_everything")}</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="config">
      <Card.Root class="mt-4">
        <Card.Header>
          <Card.Title>{$t("manage.export_import.tab_config")}</Card.Title>
          <Card.Description>{$t("manage.export_import.desc_config")}</Card.Description>
        </Card.Header>
        <Card.Content class="flex gap-3">
          <Button onclick={() => doExport("config")} disabled={exporting !== null}>
            {#if exporting === "config"}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
            {:else}
              <DownloadIcon class="mr-2 h-4 w-4" />
            {/if}
            {$t("manage.export_import.export_button")}
          </Button>
          {#if canWrite}
            <Button variant="outline" onclick={() => triggerImport("config")} disabled={importing}>
              {#if importing && pendingImportScope === "config"}
                <Loader class="mr-2 h-4 w-4 animate-spin" />
              {:else}
                <UploadIcon class="mr-2 h-4 w-4" />
              {/if}
              {$t("manage.export_import.import_button")}
            </Button>
          {/if}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <Tabs.Content value="users_groups_roles">
      <Card.Root class="mt-4">
        <Card.Header>
          <Card.Title>{$t("manage.export_import.tab_users")}</Card.Title>
          <Card.Description>{$t("manage.export_import.desc_users")}</Card.Description>
        </Card.Header>
        <Card.Content class="flex gap-3">
          <Button onclick={() => doExport("users_groups_roles")} disabled={exporting !== null}>
            {#if exporting === "users_groups_roles"}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
            {:else}
              <DownloadIcon class="mr-2 h-4 w-4" />
            {/if}
            {$t("manage.export_import.export_button")}
          </Button>
          {#if canWrite}
            <Button variant="outline" onclick={() => triggerImport("users_groups_roles")} disabled={importing}>
              {#if importing && pendingImportScope === "users_groups_roles"}
                <Loader class="mr-2 h-4 w-4 animate-spin" />
              {:else}
                <UploadIcon class="mr-2 h-4 w-4" />
              {/if}
              {$t("manage.export_import.import_button")}
            </Button>
          {/if}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <Tabs.Content value="everything">
      <Card.Root class="mt-4">
        <Card.Header>
          <Card.Title>{$t("manage.export_import.tab_everything")}</Card.Title>
          <Card.Description>{$t("manage.export_import.desc_everything")}</Card.Description>
        </Card.Header>
        <Card.Content class="flex gap-3">
          <Button onclick={() => doExport("everything")} disabled={exporting !== null}>
            {#if exporting === "everything"}
              <Loader class="mr-2 h-4 w-4 animate-spin" />
            {:else}
              <DownloadIcon class="mr-2 h-4 w-4" />
            {/if}
            {$t("manage.export_import.export_button")}
          </Button>
          {#if canWrite}
            <Button variant="outline" onclick={() => triggerImport("everything")} disabled={importing}>
              {#if importing && pendingImportScope === "everything"}
                <Loader class="mr-2 h-4 w-4 animate-spin" />
              {:else}
                <UploadIcon class="mr-2 h-4 w-4" />
              {/if}
              {$t("manage.export_import.import_button")}
            </Button>
          {/if}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>

  {#if importResult}
    <Card.Root>
      <Card.Header>
        <Card.Title>{$t("manage.export_import.import_result_title")}</Card.Title>
      </Card.Header>
      <Card.Content>
        <ul class="text-sm">
          {#each Object.entries(importResult.imported) as [key, count]}
            <li><span class="font-medium capitalize">{key.replace(/_/g, " ")}:</span> {count}</li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
