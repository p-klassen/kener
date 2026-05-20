<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import MailIcon from "@lucide/svelte/icons/mail";
  import LockIcon from "@lucide/svelte/icons/lock";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import CheckIcon from "@lucide/svelte/icons/check";
  import EyeClosedIcon from "@lucide/svelte/icons/eye-closed";
  import EyeOpenIcon from "@lucide/svelte/icons/eye";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();

  const view: string = $derived(data.view);
  const token: string = $derived(data.token);

  let loading = $state(false);
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);
  let emailSent = $state(false);
  let passwordReset = $state(false);

  let email = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  let hasDigit = $derived(/\d/.test(newPassword));
  let hasLowercase = $derived(/[a-z]/.test(newPassword));
  let hasUppercase = $derived(/[A-Z]/.test(newPassword));
  let hasMinLength = $derived(newPassword.length >= 8);
  let passwordsMatch = $derived(newPassword === confirmPassword && newPassword !== "");
  let isPasswordValid = $derived(hasDigit && hasLowercase && hasUppercase && hasMinLength && passwordsMatch);

  async function handleRequestReset() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error($t("account.forgot.err_email_required"));
      return;
    }

    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/account/forgot/api/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const responseData = await response.json();

      if (!response.ok) {
        toast.error(responseData.errorKey ? $t(responseData.errorKey) : $t("account.forgot.err_send_failed"));
        return;
      }

      emailSent = true;
      toast.success($t("account.forgot.success_email_sent"));
    } catch (e) {
      toast.error($t("account.forgot.err_occurred"));
    } finally {
      loading = false;
    }
  }

  async function handlePasswordReset() {
    if (!isPasswordValid) return;
    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/account/forgot/api/password-reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivedToken: token, newPassword })
      });

      const responseData = await response.json();

      if (!response.ok) {
        toast.error(responseData.errorKey ? $t(responseData.errorKey) : $t("account.forgot.err_reset_failed"));
        return;
      }

      passwordReset = true;
      toast.success($t("account.forgot.success_reset"));
    } catch (e) {
      toast.error($t("account.forgot.err_occurred"));
    } finally {
      loading = false;
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (view === "confirm_token") {
      handlePasswordReset();
    } else {
      handleRequestReset();
    }
  }
</script>

<svelte:head>
  <title>{view === "confirm_token" ? $t("account.forgot.title_reset") : $t("account.forgot.title_forgot")}</title>
</svelte:head>
<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    {#if view === "confirm_token"}
      <!-- Reset Password View -->
      {#if passwordReset}
        <Card.Header class="text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircleIcon class="h-8 w-8 text-green-600" />
          </div>
          <Card.Title>{$t("account.forgot.reset_complete_title")}</Card.Title>
          <Card.Description>
            {$t("account.forgot.reset_complete_desc")}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Button href={clientResolver(resolve, "/account/signin")} class="w-full">
            <ArrowLeftIcon class="mr-2 h-4 w-4" />
            {$t("account.forgot.btn_back_to_signin")}
          </Button>
        </Card.Content>
      {:else}
        <Card.Header>
          <Card.Title>{$t("account.forgot.title_set_new")}</Card.Title>
          <Card.Description>{$t("account.forgot.set_new_desc")}</Card.Description>
        </Card.Header>
        <Card.Content>
          <form onsubmit={handleSubmit}>
            <Field.Group>
              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="newPassword">{$t("account.forgot.new_password_label")}</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon>
                    <LockIcon aria-hidden="true" />
                  </InputGroup.Addon>
                  <InputGroup.Input
                    id="newPassword"
                    name="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autocomplete="new-password"
                    bind:value={newPassword}
                    required
                  />
                  <InputGroup.Addon align="inline-end">
                    <InputGroup.Button
                      type="button"
                      aria-label={showPassword ? $t("account.forgot.hide_password") : $t("account.forgot.show_password")}
                      title={showPassword ? $t("account.forgot.hide_password") : $t("account.forgot.show_password")}
                      size="icon-xs"
                      onclick={() => (showPassword = !showPassword)}
                    >
                      {#if showPassword}
                        <EyeClosedIcon class="size-4" />
                      {:else}
                        <EyeOpenIcon class="size-4" />
                      {/if}
                    </InputGroup.Button>
                  </InputGroup.Addon>
                </InputGroup.Root>
                <Field.Description>{$t("account.forgot.password_hint")}</Field.Description>
                <div class="text-muted-foreground text-xs">
                  <ul class="mt-1 grid grid-cols-2 gap-1">
                    <li class:text-green-500={hasDigit}>
                      {#if hasDigit}<CheckIcon class="inline size-3" />{/if} {$t("manage.user_menu.password_req_digit")}
                    </li>
                    <li class:text-green-500={hasLowercase}>
                      {#if hasLowercase}<CheckIcon class="inline size-3" />{/if} {$t("manage.user_menu.password_req_lowercase")}
                    </li>
                    <li class:text-green-500={hasUppercase}>
                      {#if hasUppercase}<CheckIcon class="inline size-3" />{/if} {$t("manage.user_menu.password_req_uppercase")}
                    </li>
                    <li class:text-green-500={hasMinLength}>
                      {#if hasMinLength}<CheckIcon class="inline size-3" />{/if} {$t("manage.user_menu.password_req_min")}
                    </li>
                  </ul>
                </div>
              </Field.Field>

              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="confirmPassword">{$t("account.forgot.confirm_password_label")}</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon>
                    <LockIcon aria-hidden="true" />
                  </InputGroup.Addon>
                  <InputGroup.Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autocomplete="new-password"
                    bind:value={confirmPassword}
                    required
                  />
                  <InputGroup.Addon align="inline-end">
                    <InputGroup.Button
                      type="button"
                      aria-label={showConfirmPassword ? $t("account.forgot.hide_password") : $t("account.forgot.show_password")}
                      title={showConfirmPassword ? $t("account.forgot.hide_password") : $t("account.forgot.show_password")}
                      size="icon-xs"
                      onclick={() => (showConfirmPassword = !showConfirmPassword)}
                    >
                      {#if showConfirmPassword}
                        <EyeClosedIcon class="size-4" />
                      {:else}
                        <EyeOpenIcon class="size-4" />
                      {/if}
                    </InputGroup.Button>
                  </InputGroup.Addon>
                </InputGroup.Root>
              </Field.Field>
            </Field.Group>

            <div class="mt-6">
              <Button type="submit" class="w-full" disabled={loading || !isPasswordValid}>
                {#if loading}
                  {$t("account.forgot.btn_resetting")}
                {:else}
                  {$t("account.forgot.btn_reset")}
                {/if}
              </Button>
            </div>

            <div class="mt-4 text-center">
              <Button variant="link" href={clientResolver(resolve, "/account/signin")} class="text-sm">
                <ArrowLeftIcon class="mr-1 h-3 w-3" />
                {$t("account.forgot.btn_back_to_signin")}
              </Button>
            </div>
          </form>
        </Card.Content>
      {/if}
    {:else}
      <!-- Request Reset View -->
      {#if emailSent}
        <Card.Header class="text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <MailIcon class="h-8 w-8 text-blue-600" />
          </div>
          <Card.Title>{$t("account.forgot.check_email_title")}</Card.Title>
          <Card.Description>
            {$t("account.forgot.check_email_sent_before")} <strong>{email}</strong>. {$t("account.forgot.check_email_sent_after")}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <p class="text-muted-foreground mb-4 text-center text-sm">
            {$t("account.forgot.spam_hint")}
          </p>
          <Button variant="outline" class="w-full" onclick={() => (emailSent = false)}>{$t("account.forgot.btn_try_again")}</Button>
          <div class="mt-4 text-center">
            <Button variant="link" href={clientResolver(resolve, "/account/signin")} class="text-sm">
              <ArrowLeftIcon class="mr-1 h-3 w-3" />
              {$t("account.forgot.btn_back_to_signin")}
            </Button>
          </div>
        </Card.Content>
      {:else}
        <Card.Header>
          <Card.Title>{$t("account.forgot.title_forgot")}</Card.Title>
          <Card.Description>
            {$t("account.forgot.description")}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form onsubmit={handleSubmit}>
            <Field.Group>
              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="email">{$t("account.signin.email_label")}</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon>
                    <MailIcon aria-hidden="true" />
                  </InputGroup.Addon>
                  <InputGroup.Input id="email" name="email" type="email" autocomplete="email" bind:value={email} required />
                </InputGroup.Root>
              </Field.Field>
            </Field.Group>

            <div class="mt-6">
              <Button type="submit" class="w-full" disabled={loading}>
                {#if loading}
                  {$t("account.forgot.btn_sending")}
                {:else}
                  {$t("account.forgot.btn_send_reset")}
                {/if}
              </Button>
            </div>

            <div class="mt-4 text-center">
              <Button variant="link" href={clientResolver(resolve, "/account/signin")} class="text-sm">
                <ArrowLeftIcon class="mr-1 h-3 w-3" />
                {$t("account.forgot.btn_back_to_signin")}
              </Button>
            </div>
          </form>
        </Card.Content>
      {/if}
    {/if}
  </Card.Root>
</div>
