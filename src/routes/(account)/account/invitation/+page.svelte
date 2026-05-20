<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import LockIcon from "@lucide/svelte/icons/lock";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import EyeClosedIcon from "@lucide/svelte/icons/eye-closed";
  import EyeOpenIcon from "@lucide/svelte/icons/eye";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  const { data } = $props();

  const valid: boolean = $derived(data.valid);
  const error: string = $derived(
    data.errorKey ? $t(data.errorKey as string) : (data.error || "")
  );
  const token: string = $derived(data.token);
  const email: string = $derived(data.email || "");
  const name: string = $derived(data.name || "");

  let loading = $state(false);
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);
  let accountActivated = $state(false);

  let newPassword = $state("");
  let confirmPassword = $state("");

  async function handleAcceptInvitation() {
    if (!newPassword || !confirmPassword) {
      toast.error($t("account.invitation.err_fill_fields"));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error($t("account.invitation.err_passwords_no_match"));
      return;
    }

    if (newPassword.length < 8) {
      toast.error($t("account.invitation.err_password_too_short"));
      return;
    }

    loading = true;
    try {
      const response = await fetch(clientResolver(resolve, "/account/invitation/api/accept-invitation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivedToken: token, newPassword })
      });

      const responseData = await response.json();

      if (!response.ok) {
        toast.error(responseData.error || $t("account.invitation.err_failed"));
        return;
      }

      accountActivated = true;
      toast.success($t("account.invitation.success_activated"));
    } catch (e) {
      toast.error($t("account.invitation.err_occurred"));
    } finally {
      loading = false;
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    handleAcceptInvitation();
  }
</script>

<svelte:head>
  <title>{$t("account.invitation.title")}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    {#if !valid}
      <!-- Error View -->
      <Card.Header class="text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertCircleIcon class="h-8 w-8 text-red-600" />
        </div>
        <Card.Title>{$t("account.invitation.title_invalid")}</Card.Title>
        <Card.Description>{error}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Button href={clientResolver(resolve, "/account/signin")} class="w-full">
          <ArrowLeftIcon class="mr-2 h-4 w-4" />
          {$t("account.invitation.btn_go_signin")}
        </Button>
      </Card.Content>
    {:else if accountActivated}
      <!-- Success View -->
      <Card.Header class="text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircleIcon class="h-8 w-8 text-green-600" />
        </div>
        <Card.Title>{$t("account.invitation.title_activated")}</Card.Title>
        <Card.Description>
          {$t("account.invitation.activated_desc")}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Button href={clientResolver(resolve, "/account/signin")} class="w-full">
          <ArrowLeftIcon class="mr-2 h-4 w-4" />
          {$t("account.invitation.btn_go_signin")}
        </Button>
      </Card.Content>
    {:else}
      <!-- Set Password View -->
      <Card.Header>
        <Card.Title>{$t("account.invitation.welcome_greeting")} {name}!</Card.Title>
        <Card.Description>
          {$t("account.invitation.welcome_desc_before")} <strong>{email}</strong>. {$t("account.invitation.welcome_desc_after")}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <form onsubmit={handleSubmit}>
          <Field.Group>
            <Field.Field class="relative flex flex-col gap-1">
              <Field.Label for="newPassword">{$t("account.invitation.password_label")}</Field.Label>
              <InputGroup.Root>
                <InputGroup.Addon>
                  <LockIcon />
                </InputGroup.Addon>
                <InputGroup.Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  bind:value={newPassword}
                  required
                />
                <InputGroup.Addon align="inline-end">
                  <InputGroup.Button
                    type="button"
                    aria-label={showPassword ? $t("account.invitation.hide_password") : $t("account.invitation.show_password")}
                    title={showPassword ? $t("account.invitation.hide_password") : $t("account.invitation.show_password")}
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
              <Field.Description>
                {$t("account.invitation.password_hint")}
              </Field.Description>
            </Field.Field>

            <Field.Field class="relative flex flex-col gap-1">
              <Field.Label for="confirmPassword">{$t("account.invitation.confirm_password_label")}</Field.Label>
              <InputGroup.Root>
                <InputGroup.Addon>
                  <LockIcon />
                </InputGroup.Addon>
                <InputGroup.Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  bind:value={confirmPassword}
                  required
                />
                <InputGroup.Addon align="inline-end">
                  <InputGroup.Button
                    type="button"
                    aria-label={showConfirmPassword ? $t("account.invitation.hide_password") : $t("account.invitation.show_password")}
                    title={showConfirmPassword ? $t("account.invitation.hide_password") : $t("account.invitation.show_password")}
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
            <Button type="submit" class="w-full" disabled={loading}>
              {#if loading}
                {$t("account.invitation.btn_activating")}
              {:else}
                {$t("account.invitation.btn_activate")}
              {/if}
            </Button>
          </div>

          <div class="mt-4 text-center">
            <Button variant="link" href={clientResolver(resolve, "/account/signin")} class="text-sm">
              <ArrowLeftIcon class="mr-1 h-3 w-3" />
              {$t("account.invitation.btn_back_signin")}
            </Button>
          </div>
        </form>
      </Card.Content>
    {/if}
  </Card.Root>
</div>
