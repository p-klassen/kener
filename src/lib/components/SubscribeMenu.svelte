<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as InputOTP from "$lib/components/ui/input-otp/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";

  import Mail from "@lucide/svelte/icons/mail";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import Bell from "@lucide/svelte/icons/bell";
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

  // Monitor scope state
  let availableMonitors = $state<{ tag: string; name: string }[]>([]);
  let incidentScope = $state<"all" | "specific">("all");
  let incidentMonitorSelections = $state<Record<string, boolean>>({});
  let maintenanceScope = $state<"all" | "specific">("all");
  let maintenanceMonitorSelections = $state<Record<string, boolean>>({});
  let incidentScopeError = $state("");
  let maintenanceScopeError = $state("");
  let savingIncidentScope = $state(false);
  let savingMaintenanceScope = $state(false);

  $effect(() => {
    if (open) {
      checkExistingToken();
    }
  });

  async function checkExistingToken() {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      currentView = "login";
      return;
    }

    currentView = "loading";
    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPreferences", token })
      });

      if (!response.ok) {
        localStorage.removeItem(STORAGE_KEY);
        currentView = "login";
        return;
      }

      const data = await response.json();
      subscriberEmail = data.email || "";
      incidentsEnabled = data.subscriptions?.incidents || false;
      maintenancesEnabled = data.subscriptions?.maintenances || false;
      availableSubscriptions = data.availableSubscriptions || { incidents: false, maintenances: false };

      // Fetch monitors then initialize scope state
      await fetchAvailableMonitors();
      const incMons: string[] = data.incident_monitors || [];
      const mntMons: string[] = data.maintenance_monitors || [];
      incidentScope = incMons.length > 0 ? "specific" : "all";
      maintenanceScope = mntMons.length > 0 ? "specific" : "all";
      const initSelections = (tags: string[]) =>
        Object.fromEntries(availableMonitors.map((m) => [m.tag, tags.includes(m.tag)]));
      incidentMonitorSelections = initSelections(incMons);
      maintenanceMonitorSelections = initSelections(mntMons);

      currentView = "preferences";
    } catch (_err) {
      localStorage.removeItem(STORAGE_KEY);
      currentView = "login";
    }
  }

  async function handleLogin() {
    if (!email.trim()) {
      errorMessage = $t("Please enter a valid email address");
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
        const data = await response.json();
        errorMessage = $t("Failed to send verification code");
        return;
      }

      trackEvent("subscribe_login_sent", { source: "subscribe_menu" });

      currentView = "otp";
      otpValue = "";
    } catch (err) {
      errorMessage = $t("Network error. Please try again.");
    } finally {
      isSubmitting = false;
    }
  }

  async function handleVerifyOTP() {
    if (otpValue.length !== 6) {
      errorMessage = $t("Please enter the 6-digit verification code");
      return;
    }

    isSubmitting = true;
    errorMessage = "";

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: email.trim(), code: otpValue })
      });

      if (!response.ok) {
        const data = await response.json();
        errorMessage = $t("Verification failed");
        return;
      }

      const data = await response.json();
      localStorage.setItem(STORAGE_KEY, data.token);
      trackEvent("subscribe_otp_verified", { source: "subscribe_menu" });
      await checkExistingToken();
    } catch (err) {
      errorMessage = $t("Network error. Please try again.");
    } finally {
      isSubmitting = false;
    }
  }

  async function handlePreferenceChange(type: "incidents" | "maintenances", value: boolean) {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) { currentView = "login"; return; }

    // Only include monitor scope when disabling — enabling defers scope to the picker
    const body: Record<string, unknown> = { action: "updatePreferences", token, [type]: value };
    if (!value) {
      const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";
      const scope = type === "incidents" ? incidentScope : maintenanceScope;
      const selections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
      body[monitorKey] = scope === "specific"
        ? Object.entries(selections).filter(([, v]) => v).map(([k]) => k)
        : [];
    }

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        errorMessage = $t("Failed to update preference");
        if (type === "incidents") incidentsEnabled = !value;
        else maintenancesEnabled = !value;
        return;
      }

      if (type === "incidents") incidentsEnabled = value;
      else maintenancesEnabled = value;

      trackEvent("subscribe_pref_toggled", { source: "subscribe_menu", type, value });
    } catch (_err) {
      errorMessage = $t("Network error. Please try again.");
      if (type === "incidents") incidentsEnabled = !value;
      else maintenancesEnabled = !value;
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
    incidentScope = "all";
    incidentMonitorSelections = {};
    maintenanceScope = "all";
    maintenanceMonitorSelections = {};
    incidentScopeError = "";
    maintenanceScopeError = "";
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
      }
    } catch (_err) {
      // scope picker simply won't show monitor list
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
    const selections = type === "incidents" ? incidentMonitorSelections : maintenanceMonitorSelections;
    const monitorKey = type === "incidents" ? "incident_monitors" : "maintenance_monitors";

    let monitors: string[] = [];
    if (scope === "specific") {
      monitors = Object.entries(selections).filter(([, v]) => v).map(([k]) => k);
      if (monitors.length === 0) {
        setError($t("Select at least one monitor"));
        return;
      }
    }

    if (type === "incidents") savingIncidentScope = true;
    else savingMaintenanceScope = true;

    try {
      const response = await fetch(clientResolver(resolve, "/dashboard-apis/subscription"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updatePreferences", token, [monitorKey]: monitors })
      });
      if (!response.ok) {
        setError($t("Failed to save scope"));
      } else {
        trackEvent("subscribe_pref_toggled", { source: "subscribe_menu", type, scope });
      }
    } catch (_err) {
      setError($t("Network error. Please try again."));
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
    aria-label={$t("Subscribe")}
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
    aria-label="Subscribe"
    onclick={() => {
      open = true;
      trackEvent("subscribe_opened", { source: "theme_plus" });
    }}
  >
    <ICONS.Bell class="" />
    {$t("Subscribe")}
  </Button>
{/if}

<Dialog.Root bind:open>
  <Dialog.Overlay class="backdrop-blur-[2px]" />
  <Dialog.Content class="max-w-sm rounded-3xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Bell class="h-5 w-5" />
        {$t("Subscribe to Updates")}
      </Dialog.Title>
      <Dialog.Description>
        {#if currentView === "login"}
          {$t("Get notified about incidents and scheduled maintenance.")}
        {:else if currentView === "otp"}
          {$t("Enter the verification code sent to your email.")}
        {:else if currentView === "preferences"}
          {$t("Manage your notification preferences.")}
        {:else if currentView === "loading"}
          {$t("Loading your preferences...")}
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
            <Label for="email">{$t("Email address")}</Label>
            <div class="relative">
              <Mail class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                class="pl-10"
                bind:value={email}
                disabled={isSubmitting}
                onkeydown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </div>

          {#if errorMessage}
            <p class="text-destructive text-sm">{errorMessage}</p>
          {/if}

          <Button onclick={handleLogin} disabled={isSubmitting} class="w-full">
            {#if isSubmitting}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              {$t("Sending...")}
            {:else}
              {$t("Continue")}
            {/if}
          </Button>
        </div>
      {:else if currentView === "otp"}
        <!-- OTP View -->
        <div class="flex flex-col gap-4">
          <div class="flex flex-col items-center gap-4">
            <p class="text-muted-foreground text-center text-sm">
              {$t("We sent a 6-digit code to")} <strong class="text-foreground">{email}</strong>
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
            <p class="text-destructive text-center text-sm">{errorMessage}</p>
          {/if}

          <div class="flex gap-2">
            <Button variant="outline" onclick={handleBackToEmail} disabled={isSubmitting} class="flex-1">
              <ArrowLeft class="mr-2 h-4 w-4" />
              {$t("Back")}
            </Button>
            <Button onclick={handleVerifyOTP} disabled={isSubmitting || otpValue.length !== 6} class="flex-1">
              {#if isSubmitting}
                <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {$t("Verifying")}...
              {:else}
                {$t("Verify")}
              {/if}
            </Button>
          </div>

          <Button variant="link" onclick={handleLogin} disabled={isSubmitting} class="text-xs">
            {$t("Didn't receive the code? Resend")}
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
              <Button variant="ghost" size="icon-sm" onclick={handleLogout} class="rounded-btn">
                <LogOut class="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div class="flex flex-col gap-4">
            {#if availableSubscriptions.incidents}
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <AlertTriangle class="h-5 w-5 text-orange-500" />
                    <div>
                      <Label class="font-medium">{$t("Incident Updates")}</Label>
                      <p class="text-muted-foreground text-xs">{$t("Get notified about incidents updates")}</p>
                    </div>
                  </div>
                  <Switch
                    checked={incidentsEnabled}
                    onCheckedChange={(value) => handlePreferenceChange("incidents", value)}
                  />
                </div>
                {#if incidentsEnabled && availableMonitors.length > 0}
                  <div class="bg-muted/50 ml-8 space-y-3 rounded-md p-3">
                    <p class="text-muted-foreground text-xs font-medium">{$t("Notify me about:")}</p>
                    <div class="flex flex-col gap-1">
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="incident-scope" value="all" bind:group={incidentScope} />
                        {$t("All monitors")}
                      </label>
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="incident-scope" value="specific" bind:group={incidentScope} />
                        {$t("Specific monitors")}
                      </label>
                    </div>
                    {#if incidentScope === "specific"}
                      <div class="ml-4 flex flex-col gap-1 pt-1">
                        {#each availableMonitors as monitor (monitor.tag)}
                          <label class="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" bind:checked={incidentMonitorSelections[monitor.tag]} />
                            {monitor.name}
                          </label>
                        {/each}
                      </div>
                    {/if}
                    {#if incidentScopeError}
                      <p class="text-destructive text-xs">{incidentScopeError}</p>
                    {/if}
                    <Button size="sm" class="w-full" onclick={() => saveMonitorScope("incidents")} disabled={savingIncidentScope}>
                      {#if savingIncidentScope}
                        <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                      {/if}
                      {$t("Save")}
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
                      <Label class="font-medium">{$t("Maintenance Updates")}</Label>
                      <p class="text-muted-foreground text-xs">{$t("Get notified about scheduled maintenance")}</p>
                    </div>
                  </div>
                  <Switch
                    checked={maintenancesEnabled}
                    onCheckedChange={(value) => handlePreferenceChange("maintenances", value)}
                  />
                </div>
                {#if maintenancesEnabled && availableMonitors.length > 0}
                  <div class="bg-muted/50 ml-8 space-y-3 rounded-md p-3">
                    <p class="text-muted-foreground text-xs font-medium">{$t("Notify me about:")}</p>
                    <div class="flex flex-col gap-1">
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="maintenance-scope" value="all" bind:group={maintenanceScope} />
                        {$t("All monitors")}
                      </label>
                      <label class="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" name="maintenance-scope" value="specific" bind:group={maintenanceScope} />
                        {$t("Specific monitors")}
                      </label>
                    </div>
                    {#if maintenanceScope === "specific"}
                      <div class="ml-4 flex flex-col gap-1 pt-1">
                        {#each availableMonitors as monitor (monitor.tag)}
                          <label class="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" bind:checked={maintenanceMonitorSelections[monitor.tag]} />
                            {monitor.name}
                          </label>
                        {/each}
                      </div>
                    {/if}
                    {#if maintenanceScopeError}
                      <p class="text-destructive text-xs">{maintenanceScopeError}</p>
                    {/if}
                    <Button size="sm" class="w-full" onclick={() => saveMonitorScope("maintenances")} disabled={savingMaintenanceScope}>
                      {#if savingMaintenanceScope}
                        <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                      {/if}
                      {$t("Save")}
                    </Button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          {#if errorMessage}
            <p class="text-destructive text-sm">{errorMessage}</p>
          {/if}
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
