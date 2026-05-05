<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import SaveIcon from "@lucide/svelte/icons/save";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import MailIcon from "@lucide/svelte/icons/mail";
  import Loader from "@lucide/svelte/icons/loader";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Send from "@lucide/svelte/icons/send";
  import { toast } from "svelte-sonner";
  import { mode } from "mode-watcher";
  import CodeMirror from "svelte-codemirror-editor";
  import { html } from "@codemirror/lang-html";
  import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";

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
  let selectedTemplateId = $state<string>("");

  // Form state for selected template
  let templateSubject = $state("");
  let templateHtmlBody = $state("");
  let templateTextBody = $state("");

  // Derived: selected template
  let selectedTemplate = $derived(templates.find((t) => t.template_id === selectedTemplateId));

  // SMTP state
  interface SmtpConfig {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_pass: string;
    smtp_sender: string;
    smtp_secure: boolean;
  }
  let smtpSource = $state<"env" | "db" | "none">("none");
  let smtpConfig = $state<SmtpConfig>({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    smtp_sender: "",
    smtp_secure: false,
  });
  let savingSmtp = $state(false);
  let testingSmtp = $state(false);
  let showSmtpPassword = $state(false);

  // Fetch templates on mount
  onMount(() => {
    fetchTemplates();
    fetchSmtpStatus();
  });

  // Handle template selection change
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
        // Auto-select first template if available
        if (templates.length > 0 && !selectedTemplateId) {
          handleTemplateSelect(templates[0].template_id);
        }
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load templates");
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
        toast.success("Template updated successfully");
        // Update local state
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
      toast.error("Failed to update template");
    } finally {
      saving = false;
    }
  }

  function formatTemplateId(id: string): string {
    // Convert snake_case or kebab-case to Title Case
    return id.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  async function fetchSmtpStatus() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getSmtpStatus", data: {} }),
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      smtpSource = result.source;
      if (result.config) {
        smtpConfig = {
          smtp_host: result.config.smtp_host || "",
          smtp_port: result.config.smtp_port || 587,
          smtp_user: result.config.smtp_user || "",
          smtp_pass: "",
          smtp_sender: result.config.smtp_sender || "",
          smtp_secure: !!result.config.smtp_secure,
        };
      }
    } catch (e) {
      console.error("Failed to load SMTP status", e);
    }
  }

  async function saveSmtp() {
    savingSmtp = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saveSmtpConfig",
          data: smtpConfig,
        }),
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        smtpSource = "db";
        smtpConfig.smtp_pass = "";
        toast.success("SMTP configuration saved");
      }
    } catch (e) {
      toast.error("Failed to save SMTP configuration");
    } finally {
      savingSmtp = false;
    }
  }

  async function sendTestEmail() {
    testingSmtp = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "testSmtp", data: {} }),
      });
      const result = await response.json();
      if (result.error) {
        toast.error(`Test failed: ${result.error}`);
      } else {
        toast.success("Test email sent — check your inbox");
      }
    } catch (e) {
      toast.error("Failed to send test email");
    } finally {
      testingSmtp = false;
    }
  }
</script>

<div class="container mx-auto space-y-6 py-6">
  <!-- SMTP Configuration Card -->
  <Card.Root>
    <Card.Header class="border-b">
      <Card.Title class="flex items-center gap-2">
        <MailIcon class="h-5 w-5" />
        SMTP Configuration
        {#if smtpSource === "env"}
          <span class="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-normal">ENV active (read-only)</span>
        {:else if smtpSource === "db"}
          <span class="rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900 dark:text-green-300">DB configured</span>
        {:else}
          <span class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-normal text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">Not configured</span>
        {/if}
      </Card.Title>
      <Card.Description>Configure SMTP to send email notifications. Environment variables take precedence over these settings.</Card.Description>
    </Card.Header>
    <Card.Content class="pt-6">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <Label for="smtp-host">Host</Label>
          <Input
            id="smtp-host"
            bind:value={smtpConfig.smtp_host}
            placeholder="smtp.example.com"
            disabled={smtpSource === "env"}
            class="mt-1"
          />
        </div>
        <div>
          <Label for="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            type="number"
            bind:value={smtpConfig.smtp_port}
            placeholder="587"
            disabled={smtpSource === "env"}
            class="mt-1"
          />
        </div>
        <div>
          <Label for="smtp-user">User</Label>
          <Input
            id="smtp-user"
            bind:value={smtpConfig.smtp_user}
            placeholder="user@example.com"
            autocomplete="username"
            disabled={smtpSource === "env"}
            class="mt-1"
          />
        </div>
        <div>
          <Label for="smtp-pass">Password</Label>
          <div class="relative mt-1">
            <Input
              id="smtp-pass"
              type={showSmtpPassword ? "text" : "password"}
              bind:value={smtpConfig.smtp_pass}
              placeholder={smtpSource === "env" ? "••••••••" : smtpSource === "db" ? "leave blank to keep existing" : ""}
              autocomplete="current-password"
              disabled={smtpSource === "env"}
              class="pr-10"
            />
            {#if smtpSource !== "env"}
              <button
                type="button"
                onclick={() => (showSmtpPassword = !showSmtpPassword)}
                class="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
                tabindex="-1"
                aria-label={showSmtpPassword ? "Hide password" : "Show password"}
              >
                {#if showSmtpPassword}
                  <EyeOff class="h-4 w-4" />
                {:else}
                  <Eye class="h-4 w-4" />
                {/if}
              </button>
            {/if}
          </div>
        </div>
        <div>
          <Label for="smtp-sender">Sender Email</Label>
          <Input
            id="smtp-sender"
            type="email"
            bind:value={smtpConfig.smtp_sender}
            placeholder="noreply@example.com"
            disabled={smtpSource === "env"}
            class="mt-1"
          />
        </div>
        <div class="flex items-center gap-2 pt-6">
          <input
            id="smtp-secure"
            type="checkbox"
            bind:checked={smtpConfig.smtp_secure}
            disabled={smtpSource === "env"}
            class="h-4 w-4"
          />
          <Label for="smtp-secure">TLS (port 465)</Label>
        </div>
      </div>
      <div class="mt-4 flex items-center gap-2">
        <Button
          onclick={saveSmtp}
          disabled={savingSmtp || smtpSource === "env"}
          size="sm"
        >
          {#if savingSmtp}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
          {/if}
          Save
        </Button>
        <Button
          onclick={sendTestEmail}
          disabled={testingSmtp || smtpSource === "none"}
          variant="outline"
          size="sm"
        >
          {#if testingSmtp}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
          {:else}
            <Send class="mr-2 h-4 w-4" />
          {/if}
          Send test email
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else if templates.length === 0}
    <Card.Root>
      <Card.Content class="flex flex-col items-center justify-center py-12">
        <MailIcon class="text-muted-foreground mb-4 size-12" />
        <h3 class="mb-2 text-lg font-semibold">No Templates Found</h3>
        <p class="text-muted-foreground text-center">There are no email templates configured yet.</p>
      </Card.Content>
    </Card.Root>
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2">
          <FileTextIcon class="size-5" />
          Edit Template
        </Card.Title>
        <Card.Description>Select a template from the dropdown to view and edit its content</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Template Selector -->
        <div class="space-y-2">
          <Label for="template-select">Select Template</Label>
          <Select.Root
            type="single"
            value={selectedTemplateId}
            onValueChange={(value) => {
              if (value) handleTemplateSelect(value);
            }}
          >
            <Select.Trigger class="w-full md:w-[400px]">
              {#if selectedTemplateId}
                {formatTemplateId(selectedTemplateId)}
              {:else}
                Select a template...
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each templates as template (template.template_id)}
                <Select.Item value={template.template_id}>
                  {formatTemplateId(template.template_id)}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        {#if selectedTemplateId}
          <!-- Subject -->
          <div class="space-y-2">
            <Label for="template-subject">Subject</Label>
            <Input id="template-subject" bind:value={templateSubject} placeholder="Email subject line" />
            <p class="text-muted-foreground text-xs">
              The subject line for the email. You can use Mustache variables like <code class="bg-muted rounded px-1"
                >{"{{variable}}"}</code
              >
            </p>
          </div>

          <!-- HTML Body -->
          <div class="space-y-2">
            <Label>HTML Body</Label>
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
            <Label for="template-text-body">Text Body</Label>
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
        <Card.Footer class="flex justify-end">
          <Button onclick={updateTemplate} disabled={saving}>
            {#if saving}
              <Loader class="size-4 animate-spin" />
            {:else}
              <SaveIcon class="size-4" />
            {/if}
            Update Template
          </Button>
        </Card.Footer>
      {/if}
    </Card.Root>
  {/if}
</div>
