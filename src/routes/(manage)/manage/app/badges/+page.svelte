<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Spinner } from "$lib/components/ui/spinner/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import ColorPicker from "svelte-awesome-color-picker";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import type { MonitorRecord } from "$lib/server/types/db.js";
  import { BADGE_STYLES, type BadgeStyle } from "$lib/global-constants.js";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  import { availableLocalesList } from "$lib/stores/i18n";

  interface PageRecord {
    id: number;
    page_path: string;
    page_title: string;
  }

  let monitors = $state<MonitorRecord[]>([]);
  let pages = $state<PageRecord[]>([]);
  let activatedLocales = $state<{ code: string; name: string }[]>([]);
  let loading = $state(true);

  // Target: monitor or page
  let badgeTarget = $state<"monitor" | "page">("monitor");

  // Monitor badge config
  let badgeConfig = $state({
    tag: "",
    badgeType: "status" as "status" | "uptime" | "latency",
    sinceLast: 7776000,
    hideDuration: false,
    label: "",
    labelColor: "#555",
    color: "#0079FF",
    style: "flat" as BadgeStyle,
    metric: "average" as "average" | "maximum" | "minimum",
    locale: ""
  });

  // Page badge config
  let pageBadgeConfig = $state({
    pagePath: "",
    badgeType: "status" as "status" | "uptime",
    downMin: 1,
    degradedMin: 1,
    sinceLast: 7776000,
    hideDuration: false,
    label: "",
    labelColor: "#555",
    color: "#0079FF",
    style: "flat" as BadgeStyle,
    locale: ""
  });

  let previewKey = $state(0);

  const durationPresets = [
    { label: "1 Hour", value: 3600 },
    { label: "24 Hours", value: 86400 },
    { label: "7 Days", value: 604800 },
    { label: "30 Days", value: 2592000 },
    { label: "90 Days", value: 7776000 }
  ];

  let domain = $state("");
  let protocol = $state("");

  // Monitor badge URL
  const badgeUrl = $derived.by(() => {
    if (!badgeConfig.tag) return "";
    const baseUrl =
      `${protocol}//${domain}` + clientResolver(resolve, `/badge/${badgeConfig.tag}/${badgeConfig.badgeType}`);
    const params = new URLSearchParams();
    if (badgeConfig.badgeType !== "status") {
      if (badgeConfig.sinceLast !== 7776000) params.set("sinceLast", badgeConfig.sinceLast.toString());
      if (badgeConfig.hideDuration) params.set("hideDuration", "true");
    }
    if (badgeConfig.badgeType === "latency" && badgeConfig.metric !== "average") params.set("metric", badgeConfig.metric);
    if (badgeConfig.label) params.set("label", badgeConfig.label);
    if (badgeConfig.labelColor && badgeConfig.labelColor !== "#555") params.set("labelColor", badgeConfig.labelColor.replace("#", ""));
    if (badgeConfig.color && badgeConfig.color !== "#0079FF") params.set("color", badgeConfig.color.replace("#", ""));
    if (badgeConfig.style !== "flat") params.set("style", badgeConfig.style);
    if (badgeConfig.badgeType === "status" && badgeConfig.locale) params.set("locale", badgeConfig.locale);
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  });

  const markdownSnippet = $derived.by(() => {
    if (!badgeUrl) return "";
    const monitor = monitors.find((m) => m.tag === badgeConfig.tag);
    const altText = monitor ? `${monitor.name} ${badgeConfig.badgeType}` : badgeConfig.badgeType;
    return `![${altText}](${badgeUrl})`;
  });

  const htmlSnippet = $derived.by(() => {
    if (!badgeUrl) return "";
    const monitor = monitors.find((m) => m.tag === badgeConfig.tag);
    const altText = monitor ? `${monitor.name} ${badgeConfig.badgeType}` : badgeConfig.badgeType;
    return `<img src="${badgeUrl}" alt="${altText}" />`;
  });

  // Page badge URL
  const pageBadgeUrl = $derived.by(() => {
    if (!pageBadgeConfig.pagePath && pageBadgeConfig.pagePath !== "") return "";
    if (badgeTarget !== "page") return "";
    const pathSegment = pageBadgeConfig.pagePath === "" ? "_root_" : pageBadgeConfig.pagePath;
    const baseUrl =
      `${protocol}//${domain}` + clientResolver(resolve, `/badge/page/${pathSegment}/${pageBadgeConfig.badgeType}`);
    const params = new URLSearchParams();
    if (pageBadgeConfig.badgeType === "status") {
      if (pageBadgeConfig.downMin !== 1) params.set("downMin", pageBadgeConfig.downMin.toString());
      if (pageBadgeConfig.degradedMin !== 1) params.set("degradedMin", pageBadgeConfig.degradedMin.toString());
      if (pageBadgeConfig.locale) params.set("locale", pageBadgeConfig.locale);
    } else {
      if (pageBadgeConfig.sinceLast !== 7776000) params.set("sinceLast", pageBadgeConfig.sinceLast.toString());
      if (pageBadgeConfig.hideDuration) params.set("hideDuration", "true");
    }
    if (pageBadgeConfig.label) params.set("label", pageBadgeConfig.label);
    if (pageBadgeConfig.labelColor && pageBadgeConfig.labelColor !== "#555") params.set("labelColor", pageBadgeConfig.labelColor.replace("#", ""));
    if (pageBadgeConfig.color && pageBadgeConfig.color !== "#0079FF") params.set("color", pageBadgeConfig.color.replace("#", ""));
    if (pageBadgeConfig.style !== "flat") params.set("style", pageBadgeConfig.style);
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  });

  // Whether a page is selected (pagePath is set — empty string is valid for root page)
  let pageSelected = $derived(badgeTarget === "page" && pages.some((p) => p.page_path === pageBadgeConfig.pagePath));

  const pageMarkdownSnippet = $derived.by(() => {
    if (!pageBadgeUrl) return "";
    const pg = pages.find((p) => p.page_path === pageBadgeConfig.pagePath);
    const altText = pg ? `${pg.page_title} ${pageBadgeConfig.badgeType}` : pageBadgeConfig.badgeType;
    return `![${altText}](${pageBadgeUrl})`;
  });

  const pageHtmlSnippet = $derived.by(() => {
    if (!pageBadgeUrl) return "";
    const pg = pages.find((p) => p.page_path === pageBadgeConfig.pagePath);
    const altText = pg ? `${pg.page_title} ${pageBadgeConfig.badgeType}` : pageBadgeConfig.badgeType;
    return `<img src="${pageBadgeUrl}" alt="${altText}" />`;
  });

  function refreshPreview() {
    previewKey++;
  }

  async function fetchMonitors() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getMonitors", data: { status: "ACTIVE" } })
      });
      const result = await response.json();
      if (!result.error) {
        monitors = result;
        if (monitors.length > 0) badgeConfig.tag = "_";
      }
    } catch {
      // ignore
    }
  }

  async function fetchPages() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getPages", data: {} })
      });
      const result = await response.json();
      if (!result.error) {
        pages = result;
        if (pages.length > 0) {
          pageBadgeConfig.pagePath = pages[0].page_path;
        }
      }
    } catch {
      // ignore
    }
  }

  async function fetchActivatedLocales() {
    try {
      const response = await fetch(clientResolver(resolve, "/manage/api"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getAllSiteData" })
      });
      const result = await response.json();
      if (!result.error && result.i18n?.locales) {
        const selectedCodes = new Set(
          result.i18n.locales.filter((l: { selected: boolean }) => l.selected).map((l: { code: string }) => l.code)
        );
        activatedLocales = availableLocalesList.filter((l) => selectedCodes.has(l.code));
      }
    } catch {
      // ignore
    }
  }

  onMount(async () => {
    protocol = window.location.protocol;
    domain = window.location.host;
    loading = true;
    await Promise.all([fetchMonitors(), fetchPages(), fetchActivatedLocales()]);
    loading = false;
  });
</script>

<div class="flex w-full flex-col gap-4 p-4">
  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Spinner class="size-8" />
    </div>
  {:else}
    <div class="flex flex-col gap-6">
      <Card.Root>
        <Card.Header>
          <Card.Title>Badge Generator</Card.Title>
          <Card.Description>
            Create a customizable badge to display the status or uptime of your monitors or pages
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <!-- Target toggle -->
          <Tabs.Root
            value={badgeTarget}
            onValueChange={(v) => {
              if (v === "monitor" || v === "page") badgeTarget = v;
              previewKey++;
            }}
            class="mb-6"
          >
            <Tabs.List>
              <Tabs.Trigger value="monitor">Monitor</Tabs.Trigger>
              <Tabs.Trigger value="page">Page</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>

          <div class="grid grid-cols-2 gap-4">
            <!-- Left column: config -->
            <div class="flex flex-col gap-4 border-r pr-4">

              {#if badgeTarget === "monitor"}
                <!-- Monitor selector -->
                <div class="flex flex-col gap-2">
                  <Label for="monitor-select">Monitor</Label>
                  <Select.Root
                    type="single"
                    value={badgeConfig.tag}
                    onValueChange={(v) => { if (v) badgeConfig.tag = v; }}
                  >
                    <Select.Trigger id="monitor-select" class="w-full">
                      {badgeConfig.tag === "_"
                        ? "All Monitors"
                        : monitors.find((m) => m.tag === badgeConfig.tag)?.name || "Select a monitor"}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="_">All Monitors</Select.Item>
                      {#each monitors as monitor (monitor.tag)}
                        <Select.Item value={monitor.tag}>{monitor.name}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                <!-- Badge Type (monitor) -->
                <div class="flex flex-col gap-2">
                  <Label for="badge-type">Badge Type</Label>
                  <Select.Root
                    type="single"
                    value={badgeConfig.badgeType}
                    onValueChange={(v) => { if (v) badgeConfig.badgeType = v as "status" | "uptime" | "latency"; }}
                  >
                    <Select.Trigger id="badge-type" class="w-full capitalize">
                      {badgeConfig.badgeType}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="status">Status</Select.Item>
                      <Select.Item value="uptime">Uptime</Select.Item>
                      <Select.Item value="latency">Latency</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <p class="text-muted-foreground text-xs">
                    {#if badgeConfig.badgeType === "status"}
                      Shows current real-time status (UP, DOWN, DEGRADED)
                    {:else if badgeConfig.badgeType === "uptime"}
                      Shows uptime percentage over a time period
                    {:else}
                      Shows latency over a time period
                    {/if}
                  </p>
                </div>

                <!-- Locale (status only) -->
                {#if badgeConfig.badgeType === "status" && activatedLocales.length > 0}
                  <div class="flex flex-col gap-2">
                    <Label for="badge-locale">Language</Label>
                    <Select.Root
                      type="single"
                      value={badgeConfig.locale || "en"}
                      onValueChange={(v) => { if (v) badgeConfig.locale = v === "en" ? "" : v; }}
                    >
                      <Select.Trigger id="badge-locale" class="w-full">
                        {activatedLocales.find((l) => l.code === (badgeConfig.locale || "en"))?.name || "English"}
                      </Select.Trigger>
                      <Select.Content>
                        {#each activatedLocales as locale (locale.code)}
                          <Select.Item value={locale.code}>{locale.name}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                    <p class="text-muted-foreground text-xs">Status text will be shown in the selected language</p>
                  </div>
                {/if}

                <!-- Duration (uptime/latency) -->
                {#if badgeConfig.badgeType !== "status"}
                  <div class="flex flex-col gap-2">
                    <Label for="duration">Time Period</Label>
                    <Select.Root
                      type="single"
                      value={badgeConfig.sinceLast.toString()}
                      onValueChange={(v) => { if (v) badgeConfig.sinceLast = parseInt(v); }}
                    >
                      <Select.Trigger id="duration" class="w-full">
                        {durationPresets.find((d) => d.value === badgeConfig.sinceLast)?.label || "Custom"}
                      </Select.Trigger>
                      <Select.Content>
                        {#each durationPresets as preset (preset.value)}
                          <Select.Item value={preset.value.toString()}>{preset.label}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="space-y-0.5">
                      <Label for="hide-duration">Hide Duration</Label>
                      <p class="text-muted-foreground text-xs">Don't show the time period on the badge</p>
                    </div>
                    <Switch
                      id="hide-duration"
                      checked={badgeConfig.hideDuration}
                      onCheckedChange={(checked) => (badgeConfig.hideDuration = checked)}
                    />
                  </div>
                {/if}

                <!-- Latency metric -->
                {#if badgeConfig.badgeType === "latency"}
                  <div class="flex flex-col gap-2">
                    <Label for="latency-metric">Latency Metric</Label>
                    <Select.Root
                      type="single"
                      value={badgeConfig.metric}
                      onValueChange={(v) => { if (v) badgeConfig.metric = v as "average" | "maximum" | "minimum"; }}
                    >
                      <Select.Trigger id="latency-metric" class="w-full capitalize">
                        {badgeConfig.metric === "average" ? "Average" : badgeConfig.metric === "maximum" ? "Maximum" : "Minimum"}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="average">Average</Select.Item>
                        <Select.Item value="maximum">Maximum</Select.Item>
                        <Select.Item value="minimum">Minimum</Select.Item>
                      </Select.Content>
                    </Select.Root>
                    <p class="text-muted-foreground text-xs">Select which latency metric to display on the badge</p>
                  </div>
                {/if}

                <!-- Badge Style (monitor) -->
                <div class="flex flex-col gap-2">
                  <Label for="badge-style">Style</Label>
                  <Select.Root
                    type="single"
                    value={badgeConfig.style}
                    onValueChange={(v) => { if (v) badgeConfig.style = v as BadgeStyle; }}
                  >
                    <Select.Trigger id="badge-style" class="w-full capitalize">{badgeConfig.style}</Select.Trigger>
                    <Select.Content>
                      {#each BADGE_STYLES as style (style)}
                        <Select.Item value={style} class="capitalize">{style}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                <!-- Custom Label (monitor) -->
                <div class="flex flex-col gap-2">
                  <Label for="custom-label">Custom Label</Label>
                  <Input id="custom-label" bind:value={badgeConfig.label} placeholder="Leave empty to use monitor name" />
                </div>

                <!-- Colors (monitor) -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-2">
                    <Label>Label Color</Label>
                    <div class="flex items-center gap-2">
                      <ColorPicker bind:hex={badgeConfig.labelColor} label="" --picker-width="150px" --picker-height="150px" />
                      <Input bind:value={badgeConfig.labelColor} class="w-24 font-mono text-xs" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <Label>Badge Color</Label>
                    <div class="flex items-center gap-2">
                      <ColorPicker bind:hex={badgeConfig.color} label="" --picker-width="150px" --picker-height="150px" />
                      <Input bind:value={badgeConfig.color} class="w-24 font-mono text-xs" />
                    </div>
                  </div>
                </div>

              {:else}
                <!-- Page selector -->
                <div class="flex flex-col gap-2">
                  <Label for="page-select">Page</Label>
                  <Select.Root
                    type="single"
                    value={pageBadgeConfig.pagePath}
                    onValueChange={(v) => { if (v !== undefined) pageBadgeConfig.pagePath = v; }}
                  >
                    <Select.Trigger id="page-select" class="w-full">
                      {pages.find((p) => p.page_path === pageBadgeConfig.pagePath)?.page_title || "Select a page"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each pages as page (page.id)}
                        <Select.Item value={page.page_path}>
                          {page.page_title}{page.page_path === "" ? " (Root)" : ""}
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                <!-- Badge Type (page) -->
                <div class="flex flex-col gap-2">
                  <Label for="page-badge-type">Badge Type</Label>
                  <Select.Root
                    type="single"
                    value={pageBadgeConfig.badgeType}
                    onValueChange={(v) => { if (v) pageBadgeConfig.badgeType = v as "status" | "uptime"; }}
                  >
                    <Select.Trigger id="page-badge-type" class="w-full capitalize">
                      {pageBadgeConfig.badgeType}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="status">Status</Select.Item>
                      <Select.Item value="uptime">Uptime</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <p class="text-muted-foreground text-xs">
                    {#if pageBadgeConfig.badgeType === "status"}
                      Shows overall page status based on its monitors
                    {:else}
                      Shows aggregate uptime of all page monitors
                    {/if}
                  </p>
                </div>

                <!-- Status thresholds -->
                {#if pageBadgeConfig.badgeType === "status"}
                  <div class="flex flex-col gap-2">
                    <Label for="down-min">Down when ≥ X monitors are DOWN</Label>
                    <Input
                      id="down-min"
                      type="number"
                      min="1"
                      bind:value={pageBadgeConfig.downMin}
                      class="w-24"
                    />
                    <p class="text-muted-foreground text-xs">
                      Page status becomes DOWN when at least this many monitors are DOWN
                    </p>
                  </div>
                  <div class="flex flex-col gap-2">
                    <Label for="degraded-min">Degraded when ≥ X monitors are DEGRADED</Label>
                    <Input
                      id="degraded-min"
                      type="number"
                      min="1"
                      bind:value={pageBadgeConfig.degradedMin}
                      class="w-24"
                    />
                    <p class="text-muted-foreground text-xs">
                      Page status becomes DEGRADED when at least this many monitors are DEGRADED (and not already DOWN)
                    </p>
                  </div>

                  <!-- Locale for status -->
                  {#if activatedLocales.length > 0}
                    <div class="flex flex-col gap-2">
                      <Label for="page-badge-locale">Language</Label>
                      <Select.Root
                        type="single"
                        value={pageBadgeConfig.locale || "en"}
                        onValueChange={(v) => { if (v) pageBadgeConfig.locale = v === "en" ? "" : v; }}
                      >
                        <Select.Trigger id="page-badge-locale" class="w-full">
                          {activatedLocales.find((l) => l.code === (pageBadgeConfig.locale || "en"))?.name || "English"}
                        </Select.Trigger>
                        <Select.Content>
                          {#each activatedLocales as locale (locale.code)}
                            <Select.Item value={locale.code}>{locale.name}</Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </div>
                  {/if}
                {/if}

                <!-- Duration for uptime -->
                {#if pageBadgeConfig.badgeType === "uptime"}
                  <div class="flex flex-col gap-2">
                    <Label for="page-duration">Time Period</Label>
                    <Select.Root
                      type="single"
                      value={pageBadgeConfig.sinceLast.toString()}
                      onValueChange={(v) => { if (v) pageBadgeConfig.sinceLast = parseInt(v); }}
                    >
                      <Select.Trigger id="page-duration" class="w-full">
                        {durationPresets.find((d) => d.value === pageBadgeConfig.sinceLast)?.label || "Custom"}
                      </Select.Trigger>
                      <Select.Content>
                        {#each durationPresets as preset (preset.value)}
                          <Select.Item value={preset.value.toString()}>{preset.label}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="space-y-0.5">
                      <Label for="page-hide-duration">Hide Duration</Label>
                      <p class="text-muted-foreground text-xs">Don't show the time period on the badge</p>
                    </div>
                    <Switch
                      id="page-hide-duration"
                      checked={pageBadgeConfig.hideDuration}
                      onCheckedChange={(checked) => (pageBadgeConfig.hideDuration = checked)}
                    />
                  </div>
                {/if}

                <!-- Badge Style (page) -->
                <div class="flex flex-col gap-2">
                  <Label for="page-badge-style">Style</Label>
                  <Select.Root
                    type="single"
                    value={pageBadgeConfig.style}
                    onValueChange={(v) => { if (v) pageBadgeConfig.style = v as BadgeStyle; }}
                  >
                    <Select.Trigger id="page-badge-style" class="w-full capitalize">{pageBadgeConfig.style}</Select.Trigger>
                    <Select.Content>
                      {#each BADGE_STYLES as style (style)}
                        <Select.Item value={style} class="capitalize">{style}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>

                <!-- Custom Label (page) -->
                <div class="flex flex-col gap-2">
                  <Label for="page-custom-label">Custom Label</Label>
                  <Input id="page-custom-label" bind:value={pageBadgeConfig.label} placeholder="Leave empty to use page title" />
                </div>

                <!-- Colors (page) -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="flex flex-col gap-2">
                    <Label>Label Color</Label>
                    <div class="flex items-center gap-2">
                      <ColorPicker bind:hex={pageBadgeConfig.labelColor} label="" --picker-width="150px" --picker-height="150px" />
                      <Input bind:value={pageBadgeConfig.labelColor} class="w-24 font-mono text-xs" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <Label>Badge Color</Label>
                    <div class="flex items-center gap-2">
                      <ColorPicker bind:hex={pageBadgeConfig.color} label="" --picker-width="150px" --picker-height="150px" />
                      <Input bind:value={pageBadgeConfig.color} class="w-24 font-mono text-xs" />
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Right column: preview + snippets -->
            <div class="flex flex-col gap-4">
              {#if badgeTarget === "monitor"}
                {#if badgeConfig.tag}
                  <div>
                    <p class="flex items-center justify-between">
                      <span>Preview</span>
                      <Button variant="ghost" size="icon-sm" onclick={refreshPreview}>
                        <RefreshCwIcon class="size-4" />
                      </Button>
                    </p>
                    <p class="text-muted-foreground text-sm">See how your badge will look</p>
                  </div>
                  <div class="bg-muted/50 flex items-center justify-center rounded-lg border p-8">
                    {#key previewKey}
                      <img src={badgeUrl} alt="Badge preview" class="max-w-full" />
                    {/key}
                  </div>
                  <div class="space-y-2">
                    <Label>Badge URL</Label>
                    <div class="flex gap-2">
                      <Input value={badgeUrl} readonly class="font-mono text-xs" />
                      <CopyButton text={badgeUrl}><CopyIcon class="size-4" /></CopyButton>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label>Markdown</Label>
                    <div class="flex gap-2">
                      <Input value={markdownSnippet} readonly class="font-mono text-xs" />
                      <CopyButton text={markdownSnippet}><CopyIcon class="size-4" /></CopyButton>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label>HTML</Label>
                    <div class="flex gap-2">
                      <Input value={htmlSnippet} readonly class="font-mono text-xs" />
                      <CopyButton text={htmlSnippet}><CopyIcon class="size-4" /></CopyButton>
                    </div>
                  </div>
                {:else}
                  <div class="text-muted-foreground flex items-center justify-center py-12 text-center">
                    Select a monitor to preview the badge
                  </div>
                {/if}
              {:else}
                {#if pageSelected}
                  <div>
                    <p class="flex items-center justify-between">
                      <span>Preview</span>
                      <Button variant="ghost" size="icon-sm" onclick={refreshPreview}>
                        <RefreshCwIcon class="size-4" />
                      </Button>
                    </p>
                    <p class="text-muted-foreground text-sm">See how your badge will look</p>
                  </div>
                  <div class="bg-muted/50 flex items-center justify-center rounded-lg border p-8">
                    {#key previewKey}
                      <img src={pageBadgeUrl} alt="Badge preview" class="max-w-full" />
                    {/key}
                  </div>
                  <div class="space-y-2">
                    <Label>Badge URL</Label>
                    <div class="flex gap-2">
                      <Input value={pageBadgeUrl} readonly class="font-mono text-xs" />
                      <CopyButton text={pageBadgeUrl}><CopyIcon class="size-4" /></CopyButton>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label>Markdown</Label>
                    <div class="flex gap-2">
                      <Input value={pageMarkdownSnippet} readonly class="font-mono text-xs" />
                      <CopyButton text={pageMarkdownSnippet}><CopyIcon class="size-4" /></CopyButton>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label>HTML</Label>
                    <div class="flex gap-2">
                      <Input value={pageHtmlSnippet} readonly class="font-mono text-xs" />
                      <CopyButton text={pageHtmlSnippet}><CopyIcon class="size-4" /></CopyButton>
                    </div>
                  </div>
                {:else}
                  <div class="text-muted-foreground flex items-center justify-center py-12 text-center">
                    Select a page to preview the badge
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </div>
  {/if}
</div>
