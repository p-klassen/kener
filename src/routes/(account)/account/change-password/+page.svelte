<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import LockIcon from "@lucide/svelte/icons/lock";
  import EyeClosedIcon from "@lucide/svelte/icons/eye-closed";
  import EyeOpenIcon from "@lucide/svelte/icons/eye";
  import CheckIcon from "@lucide/svelte/icons/check";
  import type { ActionData } from "./$types";
  import { t } from "$lib/stores/i18n";

  const { form }: { form: ActionData } = $props();
  const formError = $derived(form?.errorKey ? $t(form.errorKey as string) : undefined);

  let loading = $state(false);
  let showNew = $state(false);
  let showConfirm = $state(false);
  let newPassword = $state("");
  let confirmPassword = $state("");

  let hasDigit = $derived(/\d/.test(newPassword));
  let hasLowercase = $derived(/[a-z]/.test(newPassword));
  let hasUppercase = $derived(/[A-Z]/.test(newPassword));
  let hasMinLength = $derived(newPassword.length >= 8);
  let passwordsMatch = $derived(newPassword === confirmPassword && newPassword !== "");
  let isPasswordValid = $derived(hasDigit && hasLowercase && hasUppercase && hasMinLength && passwordsMatch);
</script>

<svelte:head>
  <title>{$t("account.change_password.title")}</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    <Card.Header>
      <Card.Title>{$t("account.change_password.heading")}</Card.Title>
      <Card.Description>
        {$t("account.change_password.desc")}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <form
        method="POST"
        action="?/change"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            loading = false;
            await update();
          };
        }}
      >
        <Field.Group>
          {#if formError}
            <p class="text-sm text-destructive" role="alert">{formError}</p>
          {/if}

          <Field.Field class="relative flex flex-col gap-1">
            <Field.Label for="newPassword">{$t("account.change_password.new_password_label")}</Field.Label>
            <InputGroup.Root>
              <InputGroup.Addon>
                <LockIcon aria-hidden="true" />
              </InputGroup.Addon>
              <InputGroup.Input
                id="newPassword"
                name="newPassword"
                type={showNew ? "text" : "password"}
                placeholder="••••••••"
                autocomplete="new-password"
                bind:value={newPassword}
                required
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button
                  type="button"
                  aria-label={showNew ? $t("account.change_password.hide_password") : $t("account.change_password.show_password")}
                  title={showNew ? $t("account.change_password.hide_password") : $t("account.change_password.show_password")}
                  size="icon-xs"
                  onclick={() => (showNew = !showNew)}
                >
                  {#if showNew}
                    <EyeClosedIcon class="size-4" />
                  {:else}
                    <EyeOpenIcon class="size-4" />
                  {/if}
                </InputGroup.Button>
              </InputGroup.Addon>
            </InputGroup.Root>
            <Field.Description>{$t("account.change_password.password_hint")}</Field.Description>
            <div class="text-muted-foreground text-xs">
              <ul class="grid grid-cols-2 gap-1 mt-1">
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
            <Field.Label for="confirmPassword">{$t("account.change_password.confirm_password_label")}</Field.Label>
            <InputGroup.Root>
              <InputGroup.Addon>
                <LockIcon aria-hidden="true" />
              </InputGroup.Addon>
              <InputGroup.Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                autocomplete="new-password"
                bind:value={confirmPassword}
                required
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button
                  type="button"
                  aria-label={showConfirm ? $t("account.change_password.hide_password") : $t("account.change_password.show_password")}
                  title={showConfirm ? $t("account.change_password.hide_password") : $t("account.change_password.show_password")}
                  size="icon-xs"
                  onclick={() => (showConfirm = !showConfirm)}
                >
                  {#if showConfirm}
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
              {$t("account.change_password.btn_saving")}
            {:else}
              {$t("account.change_password.btn_set")}
            {/if}
          </Button>
        </div>
      </form>
    </Card.Content>
  </Card.Root>
</div>
