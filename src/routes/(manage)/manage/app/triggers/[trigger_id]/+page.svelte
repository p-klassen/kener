<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as Alert from "$lib/components/ui/alert/index.js";

  import { Button } from "$lib/components/ui/button/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import SaveIcon from "@lucide/svelte/icons/save";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import XIcon from "@lucide/svelte/icons/x";
  import AlertCircleIcon from "@lucide/svelte/icons/octagon-alert";
  import Loader from "@lucide/svelte/icons/loader";
  import CheckIcon from "@lucide/svelte/icons/check";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { mode } from "mode-watcher";
  import { IsValidURL } from "$lib/clientTools";
  import CodeMirror from "svelte-codemirror-editor";
  import { html } from "@codemirror/lang-html";
  import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
  import type { TriggerMeta } from "$lib/server/types/db";
  import { t } from "$lib/stores/i18n";


  let { data } = page;
  // Types

  // State
  let loading = $state(true);
  let saving = $state(false);
  let testing = $state<"idle" | "loading" | "success" | "error">("idle");
  let invalidFormMessage = $state("");
  let deleteDialogOpen = $state(false);
  let deleteConfirmName = $state("");
  let isDeleting = $state(false);

  // Get trigger ID from URL params
  const triggerId = $derived(data.trigger_id);
  const isNew = $derived(triggerId === "new");

  // Form state
  let trigger = $state<{
    id: number;
    name: string;
    trigger_type: string;
    trigger_desc: string;
    trigger_status: string;
    trigger_meta: TriggerMeta;
  }>({
    id: 0,
    name: "",
    trigger_type: "webhook",
    trigger_desc: "",
    trigger_status: "ACTIVE",
    trigger_meta: {
      url: "",
      headers: [],
      to: "",
      from: "",
      webhook_body: data.webhook_template.webhook_body,
      discord_body: data.discord_template.discord_body,
      slack_body: data.slack_template.slack_body,
      email_body: data.email_template.email_body,
      email_subject: data.email_template.email_subject
    }
  });

  async function fetchTrigger() {
    if (isNew) {
      loading = false;
      return;
    }

    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "getTriggers",
          data: {}
        })
      });
      const result = await response.json();
      const foundTrigger = result.find((t: { id: number }) => t.id === parseInt(triggerId || "0"));
      if (foundTrigger) {
        const meta = JSON.parse(foundTrigger.trigger_meta) as TriggerMeta;
        trigger = {
          id: foundTrigger.id,
          name: foundTrigger.name,
          trigger_type: foundTrigger.trigger_type,
          trigger_desc: foundTrigger.trigger_desc || "",
          trigger_status: foundTrigger.trigger_status || "ACTIVE",
          trigger_meta: {
            url: meta.url || "",
            headers: meta.headers || [],
            to: meta.to || "",
            from: meta.from || "",
            webhook_body: meta.webhook_body || data.webhook_template.webhook_body,
            discord_body: meta.discord_body || data.discord_template.discord_body,
            slack_body: meta.slack_body || data.slack_template.slack_body,
            email_body: meta.email_body || data.email_template.email_body,
            email_subject: meta.email_subject || data.email_template.email_subject
          }
        };
      } else {
        toast.error($t("manage.trigger_detail.not_found"));
        goto(clientResolver(resolve, "/manage/app/triggers"));
      }
    } catch (error) {
      console.error("Error fetching trigger:", error);
      toast.error($t("manage.trigger_detail.load_error"));
    } finally {
      loading = false;
    }
  }

  // Validation
  function validateNameEmailPattern(input: string): { isValid: boolean; name: string | null; email: string | null } {
    const pattern = /^([\w\s]+)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/;
    const match = input.match(pattern);
    if (match) {
      return { isValid: true, name: match[1].trim(), email: match[2] };
    }
    return { isValid: false, name: null, email: null };
  }

  async function saveTrigger() {
    invalidFormMessage = "";

    // Validation
    if (!trigger.name.trim()) {
      invalidFormMessage = $t("manage.trigger_detail.error_name");
      return;
    }

    if (!trigger.trigger_type) {
      invalidFormMessage = $t("manage.trigger_detail.error_type");
      return;
    }

    if (trigger.trigger_type === "email") {
      if (!trigger.trigger_meta.to.trim()) {
        invalidFormMessage = $t("manage.trigger_detail.error_email");
        return;
      }
      if (!validateNameEmailPattern(trigger.trigger_meta.from).isValid) {
        invalidFormMessage = $t("manage.trigger_detail.error_sender");
        return;
      }
    } else {
      // URL validation for non-email triggers
      if (!trigger.trigger_meta.url.trim()) {
        invalidFormMessage = $t("manage.trigger_detail.error_url");
        return;
      }
      if (!IsValidURL(trigger.trigger_meta.url)) {
        invalidFormMessage = $t("manage.trigger_detail.error_invalid_url");
        return;
      }
    }

    saving = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createUpdateTrigger",
          data: {
            id: trigger.id || undefined,
            name: trigger.name,
            trigger_type: trigger.trigger_type,
            trigger_status: trigger.trigger_status,
            trigger_desc: trigger.trigger_desc,
            trigger_meta: JSON.stringify(trigger.trigger_meta)
          }
        })
      });
      const result = await response.json();
      if (result.error) {
        invalidFormMessage = result.error;
      } else {
        toast.success(trigger.id ? $t("manage.trigger_detail.updated_toast") : $t("manage.trigger_detail.created_toast"));
        if (isNew) {
          goto(clientResolver(resolve, "/manage/app/triggers"));
        }
      }
    } catch (error) {
      invalidFormMessage = "Failed to save trigger";
    } finally {
      saving = false;
    }
  }

  async function testTrigger() {
    if (!trigger.id) {
      toast.error($t("manage.trigger_detail.test_save_first"));
      return;
    }

    testing = "loading";
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "testTrigger",
          data: { trigger_id: trigger.id, status: "TRIGGERED" }
        })
      });
      const result = await response.json();
      if (result.error) {
        testing = "error";
        toast.error(result.error);
      } else {
        testing = "success";
        toast.success($t("manage.trigger_detail.test_success"));
      }
    } catch (error) {
      testing = "error";
      toast.error($t("manage.trigger_detail.test_error"));
    } finally {
      setTimeout(() => {
        testing = "idle";
      }, 3000);
    }
  }

  function addHeader() {
    trigger.trigger_meta.headers = [...trigger.trigger_meta.headers, { key: "", value: "" }];
  }

  function removeHeader(index: number) {
    trigger.trigger_meta.headers = trigger.trigger_meta.headers.filter((_, i) => i !== index);
  }

  async function deleteTrigger() {
    if (!trigger.id || deleteConfirmName !== trigger.name) return;

    isDeleting = true;
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteTrigger",
          data: { trigger_id: trigger.id }
        })
      });
      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Trigger deleted successfully");
        goto(clientResolver(resolve, "/manage/app/triggers"));
      }
    } catch (error) {
      toast.error("Failed to delete trigger");
    } finally {
      isDeleting = false;
      deleteDialogOpen = false;
      deleteConfirmName = "";
    }
  }

  onMount(() => {
    fetchTrigger();
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">
  <!-- Breadcrumb -->
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href={clientResolver(resolve, "/manage/app/triggers")}>{$t("manage.trigger_detail.breadcrumb")}</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>{isNew ? $t("manage.trigger_detail.new_title") : trigger.name || $t("manage.trigger_detail.edit_title")}</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else}
    <Card.Root>
      <Card.Header>
        <Card.Title>{isNew ? $t("manage.trigger_detail.new_title") : $t("manage.trigger_detail.edit_title")}</Card.Title>
        <Card.Description>{$t("manage.trigger_detail.card_desc")}</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-6">
        <!-- Error Message -->
        {#if invalidFormMessage}
          <div class="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">{invalidFormMessage}</div>
        {/if}

        <!-- Trigger Type Selection -->
        <div class="space-y-3">
          <Label>{$t("manage.trigger_detail.type_label")}</Label>
          <p class="text-muted-foreground text-sm">{$t("manage.trigger_detail.type_helper")}</p>
          <Select.Root
            type="single"
            value={trigger.trigger_type}
            onValueChange={(value) => {
              if (value) trigger.trigger_type = value;
            }}
          >
            <Select.Trigger class="w-full max-w-sm capitalize">{trigger.trigger_type}</Select.Trigger>
            <Select.Content>
              <Select.Item value="webhook">Webhook</Select.Item>
              <Select.Item value="discord">Discord</Select.Item>
              <Select.Item value="slack">Slack</Select.Item>
              <Select.Item value="email">Email</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        <!-- Status Toggle -->
        <div class="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label>{$t("manage.trigger_detail.status_label")}</Label>
            <p class="text-muted-foreground text-sm">{$t("manage.trigger_detail.status_helper")}</p>
          </div>
          <Switch
            checked={trigger.trigger_status === "ACTIVE"}
            onCheckedChange={(checked) => (trigger.trigger_status = checked ? "ACTIVE" : "INACTIVE")}
          />
        </div>

        <!-- Name -->
        <div class="space-y-2">
          <Label for="trigger-name">
            {$t("manage.trigger_detail.name_label")} <span class="text-destructive">*</span>
          </Label>
          <Input id="trigger-name" bind:value={trigger.name} placeholder={$t("manage.trigger_detail.name_placeholder")} />
        </div>

        <!-- Description -->
        <div class="space-y-2">
          <Label for="trigger-desc">{$t("manage.trigger_detail.desc_label")}</Label>
          <Input id="trigger-desc" bind:value={trigger.trigger_desc} placeholder={$t("manage.trigger_detail.desc_placeholder")} />
        </div>

        <!-- URL (for non-email) -->
        {#if trigger.trigger_type !== "email"}
          <div class="space-y-2">
            <Label for="trigger-url">
              URL <span class="text-destructive">*</span>
            </Label>
            <Input id="trigger-url" bind:value={trigger.trigger_meta.url} placeholder={$t("manage.trigger_detail.url_placeholder")} />
            <p class="text-muted-foreground text-xs">{$t("manage.trigger_detail.url_helper")}</p>
          </div>
        {/if}

        <!-- Webhook Specific -->
        {#if trigger.trigger_type === "webhook"}
          <!-- Headers -->
          <div class="space-y-3">
            <Label>{$t("manage.trigger_detail.headers_label")}</Label>
            <div class="space-y-2">
              {#each trigger.trigger_meta.headers as header, index}
                <div class="flex gap-2">
                  <Input bind:value={header.key} placeholder={$t("manage.trigger_detail.header_key_placeholder")} class="flex-1" />
                  <Input bind:value={header.value} placeholder={$t("manage.trigger_detail.header_value_placeholder")} class="flex-1" />
                  <Button variant="ghost" size="icon" onclick={() => removeHeader(index)}>
                    <XIcon class="size-4" />
                  </Button>
                </div>
              {/each}
            </div>
            <Button variant="outline" size="sm" onclick={addHeader}>
              <PlusIcon class="size-4" />
              {$t("manage.trigger_detail.add_header")}
            </Button>
          </div>

          <!-- Custom Body -->
          <div class="space-y-3">
            <div>
              <Label>{$t("manage.trigger_detail.webhook_body_label")}</Label>
              <p class="text-muted-foreground text-sm">{$t("manage.trigger_detail.webhook_body_helper")}</p>
            </div>
            <p class="text-muted-foreground text-xs">
              Use Mustache variables like <code class="bg-muted rounded px-1">{"{{variable}}"}</code>. Available:
              alert_id, alert_name, alert_for, alert_value, alert_status, alert_severity, alert_message, alert_source,
              alert_timestamp, alert_cta_url, alert_cta_text, alert_incident_id, alert_incident_url,
              alert_failure_threshold, alert_success_threshold, is_resolved, is_triggered, site_url, site_name,
              site_logo_url, colors_up, colors_down, colors_degraded, colors_maintenance
            </p>
            <div class="overflow-hidden rounded-md border">
              <Textarea bind:value={trigger.trigger_meta.webhook_body} />
            </div>
          </div>
        {/if}

        <!-- Discord Specific -->
        {#if trigger.trigger_type === "discord"}
          <div class="space-y-3">
            <div>
              <Label>{$t("manage.trigger_detail.discord_payload_label")}</Label>
              <p class="text-muted-foreground text-sm">{$t("manage.trigger_detail.discord_payload_helper")}</p>
            </div>
            <p class="text-muted-foreground text-xs">
              Use Mustache variables. Available: alert_id, alert_name, alert_for, alert_value, alert_status,
              alert_severity, alert_message, alert_source, alert_timestamp, alert_cta_url, alert_cta_text,
              alert_incident_id, alert_incident_url, alert_failure_threshold, alert_success_threshold, is_resolved,
              is_triggered, site_url, site_name, site_logo_url, colors_up, colors_down, colors_degraded,
              colors_maintenance
            </p>
            <div class="overflow-hidden rounded-md border">
              <Textarea bind:value={trigger.trigger_meta.discord_body} />
            </div>
          </div>
        {/if}

        <!-- Slack Specific -->
        {#if trigger.trigger_type === "slack"}
          <div class="space-y-3">
            <div>
              <Label>{$t("manage.trigger_detail.slack_payload_label")}</Label>
              <p class="text-muted-foreground text-sm">{$t("manage.trigger_detail.slack_payload_helper")}</p>
            </div>
            <p class="text-muted-foreground text-xs">
              Use Mustache variables. Available: alert_id, alert_name, alert_for, alert_value, alert_status,
              alert_severity, alert_message, alert_source, alert_timestamp, alert_cta_url, alert_cta_text,
              alert_incident_id, alert_incident_url, alert_failure_threshold, alert_success_threshold, is_resolved,
              is_triggered, site_url, site_name, site_logo_url, colors_up, colors_down, colors_degraded,
              colors_maintenance
            </p>
            <div class="overflow-hidden rounded-md border">
              <Textarea bind:value={trigger.trigger_meta.slack_body} />
            </div>
          </div>
        {/if}

        <!-- Email Specific -->
        {#if trigger.trigger_type === "email"}
          <!-- Email Recipients -->
          {#if page.data.canSendEmail === false}
            <Alert.Root variant="destructive">
              <AlertCircleIcon />
              <Alert.Title>{$t("manage.trigger_detail.email_not_setup_title")}</Alert.Title>
              <Alert.Description>
                <p>
                  Please visit the email set up documentation <a
                    class="underline"
                    href={clientResolver(resolve, "https://kener.ing/docs/v4/setup/email-setup")}>here</a
                  >.
                </p>
              </Alert.Description>
            </Alert.Root>
          {/if}
          <div class="space-y-2">
            <Label for="email-to">
              {$t("manage.trigger_detail.email_to_label")} <span class="text-destructive">*</span>
            </Label>
            <Input
              id="email-to"
              bind:value={trigger.trigger_meta.to}
              placeholder={$t("manage.trigger_detail.email_to_placeholder")}
            />
          </div>
          <div class="space-y-2">
            <Label for="email-from">
              {$t("manage.trigger_detail.email_from_label")} <span class="text-destructive">*</span>
            </Label>
            <Input id="email-from" bind:value={trigger.trigger_meta.from} placeholder={$t("manage.trigger_detail.email_from_placeholder")} />
            <p class="text-muted-foreground text-xs">{$t("manage.trigger_detail.email_from_helper")}</p>
          </div>

          <!-- Custom Email Template -->
          <div class="space-y-3">
            <div>
              <Label>{$t("manage.trigger_detail.email_template_label")}</Label>
              <p class="text-muted-foreground text-sm">{$t("manage.trigger_detail.email_template_helper")}</p>
            </div>
            <p class="text-muted-foreground text-xs">
              Use Mustache variables. Available: alert_id, alert_name, alert_for, alert_value, alert_status,
              alert_severity, alert_message, alert_source, alert_timestamp, alert_cta_url, alert_cta_text,
              alert_incident_id, alert_incident_url, alert_failure_threshold, alert_success_threshold, is_resolved,
              is_triggered, site_url, site_name, site_logo_url, colors_up, colors_down, colors_degraded,
              colors_maintenance
            </p>
            <div class="overflow-hidden rounded-md border">
              <CodeMirror
                bind:value={trigger.trigger_meta.email_body}
                lang={html()}
                theme={mode.current === "dark" ? githubDark : githubLight}
                styles={{ "&": { width: "100%", height: "400px" } }}
              />
            </div>
          </div>
        {/if}
      </Card.Content>
      <Card.Footer class="flex justify-end gap-2">
        {#if !isNew}
          <Button variant="outline" onclick={testTrigger} disabled={testing === "loading"}>
            {#if testing === "loading"}
              <Loader class="size-4 animate-spin" />
            {:else if testing === "success"}
              <CheckIcon class="size-4 text-green-500" />
            {:else if testing === "error"}
              <XIcon class="size-4 text-red-500" />
            {/if}
            {$t("manage.trigger_detail.test_button")}
          </Button>
        {/if}
        <Button onclick={saveTrigger} disabled={saving}>
          {#if saving}
            <Loader class="size-4 animate-spin" />
          {:else}
            <SaveIcon class="size-4" />
          {/if}
          {isNew ? $t("manage.trigger_detail.create_button") : $t("manage.trigger_detail.save_button")}
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- Delete Trigger Card -->
    {#if !isNew}
      <Card.Root class="border-destructive">
        <Card.Header>
          <Card.Title class="text-destructive">{$t("manage.trigger_detail.danger_title")}</Card.Title>
          <Card.Description>{$t("manage.trigger_detail.danger_desc")}</Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-muted-foreground text-sm">
            {$t("manage.trigger_detail.danger_warning")}
          </p>
        </Card.Content>
        <Card.Footer class="flex justify-end">
          <Button variant="destructive" onclick={() => (deleteDialogOpen = true)}>
            <Trash2Icon class="size-4" />
            {$t("manage.trigger_detail.delete_button")}
          </Button>
        </Card.Footer>
      </Card.Root>
    {/if}
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{$t("manage.trigger_detail.delete_dialog_title")}</AlertDialog.Title>
      <AlertDialog.Description>
        {$t("manage.trigger_detail.delete_dialog_desc")}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <div class="space-y-4 py-4">
      <p class="text-sm">
        To confirm, type <span class="bg-muted rounded px-1.5 py-0.5 font-mono text-sm">{trigger.name}</span> below:
      </p>
      <Input bind:value={deleteConfirmName} placeholder="Type trigger name to confirm" />
    </div>
    <AlertDialog.Footer>
      <AlertDialog.Cancel
        disabled={isDeleting}
        onclick={() => {
          deleteConfirmName = "";
        }}>Cancel</AlertDialog.Cancel
      >
      <Button variant="destructive" onclick={deleteTrigger} disabled={isDeleting || deleteConfirmName !== trigger.name}>
        {#if isDeleting}
          <Loader class="size-4 animate-spin" />
        {:else}
          <Trash2Icon class="size-4" />
        {/if}
        {$t("manage.trigger_detail.delete_button")}
      </Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
