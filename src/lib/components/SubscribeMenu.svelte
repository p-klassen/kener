<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as InputOTP from "$lib/components/ui/input-otp/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { resolve } from "$app/paths";
  import { page } from "$app/stores";
  import clientResolver from "$lib/client/resolver.js";

  import Mail from "@lucide/svelte/icons/mail";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import SaveIcon from "@lucide/svelte/icons/save";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import Wrench from "@lucide/svelte/icons/wrench";
  import { t } from "$lib/stores/i18n";
  import trackEvent from "$lib/beacon";
  import ICONS from "$lib/icons";

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();
  let open = $state(false);

  const STORAGE_KEY = "subscriber_token";

  // UI States
  type View = "loading" | "login" | "otp" | "preferences" | "error";
  let currentView = $state<View>("loading");
  let isSubmitting = $state(false);
  let errorMessage = $state("");

  // Whether the current session is linked to an app account (no logout shown)
  let isAccountLinked = $state(false);

  // Form data
  let email = $state("");
  let otpValue = $state("");

  // Preferences data
  let subscriberEmail = $state("");
  let incidentsEnabled = $state(false);
  let maintenancesEnabled = $state(false);
  let availableSubscriptions = $state<{ incidents: boolean; maintenances: boolean }>({
    incidents: false,
    maintenances: false
  });

  // Monitor/page scope state
  interface PageScopeOption {
    slug: string;
    name: string;
    monitors: Array<{ tag: string; name: string }>;
  }
  let availableMonitors = $state<{ tag: string; name: string }[]>([]);
  let availablePages = $state<PageScopeOption[]>([]);

  let incidentScope = $state<"all" | "specific">("all");
  let incidentPageSelections = $state<Record<string, boolean>>({});
  let incidentMonitorSelections = $state<Record<string, boolean>>({});

  let maintenanceScope = $state<"all" | "specific">("all");
  let maintenancePageSelections = $state<Record<string, boolean>>({});
  let maintenanceMonitorSelections = $state<Record<string, boolean>>({});

  let incidentScopeError = $state("");
  let maintenanceScopeError = $state("");
  let savingIncidentScope = $state(false);
  let savingMaintenanceScope = $state(false);
  let togglingIncidents = $state(false);
  let togglingMaintenances = $state(false);

  let initSeq = 0;

  $effect(() => { if (incidentScope === "all") incidentScopeError = ""; });
  $effect(() => { if (maintenanceScope === "all") maintenanceScopeError = ""; });

  $effect(() => {
    if (open) {
      initDialog();
    }
  });

  async function initDialog() {
    const seq = ++initSeq;
    currentView = "loading";
    errorMessage = "";

    // Logged-in app users get auto-linked — no OTP flow needed
    if ($page.data?.loggedInUser) {
      isAccountLinked = true;
      await loginWithAccount(seq);
      return;
    }

    isAccountLinked = false;
    await checkExistingToken(seq);
  }

  async function loginWithAccount(seq: number) {
    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "loginWithAccount" })
      });

      if (seq !== initSeq) return;
      if (!response.ok) {
        currentView = "error";
        errorMessage = $t("subscribe.error.link_account_failed");
        return;
      }

      const data = await response.json();
      localStorage.setItem(STORAGE_KEY, data.token);
      await loadPreferences(data.token, seq);
    } catch (_err) {
      if (seq !== initSeq) return;
      currentView = "error";
      errorMessage = $t("subscribe.error.network");
    }
  }

  async function checkExistingToken(seq: number) {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      if (seq !== initSeq) return;
      errorMessage = "";
      currentView = "login";
      return;
    }

    await loadPreferences(token, seq);
  }

  async function loadPreferences(token: string, seq: number = initSeq) {
    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPreferences", token })
      });

      if (seq !== initSeq) return;
      if (!response.ok) {
        localStorage.removeItem(STORAGE_KEY);
        currentView = isAccountLinked ? "error" : "login";
        return;
      }

      const data = await response.json();
      subscriberEmail = data.email || "";
      incidentsEnabled = data.subscriptions?.incidents || false;
      maintenancesEnabled = data.subscriptions?.maintenances || false;
      availableSubscriptions = data.availableSubscriptions || { incidents: false, maintenances: false };

      // Fetch monitors/pages then initialize scope state
      await fetchAvailableMonitors();
      if (seq !== initSeq) return;
      const incMons: string[] = data.incident_monitors || [];
      const incPages: string[] = data.incident_pages || [];
      const mntMons: string[] = data.maintenance_monitors || [];
      const mntPages: string[] = data.maintenance_pages || [];
      incidentScope = (incMons.length > 0 || incPages.length > 0) ? "specific" : "all";
      maintenanceScope = (mntMons.length > 0 || mntPages.length > 0) ? "specific" : "all";
      incidentMonitorSelections = Object.fromEntries(availableMonitors.map((m) => [m.tag, incMons.includes(m.tag)]));
      incidentPageSelections = Object.fromEntries(availablePages.map((p) => [p.slug, incPages.includes(p.slug)]));
      maintenanceMonitorSelections = Object.fromEntries(availableMonitors.map((m) => [m.tag, mntMons.includes(m.tag)]));
      maintenancePageSelections = Object.fromEntries(availablePages.map((p) => [p.slug, mntPages.includes(p.slug)]));

      currentView = "preferences";
    } catch (_err) {
      if (seq !== initSeq) return;
      localStorage.removeItem(STORAGE_KEY);
      currentView = isAccountLinked ? "error" : "login";
    }
  }

  async function handleLogin() {
    if (!email.trim()) {
      errorMessage = $t("subscribe.error.invalid_email");
      return;
    }

    isSubmitting = true;
    errorMessage = "";

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: email.trim() })
      });

      if (!response.ok) {
        errorMessage = $t("subscribe.error.send_code_failed");
        return;
      }

      trackEvent("subscribe_login_sent", { source: "subscribe_menu" });

      currentView = "otp";
      otpValue = "";
    } catch (err) {
      errorMessage = $t("subscribe.error.network");
    } finally {
      isSubmitting = false;
    }
  }

  async function handleVerifyOTP() {
    if (otpValue.length !== 6) {
      errorMessage = $t("subscribe.error.enter_code");
      return;
    }

    const seq = initSeq;
    isSubmitting = true;
    errorMessage = "";

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: email.trim(), code: otpValue })
      });

      if (!response.ok) {
        errorMessage = $t("subscribe.error.verification_failed");
        return;
      }

      const data = await response.json();
      localStorage.setItem(STORAGE_KEY, data.token);
      trackEvent("subscribe_otp_verified", { source: "subscribe_menu" });
      await checkExistingToken(seq);
    } catch (err) {
      errorMessage = $t("subscribe.error.network");
    } finally {
      isSubmitting = false;
    }
  }

  async function handlePreferenceChange(type: "incidents" | "maintenances", value: boolean) {
    if (type === "incidents" && togglingIncidents) return;
    if (type === "maintenances" && togglingMaintenances) return;

    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) { currentView = "login"; return; }

    if (type === "incidents") togglingIncidents = true;
    else togglingMaintenances = true;

    // Optimistic update — revert on failure
    if (type === "incidents") incidentsEnabled = value;
    else maintenancesEnabled = value;

    // Only include monitor/page scope when disabling — enabling defers scope to the picker
    const body: Record<string, unknown> = { action: "updatePreferences", token, [type]: value };
    if (!value) {
      const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";
      const pageKey = type === "incidents" ? "incident_pages" : "maintenance_pages";
      const scope = type === "incidents" ? incidentScope : maintenanceScope;
      const monSelections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
      const pgSelections = type === "incidents" ? incidentPageSelections : maintenancePageSelections;
      if (scope === "specific") {
        const pages = Object.entries(pgSelections).filter(([, v]) => v).map(([k]) => k);
        const coveredTags = new Set(availablePages.filter((p) => pages.includes(p.slug)).flatMap((p) => p.monitors.map((m) => m.tag)));
        body[monitorKey] = Object.entries(monSelections).filter(([k, v]) => v && !coveredTags.has(k)).map(([k]) => k);
        body[pageKey] = pages;
      } else {
        body[monitorKey] = [];
        body[pageKey] = [];
      }
    }

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        errorMessage = $t("subscribe.error.update_pref_failed");
        if (type === "incidents") incidentsEnabled = !value;
        else maintenancesEnabled = !value;
        return;
      }

      trackEvent("subscribe_pref_toggled", { source: "subscribe_menu", type, value });
    } catch (_err) {
      errorMessage = $t("subscribe.error.network");
      if (type === "incidents") incidentsEnabled = !value;
      else maintenancesEnabled = !value;
    } finally {
      if (type === "incidents") togglingIncidents = false;
      else togglingMaintenances = false;
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    email = "";
    otpValue = "";
    subscriberEmail = "";
    incidentsEnabled = false;
    maintenancesEnabled = false;
    errorMessage = "";
    availableMonitors = [];
    availablePages = [];
    incidentScope = "all";
    incidentPageSelections = {};
    incidentMonitorSelections = {};
    maintenanceScope = "all";
    maintenancePageSelections = {};
    maintenanceMonitorSelections = {};
    incidentScopeError = "";
    maintenanceScopeError = "";
    isAccountLinked = false;
    currentView = "login";
    trackEvent("subscribe_logout", { source: "subscribe_menu" });
  }

  function handleBackToEmail() {
    currentView = "login";
    otpValue = "";
    errorMessage = "";
  }

  function handleClose() {
    open = false;
    errorMessage = "";
  }

  async function fetchAvailableMonitors() {
    try {
      const res = await fetch(clientResolver(resolve, "/dashboard-apis/subscription/monitors"));
      if (res.ok) {
        const data = await res.json();
        availableMonitors = data.monitors || [];
        availablePages = data.pages || [];
      } else {
        availableMonitors = [];
        availablePages = [];
      }
    } catch (_err) {
      availableMonitors = [];
      availablePages = [];
    }
  }

  async function saveMonitorScope(type: "incidents" | "maintenances") {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) { currentView = "login"; return; }

    const setError = (msg: string) => {
      if (type === "incidents") incidentScopeError = msg;
      else maintenanceScopeError = msg;
    };
    setError("");

    const scope = type === "incidents" ? incidentScope : maintenanceScope;
    const monSelections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
    const pgSelections = type === "incidents" ? incidentPageSelections : maintenancePageSelections;
    const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";
    const pageKey = type === "incidents" ? "incident_pages" : "maintenance_pages";

    let monitors: string[] = [];
    let pages: string[] = [];

    if (scope === "specific") {
      pages = Object.entries(pgSelections).filter(([, v]) => v).map(([k]) => k);
      const coveredTags = new Set(availablePages.filter((p) => pages.includes(p.slug)).flatMap((p) => p.monitors.map((m) => m.tag)));
      monitors = Object.entries(monSelections).filter(([k, v]) => v && !coveredTags.has(k)).map(([k]) => k);
      if (pages.length === 0 && monitors.length === 0) {
        setError($t("subscribe.error.select_scope"));
        return;
      }
    }

    if (type === "incidents") savingIncidentScope = true;
    else savingMaintenanceScope = true;

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePreferences", token, [monitorKey]: monitors, [pageKey]: pages })
      });
      if (!response.ok) {
        setError($t("subscribe.error.save_scope_failed"));
      } else {
        trackEvent("subscribe_pref_toggled", { source: "subscribe_menu", type, scope });
      }
    } catch (_err) {
      setError($t("subscribe.error.network"));
    } finally {
      if (type === "incidents") savingIncidentScope = false;
      else savingMaintenanceScope = false;
    }
  }
</script>

{#if compact}
  <Button
    variant="outline"
    size="icon-sm"
    class="bg-background/80 dark:bg-background/70 border-foreground/10 rounded-full border shadow-none backdrop-blur-md"
    aria-label={$t("subscribe.btn_subscribe")}
    onclick={() => {
      open = true;
      trackEvent("subscribe_opened", { source: "theme_plus" });
    }}
  >
    <ICONS.Bell />
  </Button>
{:else}
  <Button
    variant="outline"
    size="sm"
    class="rounded-btn bg-background/80 dark:bg-background/70 border-foreground/10 border text-xs backdrop-blur-md"
    aria-label={$t("subscribe.btn_subscribe")}
    onclick={() => {
      open = true;
      trackEvent("subscribe_opened", { source: "theme_plus" });
    }}
  >
    <ICONS.Bell class="" />
    {$t("subscribe.btn_subscribe")}
  </Button>
{/if}

<Dialog.Root bind:open>
  <Dialog.Overlay class="backdrop-blur-[2px]" />
  <Dialog.Content class="max-w-sm rounded-3xl max-h-[90vh] overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <ICONS.Bell class="h-5 w-5" />
        {$t("subscribe.dialog_title")}
      </Dialog.Title>
      <Dialog.Description>
        {#if currentView === "login"}
          {$t("subscribe.desc_login")}
        {:else if currentView === "otp"}
          {$t("subscribe.desc_otp")}
        {:else if currentView === "preferences"}
          {$t("subscribe.desc_prefs")}
        {:else if currentView === "loading"}
          {$t("subscribe.loading")}
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="py-4">
      {#if currentView === "loading"}
        <div class="flex items-center justify-center py-8">
          <Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      {:else if currentView === "login"}
        <!-- Login View -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="email">{$t("subscribe.email_label")}</Label>
            <div class="relative">
              <Mail class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="email"
                type="email"
                placeholder={$t("account.signin.email_placeholder")}
                class="pl-10"
                bind:value={email}
                disabled={isSubmitting}
                onkeydown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </div>

          {#if errorMessage}
            <p class="text-destructive text-sm" role="alert">{errorMessage}</p>
          {/if}

          <Button onclick={handleLogin} disabled={isSubmitting} class="w-full">
            {#if isSubmitting}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {$t("subscribe.btn_sending")}
            {:else}
              {$t("subscribe.btn_continue")}
            {/if}
          </Button>
        </div>
      {:else if currentView === "otp"}
        <!-- OTP View -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col items-center gap-4">
            <p class="text-muted-foreground text-center text-sm">
              {$t("subscribe.code_sent_to")} <strong class="text-foreground">{email}</strong>
            </p>

            <InputOTP.Root maxlength={6} bind:value={otpValue}>
              {#snippet children({ cells })}
                <InputOTP.Group>
                  {#each cells as cell, i (i)}
                    <InputOTP.Slot {cell} />
                  {/each}
                </InputOTP.Group>
              {/snippet}
            </InputOTP.Root>
          </div>

          {#if errorMessage}
            <p class="text-destructive text-center text-sm" role="alert">{errorMessage}</p>
          {/if}

          <div class="flex gap-2">
            <Button variant="outline" onclick={handleBackToEmail} disabled={isSubmitting} class="flex-1">
              <ArrowLeft class="mr-2 h-4 w-4" />
              {$t("subscribe.btn_back")}
            </Button>
            <Button onclick={handleVerifyOTP} disabled={isSubmitting || otpValue.length !== 6} class="flex-1">
              {#if isSubmitting}
                <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {$t("subscribe.btn_verifying")}
              {:else}
                {$t("subscribe.btn_verify")}
              {/if}
            </Button>
          </div>

          <Button variant="link" onclick={handleLogin} disabled={isSubmitting} class="text-xs">
            {$t("subscribe.btn_resend")}
          </Button>
        </div>
      {:else if currentView === "preferences"}
        <!-- Preferences View -->
        <div class="flex flex-col gap-6">
          <div class="rounded-lg border p-4">
            <div class="flex items-center justify-between gap-2">
              <div class="flex gap-2">
                <Mail class="text-muted-foreground h-4 w-4" />
                <span class="text-sm font-medium">{subscriberEmail}</span>
              </div>
              {#if !isAccountLinked}
                <Button variant="ghost" size="icon-sm" onclick={handleLogout} class="rounded-btn" aria-label={$t("subscribe.btn_logout")}>
                  <LogOut class="h-4 w-4" aria-hidden="true" />
                </Button>
              {/if}
            </div>
          </div>

          <div class="flex flex-col gap-4">
            {#if availableSubscriptions.incidents}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <AlertTriangle class="h-5 w-5 text-orange-500" />
                    <div>
                      <Label for="switch-incidents" class="font-medium">{$t("subscribe.incidents_label")}</Label>
                      <p class="text-muted-foreground text-xs">{$t("subscribe.incidents_desc")}</p>
                    </div>
                  </div>
                  <Switch
                    id="switch-incidents"
                    checked={incidentsEnabled}
                    disabled={togglingIncidents}
                    onCheckedChange={(value) => handlePreferenceChange("incidents", value)}
                  />
                </div>
                {#if incidentsEnabled && (availableMonitors.length > 0 || availablePages.length > 0)}
                  <div class="bg-muted/50 ml-8 space-y-3 rounded-md p-3">
                    <p class="text-muted-foreground text-xs font-medium">{$t("subscribe.scope.notify_about")}</p>
                    <div class="flex flex-col gap-1">
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="incident-scope" value="all" bind:group={incidentScope} />
                        {$t("subscribe.scope.all_monitors")}
                      </label>
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="incident-scope" value="specific" bind:group={incidentScope} />
                        {$t("subscribe.scope.specific")}
                      </label>
                    </div>
                    {#if incidentScope === "specific"}
                      <div class="ml-4 flex max-h-48 flex-col gap-2 overflow-y-auto pt-1">
                        {#if availablePages.length === 0}
                          {#each availableMonitors as mon (mon.tag)}
                            <label class="flex cursor-pointer items-center gap-2 text-sm">
                              <input type="checkbox" bind:checked={incidentMonitorSelections[mon.tag]} />
                              {mon.name}
                            </label>
                          {/each}
                        {:else}
                        {#each availablePages as pageOpt (pageOpt.slug)}
                          <div class="space-y-1">
                            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                              <input type="checkbox" bind:checked={incidentPageSelections[pageOpt.slug]} />
                              <span class="text-muted-foreground text-xs">[{pageOpt.name}]</span>
                            </label>
                            {#if !incidentPageSelections[pageOpt.slug]}
                              {#each pageOpt.monitors as mon (mon.tag)}
                                <label class="ml-5 flex cursor-pointer items-center gap-2 text-sm">
                                  <input type="checkbox" bind:checked={incidentMonitorSelections[mon.tag]} />
                                  {mon.name}
                                </label>
                              {/each}
                            {:else}
                              {#each pageOpt.monitors as mon (mon.tag)}
                                <label class="text-muted-foreground ml-5 flex items-center gap-2 text-sm">
                                  <input type="checkbox" disabled checked />
                                  {mon.name}
                                </label>
                              {/each}
                            {/if}
                          </div>
                        {/each}
                        {/if}
                      </div>
                    {/if}
                    {#if incidentScopeError}
                      <p class="text-destructive text-xs" role="alert">{incidentScopeError}</p>
                    {/if}
                    <Button size="sm" class="w-full" onclick={() => saveMonitorScope("incidents")} disabled={savingIncidentScope}>
                      {#if savingIncidentScope}
                        <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                      {:else}
                        <SaveIcon class="mr-2 h-3 w-3" />
                      {/if}
                      {$t("manage.common.save")}
                    </Button>
                  </div>
                {/if}
              </div>
            {/if}

            {#if availableSubscriptions.maintenances}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Wrench class="h-5 w-5 text-blue-500" />
                    <div>
                      <Label for="switch-maintenances" class="font-medium">{$t("subscribe.maintenance_label")}</Label>
                      <p class="text-muted-foreground text-xs">{$t("subscribe.maintenance_desc")}</p>
                    </div>
                  </div>
                  <Switch
                    id="switch-maintenances"
                    checked={maintenancesEnabled}
                    disabled={togglingMaintenances}
                    onCheckedChange={(value) => handlePreferenceChange("maintenances", value)}
                  />
                </div>
                {#if maintenancesEnabled && (availableMonitors.length > 0 || availablePages.length > 0)}
                  <div class="bg-muted/50 ml-8 space-y-3 rounded-md p-3">
                    <p class="text-muted-foreground text-xs font-medium">{$t("subscribe.scope.notify_about")}</p>
                    <div class="flex flex-col gap-1">
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="maintenance-scope" value="all" bind:group={maintenanceScope} />
                        {$t("subscribe.scope.all_monitors")}
                      </label>
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="maintenance-scope" value="specific" bind:group={maintenanceScope} />
                        {$t("subscribe.scope.specific")}
                      </label>
                    </div>
                    {#if maintenanceScope === "specific"}
                      <div class="ml-4 flex max-h-48 flex-col gap-2 overflow-y-auto pt-1">
                        {#if availablePages.length === 0}
                          {#each availableMonitors as mon (mon.tag)}
                            <label class="flex cursor-pointer items-center gap-2 text-sm">
                              <input type="checkbox" bind:checked={maintenanceMonitorSelections[mon.tag]} />
                              {mon.name}
                            </label>
                          {/each}
                        {:else}
                        {#each availablePages as pageOpt (pageOpt.slug)}
                          <div class="space-y-1">
                            <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                              <input type="checkbox" bind:checked={maintenancePageSelections[pageOpt.slug]} />
                              <span class="text-muted-foreground text-xs">[{pageOpt.name}]</span>
                            </label>
                            {#if !maintenancePageSelections[pageOpt.slug]}
                              {#each pageOpt.monitors as mon (mon.tag)}
                                <label class="ml-5 flex cursor-pointer items-center gap-2 text-sm">
                                  <input type="checkbox" bind:checked={maintenanceMonitorSelections[mon.tag]} />
                                  {mon.name}
                                </label>
                              {/each}
                            {:else}
                              {#each pageOpt.monitors as mon (mon.tag)}
                                <label class="text-muted-foreground ml-5 flex items-center gap-2 text-sm">
                                  <input type="checkbox" disabled checked />
                                  {mon.name}
                                </label>
                              {/each}
                            {/if}
                          </div>
                        {/each}
                        {/if}
                      </div>
                    {/if}
                    {#if maintenanceScopeError}
                      <p class="text-destructive text-xs" role="alert">{maintenanceScopeError}</p>
                    {/if}
                    <Button size="sm" class="w-full" onclick={() => saveMonitorScope("maintenances")} disabled={savingMaintenanceScope}>
                      {#if savingMaintenanceScope}
                        <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                      {:else}
                        <SaveIcon class="mr-2 h-3 w-3" />
                      {/if}
                      {$t("manage.common.save")}
                    </Button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          {#if errorMessage}
            <p class="text-destructive text-sm" role="alert">{errorMessage}</p>
          {/if}
        </div>
      {:else if currentView === "error"}
        <div class="flex flex-col items-center gap-4 py-8">
          <p class="text-destructive text-sm" role="alert">{errorMessage || $t("subscribe.error.generic")}</p>
          {#if !isAccountLinked}
            <Button variant="outline" size="sm" onclick={initDialog}>
              {$t("subscribe.error.retry")}
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
