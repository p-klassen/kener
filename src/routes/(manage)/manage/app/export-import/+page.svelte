<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import Loader from "@lucide/svelte/icons/loader";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";
  import { toast } from "svelte-sonner";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  import { page } from "$app/state";
  import type { ExportPayload } from "$lib/server/controllers/exportImportController.js";

  type Scope = "config" | "users_groups_roles" | "everything";

  // M-46: Backend returns created/updated/skipped separately only for images (images_skipped).
  // For all other entity types only a total count is available.
  type ImportResult = {
    imported: Record<string, number>;
  };

  let exporting: Scope | null = $state(null);
  let importing = $state(false);
  let importFileInput: HTMLInputElement | undefined = $state();
  let pendingImportScope: Scope | null = $state(null);
  let importResult: ImportResult | null = $state(null);

  // M-44: scope mismatch warning state
  let scopeMismatchWarning: string | null = $state(null);

  // M-45: confirmation dialog state
  let confirmDialogOpen = $state(false);
  let pendingPayload: ExportPayload | null = $state(null);
  let pendingFileScope: string | null = $state(null);
  let pendingExportedAt: string | null = $state(null);

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
    scopeMismatchWarning = null;
    importFileInput?.click();
  }

  // M-44 + M-45: Parse file, check scope mismatch, show confirmation dialog
  async function onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !pendingImportScope) return;
    input.value = "";

    let payload: ExportPayload;
    try {
      const text = await file.text();
      payload = JSON.parse(text) as ExportPayload;
    } catch {
      toast.error("Failed to parse the selected file as JSON.");
      pendingImportScope = null;
      return;
    }

    // M-44: compare file scope with tab scope
    const fileScope = payload.scope ?? null;
    if (fileScope && fileScope !== pendingImportScope) {
      scopeMismatchWarning = $t("manage.export_import.scope_mismatch_warning")
        .replace("{fileScope}", fileScope)
        .replace("{tabScope}", pendingImportScope);
    } else {
      scopeMismatchWarning = null;
    }

    // M-45: collect info for the confirmation dialog and open it
    pendingPayload = payload;
    pendingFileScope = fileScope;
    pendingExportedAt = payload.exported_at ?? null;
    confirmDialogOpen = true;
  }

  // Called when user confirms in the dialog
  async function doImport() {
    if (!pendingPayload || !pendingImportScope) return;
    confirmDialogOpen = false;

    importing = true;
    importResult = null;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "importData", data: { payload: pendingPayload } }),
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
      pendingPayload = null;
      pendingFileScope = null;
      pendingExportedAt = null;
    }
  }

  function cancelImport() {
    confirmDialogOpen = false;
    pendingImportScope = null;
    pendingPayload = null;
    pendingFileScope = null;
    pendingExportedAt = null;
    scopeMismatchWarning = null;
  }

  // M-46: Format a single result entry.
  // The backend tracks images_skipped separately; all other keys are plain totals.
  function formatResultEntry(key: string, count: number, imported: Record<string, number>): string | null {
    // images_skipped is a companion to images — skip rendering it standalone
    if (key === "images_skipped") return null;

    if (key === "images") {
      const skipped = imported["images_skipped"] ?? 0;
      if (skipped > 0) {
        return `${count} ${$t("manage.export_import.result_created")}, ${skipped} ${$t("manage.export_import.result_skipped")}`;
      }
      return `${count} ${$t("manage.export_import.result_created")}`;
    }

    // All other entity types: backend only returns a total
    return `${count} ${$t("manage.export_import.result_total")}`;
  }
</script>

<input bind:this={importFileInput} type="file" accept=".json" class="hidden" onchange={onFileSelected} />

<!-- M-45: Confirmation dialog -->
<AlertDialog.Root bind:open={confirmDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{$t("manage.export_import.confirm_title")}</AlertDialog.Title>
      <AlertDialog.Description>{$t("manage.export_import.confirm_description")}</AlertDialog.Description>
    </AlertDialog.Header>

    <div class="my-4 space-y-2 text-sm">
      {#if pendingFileScope}
        <div class="flex gap-2">
          <span class="text-muted-foreground w-28 shrink-0">{$t("manage.export_import.confirm_scope_label")}</span>
          <span class="font-medium capitalize">{pendingFileScope.replace(/_/g, " ")}</span>
        </div>
      {/if}
      {#if pendingExportedAt}
        <div class="flex gap-2">
          <span class="text-muted-foreground w-28 shrink-0">{$t("manage.export_import.confirm_exported_at_label")}</span>
          <span class="font-medium">{new Date(pendingExportedAt).toLocaleString()}</span>
        </div>
      {/if}

      <!-- M-44: also surface the scope mismatch inside the dialog if present -->
      {#if scopeMismatchWarning}
        <div class="bg-warning/10 text-warning-foreground border-warning/30 flex items-start gap-2 rounded-md border p-3">
          <AlertTriangleIcon class="mt-0.5 h-4 w-4 shrink-0" />
          <span>{scopeMismatchWarning}</span>
        </div>
      {/if}

      <div class="bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-2 rounded-md border p-3">
        <AlertTriangleIcon class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{$t("manage.export_import.confirm_overwrite_warning")}</span>
      </div>
    </div>

    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancelImport}>{$t("manage.export_import.cancel_button")}</AlertDialog.Cancel>
      <AlertDialog.Action onclick={doImport}>{$t("manage.export_import.confirm_button")}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<div class="flex w-full flex-col gap-4 p-4">
  <div>
    <h1 class="text-2xl font-semibold">{$t("manage.export_import.title")}</h1>
    <p class="text-muted-foreground mt-1 text-sm">{$t("manage.export_import.description")}</p>
  </div>

  <!-- M-44: scope mismatch warning shown near the import section -->
  {#if scopeMismatchWarning}
    <div class="bg-warning/10 text-warning-foreground border-warning/30 flex items-center gap-2 rounded-md border p-3 text-sm">
      <AlertTriangleIcon class="h-4 w-4 shrink-0" />
      {scopeMismatchWarning}
    </div>
  {/if}

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

  <!-- M-46: Import result card with breakdown -->
  {#if importResult}
    <Card.Root>
      <Card.Header>
        <Card.Title>{$t("manage.export_import.import_result_title")}</Card.Title>
      </Card.Header>
      <Card.Content>
        <ul class="text-sm">
          {#each Object.entries(importResult.imported) as [key, count]}
            {@const formatted = formatResultEntry(key, count, importResult.imported)}
            {#if formatted !== null}
              <li>
                <span class="font-medium capitalize">{key.replace(/_/g, " ")}:</span>
                {formatted}
              </li>
            {/if}
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
