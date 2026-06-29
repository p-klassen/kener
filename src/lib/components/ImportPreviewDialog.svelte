<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import AlertTriangleIcon from "@lucide/svelte/icons/triangle-alert";
  import AlertCircleIcon from "@lucide/svelte/icons/circle-alert";
  import InfoIcon from "@lucide/svelte/icons/info";
  import WrenchIcon from "@lucide/svelte/icons/wrench";
  import Loader from "@lucide/svelte/icons/loader";
  import { t } from "$lib/stores/i18n";
  import type {
    ImportPreviewResult,
    ImportOptions,
    ImportEntityPreview,
  } from "$lib/server/controllers/exportImportController.js";

  interface Props {
    open: boolean;
    preview: ImportPreviewResult | null;
    loading: boolean;
    scopeMismatch: string | null;
    onconfirm: (options: ImportOptions) => void;
    oncancel: () => void;
  }

  let { open = $bindable(), preview, loading, scopeMismatch, onconfirm, oncancel }: Props = $props();

  // Per-entity overwrite toggles, keyed by entity.key
  let overwriteToggles = $state<Record<string, boolean>>({});

  $effect(() => {
    if (!preview) return;
    const initial: Record<string, boolean> = {};
    for (const entity of preview.entities) {
      if (entity.can_toggle_overwrite) {
        initial[entity.key] = entity.overwrite_default;
      }
    }
    overwriteToggles = initial;
  });

  function buildOptions(): ImportOptions {
    return {
      overwrite_monitors: overwriteToggles["monitors"] ?? true,
      overwrite_pages: overwriteToggles["pages"] ?? true,
      overwrite_triggers: overwriteToggles["triggers"] ?? true,
      overwrite_images: overwriteToggles["images"] ?? false,
      overwrite_site_data: overwriteToggles["site_data"] ?? true,
      overwrite_auth: overwriteToggles["auth"] ?? true,
      overwrite_groups: overwriteToggles["groups"] ?? true,
      overwrite_email_templates: overwriteToggles["email_templates"] ?? true,
      overwrite_alert_configs: overwriteToggles["alert_configs"] ?? true,
    };
  }

  function handleConfirm() {
    onconfirm(buildOptions());
  }

  function entityNote(entity: ImportEntityPreview): string | null {
    if (!entity.can_toggle_overwrite) {
      switch (entity.key) {
        case "roles":
          return $t("manage.export_import.preview_roles_note");
        case "users":
          return $t("manage.export_import.preview_users_note");
        case "subscribers":
          return $t("manage.export_import.preview_subscribers_note");
        default:
          return entity.overwrite_default
            ? $t("manage.export_import.preview_fixed_update")
            : $t("manage.export_import.preview_fixed_skip");
      }
    }
    if (entity.key === "images") {
      return $t("manage.export_import.preview_images_note");
    }
    return null;
  }

  const hasErrors = $derived(preview ? !preview.version_ok || preview.entities.some((e) => e.problems.some((p) => p.severity === "error")) : false);
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
    <Dialog.Header class="shrink-0">
      <Dialog.Title>{$t("manage.export_import.preview_title")}</Dialog.Title>
      {#if preview}
        <div class="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <span class="font-medium">{$t("manage.export_import.preview_scope_label")}:</span>
            {preview.scope.replace(/_/g, " ")}
          </span>
          <span>
            <span class="font-medium">{$t("manage.export_import.preview_exported_at_label")}:</span>
            {new Date(preview.exported_at).toLocaleString()}
          </span>
        </div>
      {/if}
    </Dialog.Header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if loading}
        <div class="flex items-center justify-center py-12">
          <Loader class="text-muted-foreground size-6 animate-spin" />
          <span class="text-muted-foreground ml-2 text-sm">{$t("manage.export_import.preview_analyzing")}</span>
        </div>
      {:else if preview}
        <div class="space-y-3 p-1">
          <!-- Version error -->
          {#if !preview.version_ok}
            <div class="bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-2 rounded-md border p-3 text-sm">
              <AlertCircleIcon class="mt-0.5 size-4 shrink-0" />
              <span>{$t("manage.export_import.preview_version_error")}</span>
            </div>
          {/if}

          <!-- Scope mismatch -->
          {#if scopeMismatch}
            <div class="bg-warning/10 text-warning-foreground border-warning/30 flex items-start gap-2 rounded-md border p-3 text-sm">
              <AlertTriangleIcon class="mt-0.5 size-4 shrink-0" />
              <span>{scopeMismatch}</span>
            </div>
          {/if}

          <!-- Schema migration notice -->
          {#if preview.migration.from_version < preview.migration.to_version}
            <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
              <div class="mb-2 flex items-center gap-2 font-medium text-blue-800 dark:text-blue-300">
                <WrenchIcon class="size-4 shrink-0" />
                {$t("manage.export_import.preview_migration_title")}
              </div>
              <p class="text-blue-700 dark:text-blue-400">
                {$t("manage.export_import.preview_migration_older_version")
                  .replace("{from}", String(preview.migration.from_version))
                  .replace("{to}", String(preview.migration.to_version))}
              </p>
              {#if preview.migration.changes.length > 0}
                <p class="mt-1 text-blue-700 dark:text-blue-400">
                  {$t("manage.export_import.preview_migration_intro")
                    .replace("{from}", String(preview.migration.from_version))
                    .replace("{to}", String(preview.migration.to_version))}
                </p>
                <ul class="mt-2 space-y-1">
                  {#each preview.migration.changes as change (change.entity + change.identifier + change.description)}
                    <li class="font-mono text-xs text-blue-800 dark:text-blue-300">
                      <span class="font-semibold">[{change.entity}]</span>
                      <span class="mx-1">{change.identifier}:</span>
                      <span class="text-blue-600 dark:text-blue-400">{change.description}</span>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="mt-1 text-blue-600 dark:text-blue-400">
                  {$t("manage.export_import.preview_migration_no_data_changes")}
                </p>
              {/if}
            </div>
          {/if}

          <!-- No entities -->
          {#if preview.entities.length === 0}
            <p class="text-muted-foreground py-6 text-center text-sm">
              {$t("manage.export_import.preview_nothing_to_import")}
            </p>
          {:else}
            {#each preview.entities as entity (entity.key)}
              {@const note = entityNote(entity)}
              <div class="rounded-lg border p-3">
                <!-- Entity header row -->
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <span class="shrink-0 text-sm font-medium">{entity.label}</span>

                    <!-- Count badges -->
                    {#if entity.new_count > 0}
                      <Badge variant="outline" class="border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
                        +{entity.new_count} {$t("manage.export_import.preview_new")}
                      </Badge>
                    {/if}
                    {#if entity.overwrite_count > 0}
                      <Badge variant="outline" class="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        {entity.overwrite_count} {$t("manage.export_import.preview_update")}
                      </Badge>
                    {/if}
                    {#if entity.skip_count > 0}
                      <Badge variant="outline" class="text-muted-foreground">
                        {entity.skip_count} {$t("manage.export_import.preview_skip")}
                      </Badge>
                    {/if}
                  </div>

                  <!-- Overwrite toggle -->
                  {#if entity.can_toggle_overwrite && entity.overwrite_count > 0}
                    <div class="flex shrink-0 items-center gap-2">
                      <Label for="toggle-{entity.key}" class="text-muted-foreground cursor-pointer text-xs">
                        {$t("manage.export_import.preview_overwrite_label")}
                      </Label>
                      <Switch
                        id="toggle-{entity.key}"
                        checked={overwriteToggles[entity.key] ?? entity.overwrite_default}
                        onCheckedChange={(checked) => {
                          overwriteToggles = { ...overwriteToggles, [entity.key]: checked };
                        }}
                      />
                    </div>
                  {/if}
                </div>

                <!-- Fixed-behavior note -->
                {#if note}
                  <p class="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
                    <InfoIcon class="size-3 shrink-0" />
                    {note}
                  </p>
                {/if}

                <!-- Problems -->
                {#if entity.problems.length > 0}
                  <div class="mt-2 space-y-1">
                    <p class="text-muted-foreground text-xs font-medium">{$t("manage.export_import.preview_problems_header")}</p>
                    {#each entity.problems as problem (problem.identifier + problem.description)}
                      <div class="flex items-start gap-1.5 text-xs {problem.severity === 'error' ? 'text-destructive' : 'text-warning-foreground'}">
                        {#if problem.severity === "error"}
                          <AlertCircleIcon class="mt-0.5 size-3 shrink-0" />
                        {:else}
                          <AlertTriangleIcon class="mt-0.5 size-3 shrink-0" />
                        {/if}
                        <span><span class="font-mono">{problem.identifier}</span>: {problem.description}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          {/if}

          <!-- Error summary -->
          {#if hasErrors && preview.version_ok}
            <div class="bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-2 rounded-md border p-3 text-sm">
              <AlertCircleIcon class="mt-0.5 size-4 shrink-0" />
              <span>{$t("manage.export_import.preview_has_errors")}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <Dialog.Footer class="shrink-0 border-t pt-4">
      <Button variant="outline" onclick={oncancel}>{$t("manage.export_import.preview_cancel")}</Button>
      <Button onclick={handleConfirm} disabled={loading || !preview || hasErrors || preview.entities.length === 0}>
        {$t("manage.export_import.preview_proceed")}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
