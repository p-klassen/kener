<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import MailIcon from "@lucide/svelte/icons/mail";
  import SendIcon from "@lucide/svelte/icons/send";
  import Loader from "@lucide/svelte/icons/loader";
  import SaveIcon from "@lucide/svelte/icons/save";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";

  const apiUrl = clientResolver(resolve, "/manage/api");

  async function apiCall(action: string, data: object = {}) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  // ── SMTP ──────────────────────────────────────────────────────────────────

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

  async function fetchSmtpStatus() {
    try {
      const result = await apiCall("getSmtpStatus");
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
    } catch {
      toast.error($t("manage.email_settings.smtp_load_error"));
    }
  }

  async function saveSmtp() {
    savingSmtp = true;
    try {
      await apiCall("saveSmtpConfig", smtpConfig);
      smtpSource = "db";
      smtpConfig.smtp_pass = "";
      toast.success($t("manage.email_settings.smtp_saved"));
    } catch (e: any) {
      toast.error(e.message || $t("manage.email_settings.smtp_save_error"));
    } finally {
      savingSmtp = false;
    }
  }

  async function testSmtp() {
    testingSmtp = true;
    try {
      await apiCall("testSmtp");
      toast.success($t("manage.email_settings.test_success"));
    } catch {
      toast.error($t("manage.email_settings.test_error"));
    } finally {
      testingSmtp = false;
    }
  }

  // ── Resend ────────────────────────────────────────────────────────────────

  interface ResendConfig {
    resend_api_key: string;
    resend_sender_email: string;
  }

  let resendSource = $state<"env" | "db" | "none">("none");
  let resendConfig = $state<ResendConfig>({ resend_api_key: "", resend_sender_email: "" });
  let savingResend = $state(false);
  let testingResend = $state(false);
  let showResendKey = $state(false);

  async function fetchResendStatus() {
    try {
      const result = await apiCall("getResendStatus");
      resendSource = result.source;
      if (result.config) {
        resendConfig.resend_sender_email = result.config.resend_sender_email || "";
        resendConfig.resend_api_key = "";
      }
    } catch {
      toast.error($t("manage.email_settings.resend_load_error"));
    }
  }

  async function saveResend() {
    savingResend = true;
    try {
      await apiCall("saveResendConfig", resendConfig);
      resendSource = "db";
      resendConfig.resend_api_key = "";
      toast.success($t("manage.email_settings.resend_saved"));
    } catch (e: any) {
      toast.error(e.message || $t("manage.email_settings.resend_save_error"));
    } finally {
      savingResend = false;
    }
  }

  async function testResend() {
    testingResend = true;
    try {
      await apiCall("testResend");
      toast.success($t("manage.email_settings.test_success"));
    } catch {
      toast.error($t("manage.email_settings.test_error"));
    } finally {
      testingResend = false;
    }
  }

  onMount(() => {
    fetchSmtpStatus();
    fetchResendStatus();
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">

  <!-- SMTP Card -->
  <Card.Root>
    <Card.Header class="border-b">
      <Card.Title class="flex items-center gap-2">
        <MailIcon class="h-5 w-5" />
        {$t("manage.email_settings.smtp_title")}
        {#if smtpSource === "env"}
          <span class="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-normal">{$t("manage.email_settings.badge_env")}</span>
        {:else if smtpSource === "db"}
          <span class="rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900 dark:text-green-300">{$t("manage.email_settings.badge_db")}</span>
        {:else}
          <span class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-normal text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{$t("manage.email_settings.badge_not_configured")}</span>
        {/if}
      </Card.Title>
      <Card.Description>{$t("manage.email_settings.smtp_desc")}</Card.Description>
    </Card.Header>
    <Card.Content class="pt-6">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <Label for="smtp-host">{$t("manage.email_settings.smtp_host_label")}</Label>
          <Input id="smtp-host" bind:value={smtpConfig.smtp_host} placeholder="smtp.example.com" disabled={smtpSource === "env"} class="mt-1" />
        </div>
        <div>
          <Label for="smtp-port">{$t("manage.email_settings.smtp_port_label")}</Label>
          <Input id="smtp-port" type="number" bind:value={smtpConfig.smtp_port} placeholder="587" disabled={smtpSource === "env"} class="mt-1" />
        </div>
        <div>
          <Label for="smtp-user">{$t("manage.email_settings.smtp_user_label")}</Label>
          <Input id="smtp-user" bind:value={smtpConfig.smtp_user} placeholder="user@example.com" autocomplete="username" disabled={smtpSource === "env"} class="mt-1" />
        </div>
        <div>
          <Label for="smtp-pass">{$t("manage.email_settings.smtp_password_label")}</Label>
          <div class="relative mt-1">
            <Input
              id="smtp-pass"
              type={showSmtpPassword ? "text" : "password"}
              bind:value={smtpConfig.smtp_pass}
              placeholder={smtpSource === "env" ? "••••••••" : smtpSource === "db" ? $t("manage.email_settings.password_keep_hint") : ""}
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
                {#if showSmtpPassword}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
              </button>
            {/if}
          </div>
        </div>
        <div>
          <Label for="smtp-sender">{$t("manage.email_settings.smtp_sender_label")}</Label>
          <Input id="smtp-sender" type="email" bind:value={smtpConfig.smtp_sender} placeholder="noreply@example.com" disabled={smtpSource === "env"} class="mt-1" />
        </div>
        <div class="flex items-center gap-2 pt-6">
          <input id="smtp-secure" type="checkbox" bind:checked={smtpConfig.smtp_secure} disabled={smtpSource === "env"} class="h-4 w-4" />
          <Label for="smtp-secure">{$t("manage.email_settings.smtp_tls_label")}</Label>
        </div>
      </div>
      <div class="mt-4 flex items-center gap-2">
        <Button onclick={saveSmtp} disabled={savingSmtp || smtpSource === "env"} size="sm">
          {#if savingSmtp}<Loader class="mr-2 h-4 w-4 animate-spin" />{:else}<SaveIcon class="mr-2 h-4 w-4" />{/if}
          {$t("manage.email_settings.save_button")}
        </Button>
        <Button onclick={testSmtp} disabled={testingSmtp || smtpSource === "none"} variant="outline" size="sm">
          {#if testingSmtp}<Loader class="mr-2 h-4 w-4 animate-spin" />{:else}<SendIcon class="mr-2 h-4 w-4" />{/if}
          {$t("manage.email_settings.test_button")}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Resend Card -->
  <Card.Root>
    <Card.Header class="border-b">
      <Card.Title class="flex items-center gap-2">
        <SendIcon class="h-5 w-5" />
        {$t("manage.email_settings.resend_title")}
        {#if resendSource === "env"}
          <span class="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-normal">{$t("manage.email_settings.badge_env")}</span>
        {:else if resendSource === "db"}
          <span class="rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700 dark:bg-green-900 dark:text-green-300">{$t("manage.email_settings.badge_db")}</span>
        {:else}
          <span class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-normal text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{$t("manage.email_settings.badge_not_configured")}</span>
        {/if}
      </Card.Title>
      <Card.Description>{$t("manage.email_settings.resend_desc")}</Card.Description>
    </Card.Header>
    <Card.Content class="pt-6">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <Label for="resend-key">{$t("manage.email_settings.resend_api_key_label")}</Label>
          <div class="relative mt-1">
            <Input
              id="resend-key"
              type={showResendKey ? "text" : "password"}
              bind:value={resendConfig.resend_api_key}
              placeholder={resendSource === "env" ? "••••••••" : resendSource === "db" ? $t("manage.email_settings.password_keep_hint") : "re_..."}
              disabled={resendSource === "env"}
              class="pr-10"
            />
            {#if resendSource !== "env"}
              <button
                type="button"
                onclick={() => (showResendKey = !showResendKey)}
                class="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
                tabindex="-1"
                aria-label={showResendKey ? "Hide key" : "Show key"}
              >
                {#if showResendKey}<EyeOff class="h-4 w-4" />{:else}<Eye class="h-4 w-4" />{/if}
              </button>
            {/if}
          </div>
        </div>
        <div>
          <Label for="resend-sender">{$t("manage.email_settings.resend_sender_label")}</Label>
          <Input
            id="resend-sender"
            type="email"
            bind:value={resendConfig.resend_sender_email}
            placeholder="Kener Alerts <noreply@example.com>"
            disabled={resendSource === "env"}
            class="mt-1"
          />
        </div>
      </div>
      <div class="mt-4 flex items-center gap-2">
        <Button onclick={saveResend} disabled={savingResend || resendSource === "env"} size="sm">
          {#if savingResend}<Loader class="mr-2 h-4 w-4 animate-spin" />{:else}<SaveIcon class="mr-2 h-4 w-4" />{/if}
          {$t("manage.email_settings.save_button")}
        </Button>
        <Button onclick={testResend} disabled={testingResend || resendSource === "none"} variant="outline" size="sm">
          {#if testingResend}<Loader class="mr-2 h-4 w-4 animate-spin" />{:else}<SendIcon class="mr-2 h-4 w-4" />{/if}
          {$t("manage.email_settings.test_button")}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

</div>
