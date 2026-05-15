<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { t } from "$lib/stores/i18n";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import SaveIcon from "@lucide/svelte/icons/save";
  import FlaskConicalIcon from "@lucide/svelte/icons/flask-conical";
  import Loader from "@lucide/svelte/icons/loader";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const apiUrl = clientResolver(resolve, "/manage/api");
  const canWrite = $derived((data.userPermissions ?? []).includes("settings.write"));

  async function apiCall(action: string, payload: object = {}) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data: payload }),
    });
    const result = await res.json();
    if (result.error) throw new Error(result.error);
    return result;
  }

  // ── Role list ──────────────────────────────────────────────────────────────
  interface RoleOption {
    id: string;
    role_name: string;
  }
  let roles = $state<RoleOption[]>([]);

  // ── OIDC ──────────────────────────────────────────────────────────────────
  interface OidcGroupMapping {
    oidc_group: string;
    role_ids: string[];
  }

  interface OidcConfig {
    enabled: boolean;
    provider_name: string;
    client_id: string;
    client_secret: string;
    issuer_url: string;
    redirect_uri: string;
    scopes: string;
    auto_create_users: boolean;
    default_role_ids: string[];
    button_text: string;
    button_icon_url: string;
    groups_claim: string;
    sync_groups: boolean;
    group_mappings: OidcGroupMapping[];
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    end_session_endpoint: string;
  }

  let oidcConfig = $state<OidcConfig>({
    enabled: false,
    provider_name: "OIDC",
    client_id: "",
    client_secret: "",
    issuer_url: "",
    redirect_uri: "",
    scopes: "openid email profile",
    auto_create_users: false,
    default_role_ids: [],
    button_text: "Sign in with SSO",
    button_icon_url: "",
    groups_claim: "groups",
    sync_groups: true,
    group_mappings: [],
    authorization_endpoint: "",
    token_endpoint: "",
    userinfo_endpoint: "",
    jwks_uri: "",
    end_session_endpoint: "",
  });

  let showOidcSecret = $state(false);
  let oidcSaving = $state(false);
  let oidcTesting = $state(false);
  let showOidcAdvanced = $state(false);

  async function loadOidcConfig() {
    try {
      const cfg = await apiCall("getOidcConfig");
      oidcConfig = { ...oidcConfig, ...cfg };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveOidcConfig() {
    oidcSaving = true;
    try {
      await apiCall("saveOidcConfig", oidcConfig);
      toast.success($t("manage.authentication.oidc_saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      oidcSaving = false;
    }
  }

  async function testOidcDiscovery() {
    if (!oidcConfig.issuer_url) {
      toast.error($t("manage.authentication.oidc_issuer_required"));
      return;
    }
    oidcTesting = true;
    try {
      const result = await apiCall("testOidcDiscovery", { issuer_url: oidcConfig.issuer_url });
      if (result.success) {
        toast.success($t("manage.authentication.oidc_discovery_ok"));
        if (result.endpoints) {
          oidcConfig.authorization_endpoint = result.endpoints.authorization_endpoint || "";
          oidcConfig.token_endpoint = result.endpoints.token_endpoint || "";
          oidcConfig.userinfo_endpoint = result.endpoints.userinfo_endpoint || "";
          oidcConfig.jwks_uri = result.endpoints.jwks_uri || "";
          oidcConfig.end_session_endpoint = result.endpoints.end_session_endpoint || "";
        }
      } else {
        toast.error(result.error || $t("manage.authentication.oidc_discovery_failed"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      oidcTesting = false;
    }
  }

  function addOidcMapping() {
    oidcConfig.group_mappings = [...oidcConfig.group_mappings, { oidc_group: "", role_ids: [] }];
  }

  function removeOidcMapping(i: number) {
    oidcConfig.group_mappings = oidcConfig.group_mappings.filter((_, idx) => idx !== i);
  }

  function toggleOidcDefaultRole(roleId: string) {
    if (oidcConfig.default_role_ids.includes(roleId)) {
      oidcConfig.default_role_ids = oidcConfig.default_role_ids.filter((r) => r !== roleId);
    } else {
      oidcConfig.default_role_ids = [...oidcConfig.default_role_ids, roleId];
    }
  }

  function toggleOidcMappingRole(i: number, roleId: string) {
    const mapping = oidcConfig.group_mappings[i];
    if (mapping.role_ids.includes(roleId)) {
      mapping.role_ids = mapping.role_ids.filter((r) => r !== roleId);
    } else {
      mapping.role_ids = [...mapping.role_ids, roleId];
    }
    oidcConfig.group_mappings = [...oidcConfig.group_mappings];
  }

  // ── LDAP ──────────────────────────────────────────────────────────────────
  interface LdapGroupMapping {
    ldap_group: string;
    role_ids: string[];
  }

  interface LdapConfig {
    enabled: boolean;
    host: string;
    port: number;
    use_tls: boolean;
    skip_tls_verify: boolean;
    bind_dn: string;
    bind_password: string;
    base_dn: string;
    user_search_filter: string;
    username_attribute: string;
    email_attribute: string;
    name_attribute: string;
    auto_create_users: boolean;
    default_role_ids: string[];
    group_search_base: string;
    group_search_filter: string;
    group_member_attribute: string;
    group_name_attribute: string;
    sync_groups: boolean;
    group_mappings: LdapGroupMapping[];
  }

  let ldapConfig = $state<LdapConfig>({
    enabled: false,
    host: "",
    port: 389,
    use_tls: false,
    skip_tls_verify: false,
    bind_dn: "",
    bind_password: "",
    base_dn: "",
    user_search_filter: "(uid={{username}})",
    username_attribute: "uid",
    email_attribute: "mail",
    name_attribute: "cn",
    auto_create_users: false,
    default_role_ids: [],
    group_search_base: "",
    group_search_filter: "(member={{dn}})",
    group_member_attribute: "member",
    group_name_attribute: "cn",
    sync_groups: true,
    group_mappings: [],
  });

  let showLdapPassword = $state(false);
  let ldapSaving = $state(false);
  let ldapTesting = $state(false);

  async function loadLdapConfig() {
    try {
      const cfg = await apiCall("getLdapConfig");
      ldapConfig = { ...ldapConfig, ...cfg };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveLdapConfig() {
    ldapSaving = true;
    try {
      await apiCall("saveLdapConfig", ldapConfig);
      toast.success($t("manage.authentication.ldap_saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      ldapSaving = false;
    }
  }

  async function testLdapConnection() {
    ldapTesting = true;
    try {
      const result = await apiCall("testLdapConnection", ldapConfig);
      if (result.success) {
        toast.success($t("manage.authentication.ldap_test_ok"));
      } else {
        toast.error(result.message || $t("manage.authentication.ldap_test_failed"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      ldapTesting = false;
    }
  }

  function addLdapMapping() {
    ldapConfig.group_mappings = [...ldapConfig.group_mappings, { ldap_group: "", role_ids: [] }];
  }

  function removeLdapMapping(i: number) {
    ldapConfig.group_mappings = ldapConfig.group_mappings.filter((_, idx) => idx !== i);
  }

  function toggleLdapDefaultRole(roleId: string) {
    if (ldapConfig.default_role_ids.includes(roleId)) {
      ldapConfig.default_role_ids = ldapConfig.default_role_ids.filter((r) => r !== roleId);
    } else {
      ldapConfig.default_role_ids = [...ldapConfig.default_role_ids, roleId];
    }
  }

  function toggleLdapMappingRole(i: number, roleId: string) {
    const mapping = ldapConfig.group_mappings[i];
    if (mapping.role_ids.includes(roleId)) {
      mapping.role_ids = mapping.role_ids.filter((r) => r !== roleId);
    } else {
      mapping.role_ids = [...mapping.role_ids, roleId];
    }
    ldapConfig.group_mappings = [...ldapConfig.group_mappings];
  }

  onMount(async () => {
    await Promise.all([
      loadOidcConfig(),
      loadLdapConfig(),
      apiCall("getRoles").then((r) => {
        roles = Array.isArray(r) ? r : [];
      }),
    ]);
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">
  <!-- ── OIDC Card ───────────────────────────────────────────────────────── -->
  <Card.Root class="kener-card">
    <Card.Header>
      <div class="flex items-center justify-between">
        <div>
          <Card.Title>{$t("manage.authentication.oidc_title")}</Card.Title>
          <Card.Description>{$t("manage.authentication.oidc_description")}</Card.Description>
        </div>
        <div class="flex items-center gap-2">
          <Label for="oidc-enabled">{$t("manage.authentication.enabled")}</Label>
          <Switch
            id="oidc-enabled"
            checked={oidcConfig.enabled}
            onCheckedChange={(v) => (oidcConfig.enabled = v)}
            disabled={!canWrite}
          />
        </div>
      </div>
    </Card.Header>

    {#if oidcConfig.enabled}
      <Card.Content class="flex flex-col gap-4">
        <!-- Provider Name + Button Text -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-provider-name">{$t("manage.authentication.oidc_provider_name")}</Label>
            <Input
              id="oidc-provider-name"
              bind:value={oidcConfig.provider_name}
              placeholder="Authentik"
              disabled={!canWrite}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-button-text">{$t("manage.authentication.oidc_button_text")}</Label>
            <Input
              id="oidc-button-text"
              bind:value={oidcConfig.button_text}
              placeholder="Sign in with SSO"
              disabled={!canWrite}
            />
          </div>
        </div>

        <!-- Button Icon URL -->
        <div class="flex flex-col gap-1.5">
          <Label for="oidc-button-icon">{$t("manage.authentication.oidc_button_icon_url")}</Label>
          <Input
            id="oidc-button-icon"
            bind:value={oidcConfig.button_icon_url}
            placeholder="https://example.com/logo.png"
            disabled={!canWrite}
          />
        </div>

        <Separator />

        <!-- Issuer URL + Test -->
        <div class="flex flex-col gap-1.5">
          <Label for="oidc-issuer">{$t("manage.authentication.oidc_issuer_url")}</Label>
          <div class="flex gap-2">
            <Input
              id="oidc-issuer"
              bind:value={oidcConfig.issuer_url}
              placeholder="https://auth.example.com/application/o/kener/"
              class="flex-1"
              disabled={!canWrite}
            />
            {#if canWrite}
              <Button variant="outline" onclick={testOidcDiscovery} disabled={oidcTesting}>
                {#if oidcTesting}
                  <Loader class="mr-2 h-4 w-4 animate-spin" />
                {:else}
                  <FlaskConicalIcon class="mr-2 h-4 w-4" />
                {/if}
                {$t("manage.authentication.test_discovery")}
              </Button>
            {/if}
          </div>
          <p class="text-muted-foreground text-xs">{$t("manage.authentication.oidc_issuer_hint")}</p>
        </div>

        <!-- Client ID + Secret -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-client-id">{$t("manage.authentication.oidc_client_id")}</Label>
            <Input
              id="oidc-client-id"
              bind:value={oidcConfig.client_id}
              placeholder="client-id"
              disabled={!canWrite}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-client-secret">{$t("manage.authentication.oidc_client_secret")}</Label>
            <div class="flex gap-1">
              <Input
                id="oidc-client-secret"
                type={showOidcSecret ? "text" : "password"}
                bind:value={oidcConfig.client_secret}
                placeholder="••••••••"
                class="flex-1"
                disabled={!canWrite}
              />
              <Button
                variant="outline"
                size="icon"
                type="button"
                onclick={() => (showOidcSecret = !showOidcSecret)}
              >
                {#if showOidcSecret}
                  <EyeOff class="h-4 w-4" />
                {:else}
                  <Eye class="h-4 w-4" />
                {/if}
              </Button>
            </div>
          </div>
        </div>

        <!-- Scopes + Redirect URI -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-scopes">{$t("manage.authentication.oidc_scopes")}</Label>
            <Input
              id="oidc-scopes"
              bind:value={oidcConfig.scopes}
              placeholder="openid email profile"
              disabled={!canWrite}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-redirect-uri">{$t("manage.authentication.oidc_redirect_uri")}</Label>
            <Input
              id="oidc-redirect-uri"
              bind:value={oidcConfig.redirect_uri}
              placeholder="/account/oidc/callback"
              disabled={!canWrite}
            />
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.oidc_redirect_uri_hint")}</p>
          </div>
        </div>

        <Separator />

        <!-- Auto-create + Default roles -->
        <div class="flex items-center gap-3">
          <Switch
            id="oidc-auto-create"
            checked={oidcConfig.auto_create_users}
            onCheckedChange={(v) => (oidcConfig.auto_create_users = v)}
            disabled={!canWrite}
          />
          <div>
            <Label for="oidc-auto-create">{$t("manage.authentication.auto_create_users")}</Label>
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.oidc_auto_create_hint")}</p>
          </div>
        </div>

        {#if oidcConfig.auto_create_users && roles.length > 0}
          <div class="flex flex-col gap-1.5">
            <Label>{$t("manage.authentication.default_roles")}</Label>
            <div class="flex flex-wrap gap-2">
              {#each roles as role}
                <label class="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    checked={oidcConfig.default_role_ids.includes(role.id)}
                    onCheckedChange={() => toggleOidcDefaultRole(role.id)}
                    disabled={!canWrite}
                  />
                  <span class="text-sm">{role.role_name}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <Separator />

        <!-- Group mapping -->
        <div class="flex items-center gap-3">
          <Switch
            id="oidc-sync-groups"
            checked={oidcConfig.sync_groups}
            onCheckedChange={(v) => (oidcConfig.sync_groups = v)}
            disabled={!canWrite}
          />
          <div>
            <Label for="oidc-sync-groups">{$t("manage.authentication.sync_groups")}</Label>
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.sync_groups_hint")}</p>
          </div>
        </div>

        {#if oidcConfig.sync_groups}
          <div class="flex flex-col gap-1.5">
            <Label for="oidc-groups-claim">{$t("manage.authentication.oidc_groups_claim")}</Label>
            <Input
              id="oidc-groups-claim"
              bind:value={oidcConfig.groups_claim}
              placeholder="groups"
              class="max-w-xs"
              disabled={!canWrite}
            />
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.oidc_groups_claim_hint")}</p>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <Label>{$t("manage.authentication.group_mappings")}</Label>
              {#if canWrite}
                <Button variant="outline" size="sm" onclick={addOidcMapping}>
                  <PlusIcon class="mr-1 h-3.5 w-3.5" />
                  {$t("manage.authentication.add_mapping")}
                </Button>
              {/if}
            </div>

            {#each oidcConfig.group_mappings as mapping, i}
              <div class="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
                <div class="flex gap-2">
                  <Input
                    bind:value={mapping.oidc_group}
                    placeholder={$t("manage.authentication.oidc_group_name")}
                    class="flex-1"
                    disabled={!canWrite}
                  />
                  {#if canWrite}
                    <Button variant="ghost" size="icon" onclick={() => removeOidcMapping(i)}>
                      <Trash2Icon class="h-4 w-4" />
                    </Button>
                  {/if}
                </div>
                {#if roles.length > 0}
                  <div class="flex flex-wrap gap-2">
                    {#each roles as role}
                      <label class="flex cursor-pointer items-center gap-1.5">
                        <Checkbox
                          checked={mapping.role_ids.includes(role.id)}
                          onCheckedChange={() => toggleOidcMappingRole(i, role.id)}
                          disabled={!canWrite}
                        />
                        <span class="text-sm">{role.role_name}</span>
                      </label>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}

            {#if oidcConfig.group_mappings.length === 0}
              <p class="text-muted-foreground text-sm">{$t("manage.authentication.no_mappings")}</p>
            {/if}
          </div>
        {/if}

        <!-- Advanced / Manual endpoint overrides -->
        <div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground text-sm underline"
            onclick={() => (showOidcAdvanced = !showOidcAdvanced)}
          >
            {showOidcAdvanced
              ? $t("manage.authentication.hide_advanced")
              : $t("manage.authentication.show_advanced")}
          </button>
        </div>

        {#if showOidcAdvanced}
          <div class="bg-muted/30 flex flex-col gap-3 rounded-md border p-4">
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.oidc_advanced_hint")}</p>
            {#each [
              { key: "authorization_endpoint", label: $t("manage.authentication.oidc_auth_endpoint") },
              { key: "token_endpoint", label: $t("manage.authentication.oidc_token_endpoint") },
              { key: "userinfo_endpoint", label: $t("manage.authentication.oidc_userinfo_endpoint") },
              { key: "jwks_uri", label: $t("manage.authentication.oidc_jwks_uri") },
              { key: "end_session_endpoint", label: $t("manage.authentication.oidc_end_session_endpoint") },
            ] as field}
              <div class="flex flex-col gap-1.5">
                <Label for={"oidc-" + field.key}>{field.label}</Label>
                <Input
                  id={"oidc-" + field.key}
                  bind:value={oidcConfig[field.key as keyof typeof oidcConfig] as string}
                  placeholder="https://"
                  disabled={!canWrite}
                />
              </div>
            {/each}
          </div>
        {/if}
      </Card.Content>
    {/if}

    {#if canWrite}
      <Card.Footer class="flex justify-end gap-2">
        <Button onclick={saveOidcConfig} disabled={oidcSaving}>
          {#if oidcSaving}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="mr-2 h-4 w-4" />
          {/if}
          {$t("manage.authentication.save")}
        </Button>
      </Card.Footer>
    {/if}
  </Card.Root>

  <!-- ── LDAP Card ───────────────────────────────────────────────────────── -->
  <Card.Root class="kener-card">
    <Card.Header>
      <div class="flex items-center justify-between">
        <div>
          <Card.Title>{$t("manage.authentication.ldap_title")}</Card.Title>
          <Card.Description>{$t("manage.authentication.ldap_description")}</Card.Description>
        </div>
        <div class="flex items-center gap-2">
          <Label for="ldap-enabled">{$t("manage.authentication.enabled")}</Label>
          <Switch
            id="ldap-enabled"
            checked={ldapConfig.enabled}
            onCheckedChange={(v) => (ldapConfig.enabled = v)}
            disabled={!canWrite}
          />
        </div>
      </div>
    </Card.Header>

    {#if ldapConfig.enabled}
      <Card.Content class="flex flex-col gap-4">
        <!-- Host + Port -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label for="ldap-host">{$t("manage.authentication.ldap_host")}</Label>
            <Input
              id="ldap-host"
              bind:value={ldapConfig.host}
              placeholder="ldap.example.com"
              disabled={!canWrite}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="ldap-port">{$t("manage.authentication.ldap_port")}</Label>
            <Input
              id="ldap-port"
              type="number"
              bind:value={ldapConfig.port}
              min="1"
              max="65535"
              disabled={!canWrite}
            />
          </div>
        </div>

        <!-- TLS options -->
        <div class="flex flex-wrap gap-6">
          <div class="flex items-center gap-3">
            <Switch
              id="ldap-tls"
              checked={ldapConfig.use_tls}
              onCheckedChange={(v) => (ldapConfig.use_tls = v)}
              disabled={!canWrite}
            />
            <Label for="ldap-tls">{$t("manage.authentication.ldap_use_tls")}</Label>
          </div>
          <div class="flex items-center gap-3">
            <Switch
              id="ldap-skip-tls"
              checked={ldapConfig.skip_tls_verify}
              onCheckedChange={(v) => (ldapConfig.skip_tls_verify = v)}
              disabled={!canWrite}
            />
            <Label for="ldap-skip-tls">{$t("manage.authentication.ldap_skip_tls_verify")}</Label>
          </div>
        </div>

        <Separator />

        <!-- Bind DN + Password -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="ldap-bind-dn">{$t("manage.authentication.ldap_bind_dn")}</Label>
            <Input
              id="ldap-bind-dn"
              bind:value={ldapConfig.bind_dn}
              placeholder="cn=admin,dc=example,dc=com"
              disabled={!canWrite}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="ldap-bind-password">{$t("manage.authentication.ldap_bind_password")}</Label>
            <div class="flex gap-1">
              <Input
                id="ldap-bind-password"
                type={showLdapPassword ? "text" : "password"}
                bind:value={ldapConfig.bind_password}
                placeholder="••••••••"
                class="flex-1"
                disabled={!canWrite}
              />
              <Button
                variant="outline"
                size="icon"
                type="button"
                onclick={() => (showLdapPassword = !showLdapPassword)}
              >
                {#if showLdapPassword}
                  <EyeOff class="h-4 w-4" />
                {:else}
                  <Eye class="h-4 w-4" />
                {/if}
              </Button>
            </div>
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.ldap_password_hint")}</p>
          </div>
        </div>

        <!-- Base DN -->
        <div class="flex flex-col gap-1.5">
          <Label for="ldap-base-dn">{$t("manage.authentication.ldap_base_dn")}</Label>
          <Input
            id="ldap-base-dn"
            bind:value={ldapConfig.base_dn}
            placeholder="dc=example,dc=com"
            disabled={!canWrite}
          />
        </div>

        <Separator />

        <!-- User search -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <Label for="ldap-user-filter">{$t("manage.authentication.ldap_user_search_filter")}</Label>
            <Input
              id="ldap-user-filter"
              bind:value={ldapConfig.user_search_filter}
              placeholder={"(uid={{username}})"}
              disabled={!canWrite}
            />
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.ldap_user_filter_hint")}</p>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{$t("manage.authentication.ldap_attributes")}</Label>
            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col gap-1">
                <Label for="ldap-username-attr" class="text-xs">{$t("manage.authentication.ldap_username_attr")}</Label>
                <Input id="ldap-username-attr" bind:value={ldapConfig.username_attribute} placeholder="uid" disabled={!canWrite} />
              </div>
              <div class="flex flex-col gap-1">
                <Label for="ldap-email-attr" class="text-xs">{$t("manage.authentication.ldap_email_attr")}</Label>
                <Input id="ldap-email-attr" bind:value={ldapConfig.email_attribute} placeholder="mail" disabled={!canWrite} />
              </div>
              <div class="flex flex-col gap-1">
                <Label for="ldap-name-attr" class="text-xs">{$t("manage.authentication.ldap_name_attr")}</Label>
                <Input id="ldap-name-attr" bind:value={ldapConfig.name_attribute} placeholder="cn" disabled={!canWrite} />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <!-- Auto-create + Default roles -->
        <div class="flex items-center gap-3">
          <Switch
            id="ldap-auto-create"
            checked={ldapConfig.auto_create_users}
            onCheckedChange={(v) => (ldapConfig.auto_create_users = v)}
            disabled={!canWrite}
          />
          <div>
            <Label for="ldap-auto-create">{$t("manage.authentication.auto_create_users")}</Label>
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.ldap_auto_create_hint")}</p>
          </div>
        </div>

        {#if ldapConfig.auto_create_users && roles.length > 0}
          <div class="flex flex-col gap-1.5">
            <Label>{$t("manage.authentication.default_roles")}</Label>
            <div class="flex flex-wrap gap-2">
              {#each roles as role}
                <label class="flex cursor-pointer items-center gap-1.5">
                  <Checkbox
                    checked={ldapConfig.default_role_ids.includes(role.id)}
                    onCheckedChange={() => toggleLdapDefaultRole(role.id)}
                    disabled={!canWrite}
                  />
                  <span class="text-sm">{role.role_name}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <Separator />

        <!-- Group search + sync -->
        <div class="flex items-center gap-3">
          <Switch
            id="ldap-sync-groups"
            checked={ldapConfig.sync_groups}
            onCheckedChange={(v) => (ldapConfig.sync_groups = v)}
            disabled={!canWrite}
          />
          <div>
            <Label for="ldap-sync-groups">{$t("manage.authentication.sync_groups")}</Label>
            <p class="text-muted-foreground text-xs">{$t("manage.authentication.sync_groups_hint")}</p>
          </div>
        </div>

        {#if ldapConfig.sync_groups}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <Label for="ldap-group-base">{$t("manage.authentication.ldap_group_search_base")}</Label>
              <Input
                id="ldap-group-base"
                bind:value={ldapConfig.group_search_base}
                placeholder="ou=groups,dc=example,dc=com"
                disabled={!canWrite}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="ldap-group-filter">{$t("manage.authentication.ldap_group_search_filter")}</Label>
              <Input
                id="ldap-group-filter"
                bind:value={ldapConfig.group_search_filter}
                placeholder={"(member={{dn}})"}
                disabled={!canWrite}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="ldap-group-member-attr">{$t("manage.authentication.ldap_group_member_attr")}</Label>
              <Input
                id="ldap-group-member-attr"
                bind:value={ldapConfig.group_member_attribute}
                placeholder="member"
                disabled={!canWrite}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="ldap-group-name-attr">{$t("manage.authentication.ldap_group_name_attr")}</Label>
              <Input
                id="ldap-group-name-attr"
                bind:value={ldapConfig.group_name_attribute}
                placeholder="cn"
                disabled={!canWrite}
              />
            </div>
          </div>

          <!-- Group mappings -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <Label>{$t("manage.authentication.group_mappings")}</Label>
              {#if canWrite}
                <Button variant="outline" size="sm" onclick={addLdapMapping}>
                  <PlusIcon class="mr-1 h-3.5 w-3.5" />
                  {$t("manage.authentication.add_mapping")}
                </Button>
              {/if}
            </div>

            {#each ldapConfig.group_mappings as mapping, i}
              <div class="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
                <div class="flex gap-2">
                  <Input
                    bind:value={mapping.ldap_group}
                    placeholder={$t("manage.authentication.ldap_group_dn")}
                    class="flex-1"
                    disabled={!canWrite}
                  />
                  {#if canWrite}
                    <Button variant="ghost" size="icon" onclick={() => removeLdapMapping(i)}>
                      <Trash2Icon class="h-4 w-4" />
                    </Button>
                  {/if}
                </div>
                {#if roles.length > 0}
                  <div class="flex flex-wrap gap-2">
                    {#each roles as role}
                      <label class="flex cursor-pointer items-center gap-1.5">
                        <Checkbox
                          checked={mapping.role_ids.includes(role.id)}
                          onCheckedChange={() => toggleLdapMappingRole(i, role.id)}
                          disabled={!canWrite}
                        />
                        <span class="text-sm">{role.role_name}</span>
                      </label>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}

            {#if ldapConfig.group_mappings.length === 0}
              <p class="text-muted-foreground text-sm">{$t("manage.authentication.no_mappings")}</p>
            {/if}
          </div>
        {/if}
      </Card.Content>
    {/if}

    {#if canWrite}
      <Card.Footer class="flex justify-end gap-2">
        <Button variant="outline" onclick={testLdapConnection} disabled={ldapTesting || !ldapConfig.host}>
          {#if ldapTesting}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
          {:else}
            <FlaskConicalIcon class="mr-2 h-4 w-4" />
          {/if}
          {$t("manage.authentication.test_connection")}
        </Button>
        <Button onclick={saveLdapConfig} disabled={ldapSaving}>
          {#if ldapSaving}
            <Loader class="mr-2 h-4 w-4 animate-spin" />
          {:else}
            <SaveIcon class="mr-2 h-4 w-4" />
          {/if}
          {$t("manage.authentication.save")}
        </Button>
      </Card.Footer>
    {/if}
  </Card.Root>
</div>
