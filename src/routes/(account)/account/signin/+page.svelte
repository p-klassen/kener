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
</script>

<svelte:head>
  <title>{!isAdminAccountCreated ? "Create Admin Account" : "Sign In"}</title>
</svelte:head>
<div class="flex min-h-screen items-center justify-center p-4">
  <Card.Root class="kener-card w-full max-w-md">
    <Card.Header>
      <Card.Title>{!isAdminAccountCreated ? "Create Admin Account" : "Sign In"}</Card.Title>
      <Card.Description>
        {!isAdminAccountCreated
          ? "Set up your admin account to get started"
          : "Enter your credentials to access the dashboard"}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if !isSetupComplete}
        <Alert.Root variant="destructive">
          <AlertCircleIcon />
          <Alert.Title>Set up not completed.</Alert.Title>
          <Alert.Description>
            <p>Please make sure to set the below environment variables:</p>
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
              Go to docs
            </Button>
          </Alert.Description>
        </Alert.Root>
      {:else}
        {#if oidcError}
          <Alert.Root variant="destructive" class="mb-4">
            <AlertCircleIcon />
            <Alert.Title>SSO Login failed</Alert.Title>
            <Alert.Description>{oidcError}</Alert.Description>
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
                {authMode === "ldap" ? "Use email/password instead" : "Sign in with LDAP/AD"}
              </Button>
            {/if}
          </div>

          {#if (oidcEnabled || ldapEnabled) && authMode === "local"}
            <div class="relative mb-4 flex items-center gap-2">
              <div class="border-border flex-1 border-t"></div>
              <span class="text-muted-foreground text-xs">or use email</span>
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
            {#if form?.error}
              <Alert.Root variant="destructive" class="mb-4">
                <AlertCircleIcon />
                <Alert.Title>Login failed</Alert.Title>
                <Alert.Description>{form.error}</Alert.Description>
              </Alert.Root>
            {/if}

            <Field.Group>
              <Field.Field>
                <Field.Label for="ldap_username">Username</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon><UserIcon /></InputGroup.Addon>
                  <InputGroup.Input
                    id="ldap_username"
                    name="ldap_username"
                    type="text"
                    placeholder="username"
                    required
                  />
                </InputGroup.Root>
              </Field.Field>

              <Field.Field>
                <Field.Label for="ldap_password">Password</Field.Label>
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
                {ldapLoading ? "Signing In..." : "Sign In with LDAP"}
              </Button>
            </div>
          </form>
        {:else}
          <form
            method="POST"
            action={authActionPath}
            onsubmit={() => { loading = true; }}
          >
            {#if form?.error}
              <Alert.Root variant="destructive" class="mb-4">
                <AlertCircleIcon />
                <Alert.Title>{!isAdminAccountCreated ? "Signup failed" : "Login failed"}</Alert.Title>
                <Alert.Description>{form.error}</Alert.Description>
              </Alert.Root>
            {/if}

            <Field.Group>
              {#if !isAdminAccountCreated}
                <Field.Field>
                  <Field.Label for="name">Name</Field.Label>
                  <InputGroup.Root>
                    <InputGroup.Addon><UserIcon /></InputGroup.Addon>
                    <InputGroup.Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Your name"
                      value={nameValue}
                      required
                    />
                  </InputGroup.Root>
                </Field.Field>
              {/if}

              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="email">Email</Field.Label>
                <InputGroup.Root>
                  <InputGroup.Addon><MailIcon /></InputGroup.Addon>
                  <InputGroup.Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    value={emailValue}
                    required
                  />
                </InputGroup.Root>
              </Field.Field>

              <Field.Field class="relative flex flex-col gap-1">
                <Field.Label for="password" class="relative">
                  Password
                  <Button
                    variant="link"
                    size="sm"
                    class="text-muted-foreground absolute top-0 right-0 h-auto p-0 text-xs"
                    href="/account/forgot"
                  >
                    Forgot?
                  </Button>
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
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
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
                    Password must contain at least 8 characters, one uppercase, one lowercase, and one number.
                  </Field.Description>
                {/if}
              </Field.Field>
            </Field.Group>

            <div class="mt-6">
              <Button type="submit" class="w-full" disabled={loading}>
                {#if loading}
                  {!isAdminAccountCreated ? "Creating Account..." : "Signing In..."}
                {:else}
                  {!isAdminAccountCreated ? "Create Account" : "Sign In"}
                {/if}
              </Button>
            </div>
          </form>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>
</div>
