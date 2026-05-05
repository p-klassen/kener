<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import LockIcon from "@lucide/svelte/icons/lock";
  import EyeClosedIcon from "@lucide/svelte/icons/eye-closed";
  import EyeOpenIcon from "@lucide/svelte/icons/eye";
  import type { ActionData } from "./$types";

  const { form }: { form: ActionData } = $props();

  let loading = $state(false);
  let showNew = $state(false);
  let showConfirm = $state(false);
</script>

<svelte:head>
  <title>Change Password</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    <Card.Header>
      <Card.Title>Change Your Password</Card.Title>
      <Card.Description>
        You must set a new password before continuing.
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
          {#if form?.error}
            <p class="text-sm text-destructive" role="alert">{form.error}</p>
          {/if}

          <Field.Field class="relative flex flex-col gap-1">
            <Field.Label for="newPassword">New Password</Field.Label>
            <InputGroup.Root>
              <InputGroup.Addon>
                <LockIcon />
              </InputGroup.Addon>
              <InputGroup.Input
                id="newPassword"
                name="newPassword"
                type={showNew ? "text" : "password"}
                placeholder="••••••••"
                autocomplete="new-password"
                required
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button
                  type="button"
                  aria-label={showNew ? "Hide password" : "Show password"}
                  title={showNew ? "Hide password" : "Show password"}
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
            <Field.Description>Minimum 8 characters with uppercase, lowercase, and a number.</Field.Description>
          </Field.Field>

          <Field.Field class="relative flex flex-col gap-1">
            <Field.Label for="confirmPassword">Confirm Password</Field.Label>
            <InputGroup.Root>
              <InputGroup.Addon>
                <LockIcon />
              </InputGroup.Addon>
              <InputGroup.Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                autocomplete="new-password"
                required
              />
              <InputGroup.Addon align="inline-end">
                <InputGroup.Button
                  type="button"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  title={showConfirm ? "Hide password" : "Show password"}
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
          <Button type="submit" class="w-full" disabled={loading}>
            {#if loading}
              Saving...
            {:else}
              Set New Password
            {/if}
          </Button>
        </div>
      </form>
    </Card.Content>
  </Card.Root>
</div>
