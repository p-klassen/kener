<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import SaveIcon from "@lucide/svelte/icons/save";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import MailIcon from "@lucide/svelte/icons/mail";
  import Loader from "@lucide/svelte/icons/loader";
  import { toast } from "svelte-sonner";
  import { mode } from "mode-watcher";
  import CodeMirror from "svelte-codemirror-editor";
  import { html } from "@codemirror/lang-html";
  import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";


  interface GeneralEmailTemplate {
    template_id: string;
    template_subject: string | null;
    template_html_body: string | null;
    template_text_body: string | null;
  }

  // State
  let loading = $state(true);
  let saving = $state(false);
  let templates = $state<GeneralEmailTemplate[]>([]);
  let selectedLocale = $state<string>("");
  let selectedTemplateId = $state<string>("");

  // Form state for selected template
  let templateSubject = $state("");
  let templateHtmlBody = $state("");
  let templateTextBody = $state("");

  function getLocale(id: string): string {
    const dotIdx = id.lastIndexOf(".");
    return dotIdx !== -1 ? id.slice(dotIdx + 1) : "en";
  }

  function getLocaleName(locale: string): string {
    try {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale.toUpperCase();
    } catch {
      return locale.toUpperCase();
    }
  }

  // Derived: unique sorted locales
  let availableLocales = $derived(
    [...new Set(templates.map((t) => getLocale(t.template_id)))].sort((a, b) => {
      // Put "en" first
      if (a === "en") return -1;
      if (b === "en") return 1;
      return a.localeCompare(b);
    })
  );

  // Derived: templates filtered by selected locale
  let filteredTemplates = $derived(
    selectedLocale ? templates.filter((t) => getLocale(t.template_id) === selectedLocale) : []
  );

  onMount(() => {
    fetchTemplates();
  });

  function handleLocaleSelect(locale: string) {
    selectedLocale = locale;
    selectedTemplateId = "";
    templateSubject = "";
    templateHtmlBody = "";
    templateTextBody = "";
  }

  function handleTemplateSelect(templateId: string) {
    selectedTemplateId = templateId;
    const template = templates.find((t) => t.template_id === templateId);
    if (template) {
      templateSubject = template.template_subject || "";
      templateHtmlBody = template.template_html_body || "";
      templateTextBody = template.template_text_body || "";
    } else {
      templateSubject = "";
      templateHtmlBody = "";
      templateTextBody = "";
    }
  }

  async function fetchTemplates() {
    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getGeneralEmailTemplates",
          data: {}
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        templates = result;
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error($t("manage.templates.load_error"));
    } finally {
      loading = false;
    }
  }

  async function updateTemplate() {
    if (!selectedTemplateId) {
      toast.error("Please select a template");
      return;
    }

    saving = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateGeneralEmailTemplate",
          data: {
            templateId: selectedTemplateId,
            template_subject: templateSubject,
            template_html_body: templateHtmlBody,
            template_text_body: templateTextBody
          }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success($t("manage.templates.updated_toast"));
        const index = templates.findIndex((t) => t.template_id === selectedTemplateId);
        if (index !== -1) {
          templates[index] = {
            ...templates[index],
            template_subject: templateSubject,
            template_html_body: templateHtmlBody,
            template_text_body: templateTextBody
          };
        }
      }
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error($t("manage.templates.update_error"));
    } finally {
      saving = false;
    }
  }

  function formatTemplateBase(id: string): string {
    const dotIdx = id.lastIndexOf(".");
    const base = dotIdx !== -1 ? id.slice(0, dotIdx) : id;
    return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
</script>

<div class="flex w-full flex-col gap-4 p-4">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else if templates.length === 0}
    <Card.Root>
      <Card.Content class="flex flex-col items-center justify-center py-12">
        <MailIcon class="text-muted-foreground mb-4 size-12" />
        <h3 class="mb-2 text-lg font-semibold">{$t("manage.templates.no_templates_title")}</h3>
        <p class="text-muted-foreground text-center">{$t("manage.templates.no_templates_desc")}</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <FileTextIcon class="size-5" />
          {$t("manage.templates.edit_title")}
        </Card.Title>
        <Card.Description>{$t("manage.templates.edit_desc")}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Language Selector -->
        <div class="space-y-2">
          <Label>{$t("manage.templates.language_label")}</Label>
          <Select.Root
            type="single"
            value={selectedLocale}
            onValueChange={(value) => {
              if (value) handleLocaleSelect(value);
            }}
          >
            <Select.Trigger class="w-full md:w-[400px]">
              {#if selectedLocale}
                {getLocaleName(selectedLocale)}
              {:else}
                {$t("manage.templates.select_language_placeholder")}
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each availableLocales as locale (locale)}
                <Select.Item value={locale}>
                  {getLocaleName(locale)}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <!-- Template Selector (shown after language selected) -->
        {#if selectedLocale}
          <div class="space-y-2">
            <Label>{$t("manage.templates.select_label")}</Label>
            <Select.Root
              type="single"
              value={selectedTemplateId}
              onValueChange={(value) => {
                if (value) handleTemplateSelect(value);
              }}
            >
              <Select.Trigger class="w-full md:w-[400px]">
                {#if selectedTemplateId}
                  {formatTemplateBase(selectedTemplateId)}
                {:else}
                  {$t("manage.templates.select_placeholder")}
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each filteredTemplates as template (template.template_id)}
                  <Select.Item value={template.template_id}>
                    {formatTemplateBase(template.template_id)}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {/if}

        {#if selectedTemplateId}
          <!-- Subject -->
          <div class="space-y-2">
            <Label for="template-subject">{$t("manage.templates.subject_label")}</Label>
            <Input id="template-subject" bind:value={templateSubject} placeholder="Email subject line" />
            <p class="text-muted-foreground text-xs">
              The subject line for the email. You can use Mustache variables like <code class="bg-muted rounded px-1"
                >{"{{variable}}"}</code
              >
            </p>
          </div>

          <!-- HTML Body -->
          <div class="space-y-2">
            <Label>{$t("manage.templates.html_body_label")}</Label>
            <p class="text-muted-foreground text-xs">
              The HTML content of the email. Use Mustache variables for dynamic content.
            </p>
            <div class="overflow-hidden rounded-md border">
              <CodeMirror
                bind:value={templateHtmlBody}
                lang={html()}
                theme={mode.current === "dark" ? githubDark : githubLight}
                styles={{ "&": { width: "100%", height: "400px" } }}
              />
            </div>
          </div>

          <!-- Text Body -->
          <div class="space-y-2">
            <Label for="template-text-body">{$t("manage.templates.text_body_label")}</Label>
            <p class="text-muted-foreground text-xs">
              Plain text version of the email for clients that don't support HTML
            </p>
            <Textarea
              id="template-text-body"
              bind:value={templateTextBody}
              placeholder="Plain text email content"
              rows={8}
            />
          </div>
        {/if}
      </Card.Content>
      {#if selectedTemplateId}
        <Card.Footer class="flex justify-end border-t pt-6">
          <Button onclick={updateTemplate} disabled={saving}>
            {#if saving}
              <Loader class="size-4 animate-spin" />
            {:else}
              <SaveIcon class="size-4" />
            {/if}
            {$t("manage.templates.update_button")}
          </Button>
        </Card.Footer>
      {/if}
    </Card.Root>
  {/if}
</div>
