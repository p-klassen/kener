<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { toast } from "svelte-sonner";
  import Loader from "@lucide/svelte/icons/loader";
  import SaveIcon from "@lucide/svelte/icons/save";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import XIcon from "@lucide/svelte/icons/x";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import ImageIcon from "@lucide/svelte/icons/image";
  import TrashIcon from "@lucide/svelte/icons/trash";
  import type { PageRecord, MonitorRecord, PageSettingsType } from "$lib/server/types/db.js";
  import type { SitePageDefaults } from "$lib/types/site.js";
  import { mode } from "mode-watcher";
  import CodeMirror from "svelte-codemirror-editor";
  import { onMount } from "svelte";
  import { markdown } from "@codemirror/lang-markdown";
  import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import GC from "$lib/global-constants.js";
  import { t } from "$lib/stores/i18n";


  // null = use site default; explicit value = custom override
  const NULL_PAGE_SETTINGS: PageSettingsType = {
    monitor_status_history_days: { desktop: null, mobile: null },
    monitor_layout_style: null,
  };

  const SYSTEM_PAGE_DEFAULTS: SitePageDefaults = {
    monitor_status_history_days: { desktop: 90, mobile: 30 },
    monitor_layout_style: "default-list",
  };

  let siteDefaults = $state<SitePageDefaults>(structuredClone(SYSTEM_PAGE_DEFAULTS));

  interface PageWithMonitors extends PageRecord {
    monitors?: { monitor_tag: string }[];
  }

  // Get page ID from URL params
  const pageId = $derived(page.params.page_id);
  const isNew = $derived(pageId === "new");

  // State
  let loading = $state(true);
  let saving = $state(false);
  let savingMonitors = $state(false);
  let uploadingLogo = $state(false);
  let uploadingSocialPreview = $state(false);

  // Page data
  let currentPage = $state<PageWithMonitors | null>(null);
  let monitors = $state<MonitorRecord[]>([]);

  // Form state
  let formData = $state({
    page_path: "",
    page_title: "",
    page_header: "",
    page_subheader: "",
    page_logo: "",
    is_public: 1,
    visibility_mode: "hidden" as "hidden" | "teaser" | "locked"
  });

  // Monitor selection
  let selectedMonitorTag = $state("");
  let selectedMonitors = $state<string[]>([]);
  let addingMonitor = $state(false);
  let removingMonitor = $state<string | null>(null);
  let reordering = $state(false);

  // Delete state
  let deleteConfirmText = $state("");
  let deleting = $state(false);
  const canDelete = $derived(
    !isNew &&
      currentPage &&
      currentPage.page_path !== "" &&
      deleteConfirmText === `delete ${currentPage?.page_path || "home"}`
  );

  // Page settings state
  let pageSettings = $state<PageSettingsType>(structuredClone(NULL_PAGE_SETTINGS));
  let savingDisplaySettings = $state(false);
  let savingSeoSettings = $state(false);

  // Validation
  const isFormValid = $derived(formData.page_title.trim().length > 0 && formData.page_header.trim().length > 0);

  async function fetchPage() {
    if (isNew) {
      loading = false;
      return;
    }

    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPages" })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
        goto(clientResolver(resolve, "/manage/app/pages"));
        return;
      }

      const foundPage = result.find((p: PageWithMonitors) => p.id === parseInt(pageId || "0"));
      if (foundPage) {
        currentPage = foundPage;
        formData = {
          page_path: foundPage.page_path,
          page_title: foundPage.page_title,
          page_header: foundPage.page_header,
          page_subheader: foundPage.page_subheader || "",
          page_logo: foundPage.page_logo || "",
          is_public: foundPage.is_public ?? 1,
          visibility_mode: (foundPage.visibility_mode ?? "hidden") as "hidden" | "teaser" | "locked"
        };
        selectedMonitors = foundPage.monitors?.map((m: { monitor_tag: string }) => m.monitor_tag) || [];
        // Load page settings — null fields mean "use site default"
        if (foundPage.page_settings_json) {
          try {
            const parsed =
              typeof foundPage.page_settings_json === "string"
                ? JSON.parse(foundPage.page_settings_json)
                : foundPage.page_settings_json;
            pageSettings = {
              monitor_status_history_days: {
                desktop: parsed?.monitor_status_history_days?.desktop ?? null,
                mobile: parsed?.monitor_status_history_days?.mobile ?? null,
              },
              monitor_layout_style: parsed?.monitor_layout_style ?? null,
              metaPageTitle: parsed?.metaPageTitle,
              metaPageDescription: parsed?.metaPageDescription,
              socialPagePreviewImage: parsed?.socialPagePreviewImage,
            };
          } catch {
            pageSettings = structuredClone(NULL_PAGE_SETTINGS);
          }
        } else {
          pageSettings = structuredClone(NULL_PAGE_SETTINGS);
        }
      } else {
        toast.error("Page not found");
        goto(clientResolver(resolve, "/manage/app/pages"));
      }
    } catch (e) {
      toast.error("Failed to load page");
      goto(clientResolver(resolve, "/manage/app/pages"));
    } finally {
      loading = false;
    }
  }

  async function fetchMonitors() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMonitors", data: {} })
      });
      const result = await response.json();
      if (!result.error) {
        monitors = result;
      }
    } catch (e) {
      console.error("Failed to fetch monitors", e);
    }
  }

  async function fetchSiteDefaults() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getAllSiteData" })
      });
      const data = await response.json();
      if (data.pageDefaults) {
        const parsed =
          typeof data.pageDefaults === "string"
            ? JSON.parse(data.pageDefaults)
            : data.pageDefaults;
        siteDefaults = {
          monitor_status_history_days: {
            desktop: parsed?.monitor_status_history_days?.desktop ?? SYSTEM_PAGE_DEFAULTS.monitor_status_history_days.desktop,
            mobile: parsed?.monitor_status_history_days?.mobile ?? SYSTEM_PAGE_DEFAULTS.monitor_status_history_days.mobile,
          },
          monitor_layout_style: parsed?.monitor_layout_style ?? SYSTEM_PAGE_DEFAULTS.monitor_layout_style,
        };
      }
    } catch {}
  }

  async function savePage() {
    if (!isFormValid) return;

    saving = true;
    try {
      const action = isNew ? "createPage" : "updatePage";
      // Make page_path URL-friendly: lowercase, replace spaces with hyphens, remove special chars
      const sanitizedPath = formData.page_path
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "");
      const data: Record<string, unknown> = {
        page_path: sanitizedPath,
        page_title: formData.page_title,
        page_header: formData.page_header,
        page_subheader: formData.page_subheader || null,
        page_logo: formData.page_logo || null,
        is_public: formData.is_public,
        visibility_mode: formData.visibility_mode
      };

      if (!isNew && currentPage) {
        data.id = currentPage.id;
      }

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isNew ? $t("manage.page_detail.created_toast") : $t("manage.page_detail.updated_toast"));
        if (isNew && result.id) {
          // Navigate to the newly created page
          goto(clientResolver(resolve, `/manage/app/pages/${result.id}`));
        } else if (isNew) {
          // Fallback: go back to pages list
          goto(clientResolver(resolve, "/manage/app/pages"));
        }
      }
    } catch (e) {
      toast.error(isNew ? $t("manage.page_detail.create_error") : $t("manage.page_detail.update_error"));
    } finally {
      saving = false;
    }
  }

  async function addMonitorToPage() {
    if (!currentPage || !selectedMonitorTag) return;

    addingMonitor = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addMonitorToPage",
          data: {
            page_id: currentPage.id,
            monitor_tag: selectedMonitorTag
          }
        })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.page_detail.monitor_added_toast"));
        selectedMonitors = [...selectedMonitors, selectedMonitorTag];
        selectedMonitorTag = "";
      }
    } catch (e) {
      toast.error($t("manage.page_detail.monitor_add_error"));
    } finally {
      addingMonitor = false;
    }
  }

  async function deletePage() {
    if (!currentPage || !canDelete) return;

    deleting = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deletePage",
          data: { id: currentPage.id }
        })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.page_detail.deleted_toast"));
        goto(clientResolver(resolve, "/manage/app/pages"));
      }
    } catch (e) {
      toast.error($t("manage.page_detail.delete_error"));
    } finally {
      deleting = false;
    }
  }

  async function removeMonitorFromPage(monitorTag: string) {
    if (!currentPage) return;

    removingMonitor = monitorTag;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeMonitorFromPage",
          data: {
            page_id: currentPage.id,
            monitor_tag: monitorTag
          }
        })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.page_detail.monitor_removed_toast"));
        selectedMonitors = selectedMonitors.filter((t) => t !== monitorTag);
      }
    } catch (e) {
      toast.error($t("manage.page_detail.monitor_remove_error"));
    } finally {
      removingMonitor = null;
    }
  }

  // Get available monitors (not already on the current page)
  const availableMonitors = $derived(monitors.filter((m) => !selectedMonitors.includes(m.tag)));

  async function moveMonitor(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedMonitors.length) return;

    const updated = [...selectedMonitors];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    selectedMonitors = updated;

    if (!currentPage) return;
    reordering = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorderPageMonitors",
          data: {
            page_id: currentPage.id,
            monitor_tags: selectedMonitors
          }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error("Failed to reorder monitors");
    } finally {
      reordering = false;
    }
  }

  // Image upload functions
  async function handleLogoUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Allowed: PNG, JPG, SVG, WebP");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > GC.MAX_UPLOAD_BYTES) {
      toast.error(`File too large. Maximum size is ${GC.MAX_UPLOAD_BYTES / (1024 * 1024)}MB`);
      return;
    }

    uploadingLogo = true;

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadImage",
          data: {
            base64,
            mimeType: file.type,
            fileName: file.name,
            maxWidth: 256,
            maxHeight: 256,
            prefix: "page_logo_"
          }
        })
      });

      if (!response.ok) {
        toast.error("Failed to upload logo");
        return;
      }
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        formData.page_logo = result.url;
        toast.success("Logo uploaded successfully");
      }
    } catch (e) {
      toast.error("Failed to upload logo");
    } finally {
      uploadingLogo = false;
      input.value = "";
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  function clearLogo() {
    formData.page_logo = "";
  }

  function clearSocialPreview() {
    pageSettings.socialPagePreviewImage = "";
  }

  async function handleSocialPreviewUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Allowed: PNG, JPG, WebP");
      return;
    }

    if (file.size > GC.MAX_UPLOAD_BYTES) {
      toast.error(`File too large. Maximum size is ${GC.MAX_UPLOAD_BYTES / (1024 * 1024)}MB`);
      return;
    }

    uploadingSocialPreview = true;
    try {
      const base64 = await fileToBase64(file);
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadImage",
          data: {
            base64,
            mimeType: file.type,
            fileName: file.name,
            maxWidth: 1200,
            maxHeight: 630,
            prefix: "page_social_"
          }
        })
      });

      if (!response.ok) {
        toast.error("Failed to upload social preview image");
        return;
      }
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        pageSettings.socialPagePreviewImage = result.url;
        toast.success("Social preview image uploaded");
      }
    } catch (e) {
      toast.error("Failed to upload social preview image");
    } finally {
      uploadingSocialPreview = false;
      input.value = "";
    }
  }

  async function savePageSettings(source: "display" | "seo") {
    if (!currentPage) return;

    if (source === "display") savingDisplaySettings = true;
    else savingSeoSettings = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updatePage",
          data: {
            id: currentPage.id,
            page_settings_json: JSON.stringify(pageSettings)
          }
        })
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.page_detail.settings_saved"));
      }
    } catch (e) {
      toast.error($t("manage.page_detail.settings_error"));
    } finally {
      if (source === "display") savingDisplaySettings = false;
      else savingSeoSettings = false;
    }
  }

  onMount(() => {
    void fetchPage();
    void fetchMonitors();
    fetchSiteDefaults();
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else}
    <!-- Breadcrumb & Header -->
    <div class="flex items-center justify-between">
      <Breadcrumb.Root>
        <Breadcrumb.List>
          <Breadcrumb.Item>
            <Breadcrumb.Link href={clientResolver(resolve, "/manage/app/pages")}>{$t("manage.page_detail.breadcrumb")}</Breadcrumb.Link>
          </Breadcrumb.Item>
          <Breadcrumb.Separator />
          <Breadcrumb.Item>
            <Breadcrumb.Page>{isNew ? $t("manage.page_detail.new_title") : currentPage?.page_title || "Edit Page"}</Breadcrumb.Page>
          </Breadcrumb.Item>
        </Breadcrumb.List>
      </Breadcrumb.Root>
      <div>
        {#if !isNew}
          <Button
            variant="outline"
            target="_blank"
            size="sm"
            href={clientResolver(resolve, `/${currentPage?.page_path}`)}
          >
            View
          </Button>
        {/if}
      </div>
    </div>

    <!-- General Information Card -->
    <Card.Root>
      <Card.Header>
        <Card.Title>General Information</Card.Title>
        <Card.Description>
          {isNew ? $t("manage.page_detail.create_card_desc") : $t("manage.page_detail.edit_card_desc")}
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <!-- Path -->
        <div class="space-y-2">
          <Label for="page-path">
            {$t("manage.page_detail.path_label")} <span class="text-destructive">*</span>
          </Label>
          <Input
            id="page-path"
            type="text"
            bind:value={formData.page_path}
            disabled={!isNew && currentPage?.page_path === ""}
          />
          <p class="text-muted-foreground text-xs">
            {!isNew && currentPage?.page_path === ""
              ? $t("manage.page_detail.path_home_helper")
              : $t("manage.page_detail.path_helper")}
          </p>
        </div>

        <!-- Title -->
        <div class="space-y-2">
          <Label for="page-title">
            {$t("manage.page_detail.title_label")} <span class="text-destructive">*</span>
          </Label>
          <Input id="page-title" type="text" bind:value={formData.page_title} placeholder={$t("manage.page_detail.title_placeholder")} />
          <p class="text-muted-foreground text-xs">{$t("manage.page_detail.title_helper")}</p>
        </div>

        <!-- Header -->
        <div class="space-y-2">
          <Label for="page-header">
            {$t("manage.page_detail.header_label")} <span class="text-destructive">*</span>
          </Label>
          <Input id="page-header" type="text" bind:value={formData.page_header} placeholder="Services Status" />
          <p class="text-muted-foreground text-xs">{$t("manage.page_detail.header_helper")}</p>
        </div>

        <!-- Subheader -->
        <div class="space-y-2">
          <Label for="page-subheader">{$t("manage.page_detail.content_label")}</Label>
          <div class="overflow-hidden rounded-md border">
            <CodeMirror
              bind:value={formData.page_subheader}
              lang={markdown()}
              theme={mode.current === "dark" ? githubDark : githubLight}
              styles={{
                "&": {
                  width: "100%",
                  maxWidth: "100%",
                  height: "160px"
                }
              }}
            />
          </div>
          <p class="text-muted-foreground text-xs">{$t("manage.page_detail.content_helper")}</p>
        </div>

        <!-- Logo Upload -->
        <div class="space-y-2">
          <Label>{$t("manage.page_detail.logo_label")}</Label>
          <div class="flex items-start gap-4">
            <div class="bg-muted flex h-16 w-16 items-center justify-center rounded-lg border">
              {#if formData.page_logo}
                <img
                  src={clientResolver(resolve, formData.page_logo)}
                  alt="Logo"
                  class="max-h-14 max-w-14 object-contain"
                />
              {:else}
                <ImageIcon class="text-muted-foreground h-6 w-6" />
              {/if}
            </div>
            <div class="flex flex-1 flex-col gap-2">
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onclick={() => document.getElementById("page-logo-input")?.click()}
                >
                  {#if uploadingLogo}
                    <Loader class="h-4 w-4 animate-spin" />
                    {$t("manage.page_detail.logo_uploading")}
                  {:else}
                    <UploadIcon class="h-4 w-4" />
                    {$t("manage.page_detail.logo_upload")}
                  {/if}
                </Button>
                <input
                  id="page-logo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,image/heic,image/heif"
                  class="hidden"
                  onchange={handleLogoUpload}
                  disabled={uploadingLogo}
                />
                {#if formData.page_logo}
                  <Button variant="ghost" size="sm" onclick={clearLogo}>
                    <XIcon class="h-4 w-4" />
                  </Button>
                {/if}
              </div>
              <p class="text-muted-foreground text-xs">{$t("manage.page_detail.logo_helper")}</p>
            </div>
          </div>
        </div>

        <!-- Visibility -->
        <div class="space-y-3">
          <Label>{$t("manage.page_detail.visibility_label")}</Label>
          <div class="flex items-center gap-2">
            <Switch
              id="is_public"
              checked={!!formData.is_public}
              onCheckedChange={(v) => (formData.is_public = v ? 1 : 0)}
            />
            <Label for="is_public" class="font-normal">{$t("manage.page_detail.visibility_public")}</Label>
          </div>

          {#if !formData.is_public}
            <div class="ml-6 space-y-2">
              <p class="text-muted-foreground text-xs">{$t("manage.page_detail.visibility_helper")}</p>
              {#each [
                { value: 'hidden', label: $t("manage.page_detail.visibility_hidden_label"), desc: $t("manage.page_detail.visibility_hidden_desc") },
                { value: 'teaser', label: $t("manage.page_detail.visibility_teaser_label"), desc: $t("manage.page_detail.visibility_teaser_desc") },
                { value: 'locked', label: $t("manage.page_detail.visibility_locked_label"), desc: $t("manage.page_detail.visibility_locked_desc") },
              ] as opt (opt.value)}
                <label class="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="visibility_mode"
                    value={opt.value}
                    checked={formData.visibility_mode === opt.value}
                    onchange={() => (formData.visibility_mode = opt.value as "hidden" | "teaser" | "locked")}
                    class="mt-0.5"
                  />
                  <span>
                    <span class="text-sm font-medium">{opt.label}</span>
                    <span class="text-muted-foreground ml-1 text-xs">— {opt.desc}</span>
                  </span>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      </Card.Content>
      <Card.Footer class="flex justify-end">
        <Button onclick={savePage} disabled={saving || !isFormValid}>
          {#if saving}
            <Loader class="h-4 w-4 animate-spin" />
            {isNew ? $t("manage.page_detail.creating") : $t("manage.page_detail.saving")}
          {:else}
            <SaveIcon class="h-4 w-4" />
            {isNew ? $t("manage.page_detail.create_button") : $t("manage.page_detail.save_button")}
          {/if}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Monitors Card (only shown for existing pages) -->
    {#if !isNew && currentPage}
      <Card.Root>
        <Card.Header>
          <Card.Title>{$t("manage.page_detail.monitors_title")}</Card.Title>
          <Card.Description>{$t("manage.page_detail.monitors_desc")}</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <!-- Add Monitor -->
          <div class="flex gap-2">
            <Select.Root type="single" bind:value={selectedMonitorTag}>
              <Select.Trigger class="flex-1">
                {#if selectedMonitorTag}
                  {monitors.find((m) => m.tag === selectedMonitorTag)?.name || selectedMonitorTag}
                {:else}
                  Select a monitor to add
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each availableMonitors as monitor (monitor.tag)}
                  <Select.Item value={monitor.tag}>{monitor.name} ({monitor.tag})</Select.Item>
                {/each}
                {#if availableMonitors.length === 0}
                  <div class="text-muted-foreground px-2 py-1 text-sm">{$t("manage.page_detail.no_available_monitors")}</div>
                {/if}
              </Select.Content>
            </Select.Root>
            <Button onclick={addMonitorToPage} disabled={addingMonitor || !selectedMonitorTag}>
              {#if addingMonitor}
                <Loader class="h-4 w-4 animate-spin" />
              {:else}
                <PlusIcon class="h-4 w-4" />
                Add
              {/if}
            </Button>
          </div>

          <!-- Current Monitors -->
          <div class="space-y-2">
            <Label>{$t("manage.page_detail.current_monitors")}</Label>
            {#if selectedMonitors.length > 0}
              <div class="space-y-2">
                {#each selectedMonitors as monitorTag, i (monitorTag)}
                  {@const monitor = monitors.find((m) => m.tag === monitorTag)}
                  <div class="bg-muted flex items-center justify-between rounded-lg p-3">
                    <div>
                      <p class="font-medium">{monitor?.name || monitorTag}</p>
                      <p class="text-muted-foreground text-xs">{monitorTag}</p>
                    </div>
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => moveMonitor(i, "up")}
                        disabled={i === 0 || reordering}
                      >
                        <ArrowUpIcon class="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => moveMonitor(i, "down")}
                        disabled={i === selectedMonitors.length - 1 || reordering}
                      >
                        <ArrowDownIcon class="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => removeMonitorFromPage(monitorTag)}
                        disabled={removingMonitor === monitorTag}
                      >
                        {#if removingMonitor === monitorTag}
                          <Loader class="h-4 w-4 animate-spin" />
                        {:else}
                          <XIcon class="h-4 w-4" />
                        {/if}
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-muted-foreground bg-muted rounded-lg p-4 text-center text-sm">
                {$t("manage.page_detail.no_monitors")}
              </div>
            {/if}
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Page Settings Card -->
      <Card.Root>
        <Card.Header>
          <Card.Title>{$t("manage.page_detail.display_title")}</Card.Title>
          <Card.Description>{$t("manage.page_detail.display_desc")}</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-6">
          <!-- Monitor Status History Days -->
          <div class="space-y-4">
            <div>
              <Label class="text-base font-medium">{$t("manage.page_detail.history_label")}</Label>
              <p class="text-muted-foreground text-sm">{$t("manage.page_detail.history_helper")}</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <!-- Desktop -->
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Label for="history-desktop">{$t("manage.page_detail.history_desktop_label")}</Label>
                  {#if pageSettings.monitor_status_history_days?.desktop === null || pageSettings.monitor_status_history_days?.desktop === undefined}
                    <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                      {$t("manage.page_detail.site_default_badge")}
                    </span>
                  {:else}
                    <span class="rounded border px-1.5 py-0.5 text-xs">
                      {$t("manage.page_detail.custom_badge")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-xs"
                      onclick={() => {
                        if (!pageSettings.monitor_status_history_days) {
                          pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                        } else {
                          pageSettings.monitor_status_history_days.desktop = null;
                        }
                      }}
                    >
                      {$t("manage.page_detail.reset_to_default")}
                    </Button>
                  {/if}
                </div>
                <Input
                  id="history-desktop"
                  type="number"
                  min="1"
                  max="365"
                  value={pageSettings.monitor_status_history_days?.desktop ?? ""}
                  placeholder={String(siteDefaults.monitor_status_history_days.desktop)}
                  oninput={(e) => {
                    const v = parseInt((e.currentTarget as HTMLInputElement).value);
                    if (!pageSettings.monitor_status_history_days) {
                      pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                    }
                    pageSettings.monitor_status_history_days.desktop = isNaN(v) ? null : v;
                  }}
                />
                <p class="text-muted-foreground text-xs">{$t("manage.page_detail.history_desktop_helper")}</p>
              </div>

              <!-- Mobile -->
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <Label for="history-mobile">{$t("manage.page_detail.history_mobile_label")}</Label>
                  {#if pageSettings.monitor_status_history_days?.mobile === null || pageSettings.monitor_status_history_days?.mobile === undefined}
                    <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                      {$t("manage.page_detail.site_default_badge")}
                    </span>
                  {:else}
                    <span class="rounded border px-1.5 py-0.5 text-xs">
                      {$t("manage.page_detail.custom_badge")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-xs"
                      onclick={() => {
                        if (!pageSettings.monitor_status_history_days) {
                          pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                        } else {
                          pageSettings.monitor_status_history_days.mobile = null;
                        }
                      }}
                    >
                      {$t("manage.page_detail.reset_to_default")}
                    </Button>
                  {/if}
                </div>
                <Input
                  id="history-mobile"
                  type="number"
                  min="1"
                  max="365"
                  value={pageSettings.monitor_status_history_days?.mobile ?? ""}
                  placeholder={String(siteDefaults.monitor_status_history_days.mobile)}
                  oninput={(e) => {
                    const v = parseInt((e.currentTarget as HTMLInputElement).value);
                    if (!pageSettings.monitor_status_history_days) {
                      pageSettings.monitor_status_history_days = { desktop: null, mobile: null };
                    }
                    pageSettings.monitor_status_history_days.mobile = isNaN(v) ? null : v;
                  }}
                />
                <p class="text-muted-foreground text-xs">{$t("manage.page_detail.history_mobile_helper")}</p>
              </div>
            </div>
          </div>

          <hr class="border-muted" />

          <!-- Monitor Layout Style -->
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <Label class="text-base font-medium">{$t("manage.page_detail.layout_label")}</Label>
              {#if pageSettings.monitor_layout_style === null}
                <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                  {$t("manage.page_detail.site_default_badge")}
                </span>
              {:else}
                <span class="rounded border px-1.5 py-0.5 text-xs">
                  {$t("manage.page_detail.custom_badge")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-2 text-xs"
                  onclick={() => { pageSettings.monitor_layout_style = null; }}
                >
                  {$t("manage.page_detail.reset_to_default")}
                </Button>
              {/if}
            </div>
            <p class="text-muted-foreground text-sm">{$t("manage.page_detail.layout_helper")}</p>
            <Select.Root
              type="single"
              value={pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style}
              onValueChange={(v) => {
                pageSettings.monitor_layout_style = v as PageSettingsType["monitor_layout_style"];
              }}
            >
              <Select.Trigger class="w-full">
                {#if (pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style) === "default-list"}
                  Default List
                {:else if (pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style) === "default-grid"}
                  Default Grid
                {:else if (pageSettings.monitor_layout_style ?? siteDefaults.monitor_layout_style) === "compact-list"}
                  Compact List
                {:else}
                  Compact Grid
                {/if}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="default-list">Default List</Select.Item>
                <Select.Item value="default-grid">Default Grid</Select.Item>
                <Select.Item value="compact-list">Compact List</Select.Item>
                <Select.Item value="compact-grid">Compact Grid</Select.Item>
              </Select.Content>
            </Select.Root>
            <p class="text-muted-foreground text-xs">
              {$t("manage.page_detail.site_default_badge")}: <code class="bg-muted rounded px-1 font-mono">{siteDefaults.monitor_layout_style}</code>
            </p>
          </div>
        </Card.Content>
        <Card.Footer class="flex justify-end">
          <Button onclick={() => savePageSettings("display")} disabled={savingDisplaySettings}>
            {#if savingDisplaySettings}
              <Loader class="h-4 w-4 animate-spin" />
              {$t("manage.page_detail.saving")}
            {:else}
              <SaveIcon class="h-4 w-4" />
              {$t("manage.page_detail.save_prefs")}
            {/if}
          </Button>
        </Card.Footer>
      </Card.Root>

      <!-- Social Preview & SEO Card -->
      <Card.Root>
        <Card.Header>
          <Card.Title>{$t("manage.page_detail.seo_title")}</Card.Title>
          <Card.Description
            >{$t("manage.page_detail.seo_desc")}</Card.Description
          >
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="flex items-start gap-4">
            <!-- Preview -->
            <div class="bg-muted flex h-32 w-64 items-center justify-center rounded-lg border">
              {#if pageSettings.socialPagePreviewImage}
                <img
                  src={clientResolver(resolve, pageSettings.socialPagePreviewImage)}
                  alt="Social preview"
                  class="h-full w-full rounded-lg object-cover"
                />
              {:else}
                <ImageIcon class="text-muted-foreground h-8 w-8" />
              {/if}
            </div>

            <!-- Upload Controls -->
            <div class="flex flex-1 flex-col gap-2">
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingSocialPreview}
                  onclick={() => document.getElementById("page-social-preview-input")?.click()}
                >
                  {#if uploadingSocialPreview}
                    <Loader class="h-4 w-4 animate-spin" />
                    {$t("manage.page_detail.seo_uploading")}
                  {:else}
                    <UploadIcon class="h-4 w-4" />
                    {$t("manage.page_detail.seo_upload")}
                  {/if}
                </Button>
                <input
                  id="page-social-preview-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
                  class="hidden"
                  onchange={handleSocialPreviewUpload}
                  disabled={uploadingSocialPreview}
                />
                {#if pageSettings.socialPagePreviewImage}
                  <Button variant="ghost" size="sm" onclick={clearSocialPreview}>
                    <XIcon class="h-4 w-4" />
                  </Button>
                {/if}
              </div>
              {#if pageSettings.socialPagePreviewImage}
                <p class="text-muted-foreground truncate text-xs">{pageSettings.socialPagePreviewImage}</p>
              {:else}
                <p class="text-muted-foreground text-xs">Optional. Leave empty to use site default.</p>
              {/if}
            </div>
          </div>

          <div class="space-y-2">
            <Label for="page-metaPageTitle">{$t("manage.page_detail.meta_title_label")}</Label>
            <Input
              id="page-metaPageTitle"
              type="text"
              bind:value={pageSettings.metaPageTitle}
              placeholder={$t("manage.page_detail.meta_title_placeholder")}
            />
            <p class="text-muted-foreground text-xs">{$t("manage.page_detail.meta_title_helper")}</p>
          </div>
          <div class="space-y-2">
            <Label for="page-metaPageDescription">{$t("manage.page_detail.meta_desc_label")}</Label>
            <Textarea
              id="page-metaPageDescription"
              bind:value={pageSettings.metaPageDescription}
              placeholder={$t("manage.page_detail.meta_desc_placeholder")}
              rows={3}
            />
            <p class="text-muted-foreground text-xs">{$t("manage.page_detail.meta_desc_helper")}</p>
          </div>
        </Card.Content>
        <Card.Footer class="flex justify-end">
          <Button onclick={() => savePageSettings("seo")} disabled={savingSeoSettings}>
            {#if savingSeoSettings}
              <Loader class="h-4 w-4 animate-spin" />
              Saving...
            {:else}
              <SaveIcon class="h-4 w-4" />
              {$t("manage.page_detail.save_button")}
            {/if}
          </Button>
        </Card.Footer>
      </Card.Root>

      <!-- Danger Zone Card (only for non-home pages) -->
      {#if currentPage.page_path !== ""}
        <Card.Root class="border-destructive">
          <Card.Header>
            <Card.Title class="text-destructive">{$t("manage.page_detail.danger_title")}</Card.Title>
            <Card.Description>{$t("manage.page_detail.danger_desc")}</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="space-y-2">
              <Label for="delete-confirm">{$t("manage.page_detail.delete_label")}</Label>
              <p class="text-muted-foreground text-sm">
                {$t("manage.page_detail.delete_warning")}
              </p>
              <p class="text-muted-foreground text-sm">
                Type <code class="bg-muted rounded px-1 font-mono">delete {currentPage.page_path || "home"}</code> to confirm:
              </p>
              <Input
                id="delete-confirm"
                type="text"
                bind:value={deleteConfirmText}
                placeholder="delete {currentPage.page_path || 'home'}"
              />
            </div>
          </Card.Content>
          <Card.Footer class="flex justify-end">
            <Button variant="destructive" onclick={deletePage} disabled={!canDelete || deleting}>
              {#if deleting}
                <Loader class="h-4 w-4 animate-spin" />
                {$t("manage.page_detail.deleting")}
              {:else}
                <TrashIcon class="h-4 w-4" />
                {$t("manage.page_detail.delete_button")}
              {/if}
            </Button>
          </Card.Footer>
        </Card.Root>
      {/if}
    {/if}
  {/if}
</div>
