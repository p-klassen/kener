<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import MailIcon from "@lucide/svelte/icons/mail";
  import LockIcon from "@lucide/svelte/icons/lock";
  import UserIcon from "@lucide/svelte/icons/user";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import EyeClosedIcon from "@lucide/svelte/icons/eye-closed";
  import EyeOpenIcon from "@lucide/svelte/icons/eye";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const isAdminAccountCreated: boolean = $derived(data.isAdminAccountCreated);
  const isSetupComplete: boolean = $derived(data.isSetupComplete);
  const authActionPath = $derived(!isAdminAccountCreated ? "?/signup" : "?/login");
  const emailValue = $derived(form?.values && "email" in form.values ? form.values.email : "");
  const nameValue = $derived(form?.values && "name" in form.values ? form.values.name : "");

  const oidcEnabled = $derived(data.oidcEnabled ?? false);
  const oidcButtonText = $derived(data.oidcButtonText ?? "Sign in with SSO");
  const oidcButtonIconUrl = $derived(data.oidcButtonIconUrl ?? "");
  const ldapEnabled = $derived(data.ldapEnabled ?? false);
  const oidcError = $derived(data.oidcError ?? null);

  let loading = $state(false);
  let ldapLoading = $state(false);
  let showPassword = $state(false);
  let showLdapPassword = $state(false);
  let password = $state("");
  let ldapPassword = $state("");

  type AuthMode = "local" | "ldap";
  let authMode: AuthMode = $state("local");
  // Restore the auth mode from the failed form submission so the LDAP error stays visible after reload
  $effect(() => {
    if ((form as { mode?: string } | null)?.mode === "ldap") authMode = "ldap";
  });
</script>

<svelte:head>
  <title>{!isAdminAccountCreated ? $t("account.signin.title_create") : $t("account.signin.title_signin")}</title>
</svelte:head>
<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    <Card.Header>
      <Card.Title>{!isAdminAccountCreated ? $t("account.signin.title_create") : $t("account.signin.title_signin")}</Card.Title>
      <Card.Description>
        {!isAdminAccountCreated ? $t("account.signin.desc_create") : $t("account.signin.desc_signin")}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if !isSetupComplete}
        <Alert.Root variant="destructive">
          <AlertCircleIcon />
          <Alert.Title>{$t("account.signin.setup_incomplete_title")}</Alert.Title>
          <Alert.Description>
            <p>{$t("account.signin.setup_incomplete_desc")}</p>
            <ul class="list-inside list-disc text-sm">
              <li>KENER_SECRET_KEY</li>
              <li>ORIGIN</li>
              <li>REDIS_URL</li>
            </ul>
            <Button
              variant="link"
              size="sm"
              class="text-destructive w-full justify-start underline"
              href="https://kener.ing/docs/v4/setup/environment-variables"
            >
              {$t("account.signin.go_to_docs")}
            </Button>
          </Alert.Description>
        </Alert.Root>
      {:else}
        {#if oidcError}
          <Alert.Root variant="destructive" class="mb-4">
            <AlertCircleIcon />
            <Alert.Title>{$t("account.signin.sso_failed_title")}</Alert.Title>
            <Alert.Description>{$t("account.signin.sso_failed_desc")}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if isAdminAccountCreated && (oidcEnabled || ldapEnabled)}
          <div class="mb-4 flex flex-col gap-2">
            {#if oidcEnabled}
              <Button
                variant="outline"
                class="w-full"
                href={clientResolver(resolve, "/account/oidc/login")}
              >
                {#if oidcButtonIconUrl}
                  <img src={oidcButtonIconUrl} alt="" class="mr-2 h-4 w-4" />
                {/if}
                {oidcButtonText}
              </Button>
            {/if}
            {#if ldapEnabled}
              <Button
                variant="outline"
                class="w-full"
                onclick={() => (authMode = authMode === "ldap" ? "local" : "ldap")}
              >
                <LockIcon class="mr-2 h-4 w-4" />
                {authMode === "ldap" ? $t("account.signin.ldap_toggle_local") : $t("account.signin.ldap_toggle")}
              </Button>
            {/if}
          </div>

          {#if (oidcEnabled || ldapEnabled) && authMode === "local"}
            <div class="relative mb-4 flex items-center gap-2">
              <div class="border-border flex-1 border-t"></div>
              <span class="text-muted-foreground text-xs">{$t("account.signin.or_use_email")}</span>
              <div class="border-border flex-1 border-t"></div>
            </div>
          {/if}
        {/if}

        {#if authMode === "ldap" && ldapEnabled}
          <form
            method="POST"
            action="?/ldap"
            onsubmit={() => { ldapLoading = true; }}
          >
            {#if form?.errorKey && (form as { mode?: string })?.mode === "ldap"}
              <Alert.Root variant="destructive" class="mb-4">
                <AlertCircleIcon />
                <Alert.Title>{$t("account.signin.login_failed_title")}</Alert.Title>
                <Alert.Description>{$t(form.errorKey as string)}</Alert.Description>
              </Alert.Root>
            {/if}

            <Field.Group>
              <Field.Field>
                <Field.Label for="ldap_username">{$t("account.signin.username_label")}</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon><UserIcon /></InputGroup.Addon>
                  <InputGroup.Input
                    id="ldap_username"
                    name="ldap_username"
                    type="text"
                    placeholder={$t("account.signin.username_placeholder")}
                    required
                  />
                </InputGroup.Root>
              </Field.Field>

              <Field.Field>
                <Field.Label for="ldap_password">{$t("account.signin.password_label")}</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon><LockIcon /></InputGroup.Addon>
                  <InputGroup.Input
                    id="ldap_password"
                    name="ldap_password"
                    type={showLdapPassword ? "text" : "password"}
                    placeholder="••••••••"
                    bind:value={ldapPassword}
                    required
                  />
                  <InputGroup.Addon align="inline-end">
                    <InputGroup.Button
                      type="button"
                      aria-label={showLdapPassword ? $t("account.signin.hide_password") : $t("account.signin.show_password")}
                      title={showLdapPassword ? $t("account.signin.hide_password") : $t("account.signin.show_password")}
                      size="icon-xs"
                      onclick={() => (showLdapPassword = !showLdapPassword)}
                    >
                      {#if showLdapPassword}
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
              <Button type="submit" class="w-full" disabled={ldapLoading}>
                {ldapLoading ? $t("account.signin.signing_in") : $t("account.signin.ldap_signin_button")}
              </Button>
            </div>
          </form>
        {:else}
          <form
            method="POST"
            action={authActionPath}
            onsubmit={() => { loading = true; }}
          >
            {#if form?.errorKey && (form as { mode?: string })?.mode !== "ldap"}
              <Alert.Root variant="destructive" class="mb-4">
                <AlertCircleIcon />
                <Alert.Title>{!isAdminAccountCreated ? $t("account.signin.signup_failed_title") : $t("account.signin.login_failed_title")}</Alert.Title>
                <Alert.Description>{$t(form.errorKey as string)}</Alert.Description>
              </Alert.Root>
            {/if}

            <Field.Group>
              {#if !isAdminAccountCreated}
                <Field.Field>
                  <Field.Label for="name">{$t("account.signin.name_label")}</Field.Label>
                  <InputGroup.Root>
                    <InputGroup.Addon><UserIcon /></InputGroup.Addon>
                    <InputGroup.Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder={$t("account.signin.name_placeholder")}
                      value={nameValue}
                      required
                    />
                  </InputGroup.Root>
                </Field.Field>
              {/if}

              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="email">{$t("account.signin.email_label")}</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon><MailIcon /></InputGroup.Addon>
                  <InputGroup.Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={$t("account.signin.email_placeholder")}
                    value={emailValue}
                    required
                  />
                </InputGroup.Root>
              </Field.Field>

              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="password" class="relative">
                  {$t("account.signin.password_label")}
                  {#if isAdminAccountCreated}
                    <Button
                      variant="link"
                      size="sm"
                      class="text-muted-foreground absolute top-0 right-0 h-auto p-0 text-xs"
                      href={clientResolver(resolve, "/account/forgot")}
                    >
                      {$t("account.signin.forgot_password")}
                    </Button>
                  {/if}
                </Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon><LockIcon /></InputGroup.Addon>
                  <InputGroup.Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    bind:value={password}
                    required
                  />
                  <InputGroup.Addon align="inline-end">
                    <InputGroup.Button
                      type="button"
                      aria-label={showPassword ? $t("account.signin.hide_password") : $t("account.signin.show_password")}
                      title={showPassword ? $t("account.signin.hide_password") : $t("account.signin.show_password")}
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
                {#if !isAdminAccountCreated}
                  <Field.Description>
                    {$t("account.signin.password_hint")}
                  </Field.Description>
                {/if}
              </Field.Field>
            </Field.Group>

            <div class="mt-6">
              <Button type="submit" class="w-full" disabled={loading}>
                {#if loading}
                  {!isAdminAccountCreated ? $t("account.signin.creating_account") : $t("account.signin.signing_in")}
                {:else}
                  {!isAdminAccountCreated ? $t("account.signin.create_account_button") : $t("account.signin.signin_button")}
                {/if}
              </Button>
            </div>
          </form>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>
</div>
