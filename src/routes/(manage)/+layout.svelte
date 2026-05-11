<script lang="ts">
  import "../layout.css";
  import "../kener.css";
  import "../manage.css";
  import { ModeWatcher } from "mode-watcher";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import BlendIcon from "@lucide/svelte/icons/blend";
  import MailboxIcon from "@lucide/svelte/icons/mailbox";
  import AppSidebar from "./manage/app-sidebar.svelte";
  import Settings2Icon from "@lucide/svelte/icons/settings-2";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import SirenIcon from "@lucide/svelte/icons/siren";
  import BellIcon from "@lucide/svelte/icons/bell";
  import CodeIcon from "@lucide/svelte/icons/code";
  import ChartSplineIcon from "@lucide/svelte/icons/chart-spline";
  import CloudAlertIcon from "@lucide/svelte/icons/cloud-alert";
  import House from "@lucide/svelte/icons/house";
  import BadgeIcon from "@lucide/svelte/icons/id-card";
  import ClockAlertIcon from "@lucide/svelte/icons/clock-alert";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import KeyIcon from "@lucide/svelte/icons/key";
  import UserIcon from "@lucide/svelte/icons/user";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import UsersRoundIcon from "@lucide/svelte/icons/users-round";
  import Columns3CogIcon from "@lucide/svelte/icons/columns-3-cog";
  import SiteHeader from "./manage/site-header.svelte";
  import TemplateIcon from "@lucide/svelte/icons/layout-template";
  import MailSettingsIcon from "@lucide/svelte/icons/mail-open";
  import clientResolver from "$lib/client/resolver.js";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import ArrowLeftRightIcon from "@lucide/svelte/icons/arrow-left-right";
  import BookTextIcon from "@lucide/svelte/icons/book-text";
  import { t } from "$lib/stores/i18n";

  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { ROUTE_PERMISSION_MAP } from "$lib/allPerms.js";

  let { children, data } = $props();

  // Navigation items - single source of truth, reactive so titles update on locale change
  const allNavItems = $derived([
    { title: $t("manage.nav.site_configurations"), url: "/manage/app/site-configurations", icon: Settings2Icon },
    { title: $t("manage.nav.internationalization"), url: "/manage/app/internationalization", icon: GlobeIcon },
    { title: $t("manage.nav.customizations"), url: "/manage/app/customizations", icon: Columns3CogIcon },
    { title: $t("manage.nav.analytics_providers"), url: "/manage/app/analytics-providers", icon: ChartSplineIcon },
    { title: $t("manage.nav.pages"), url: "/manage/app/pages", icon: BookOpenIcon },
    { title: $t("manage.nav.monitors"), url: "/manage/app/monitors", icon: BlendIcon },
    { title: $t("manage.nav.monitoring_data"), url: "/manage/app/monitoring-data", icon: DatabaseIcon },
    { title: $t("manage.nav.incidents"), url: "/manage/app/incidents", icon: CloudAlertIcon },
    { title: $t("manage.nav.maintenances"), url: "/manage/app/maintenances", icon: ClockAlertIcon },
    { title: $t("manage.nav.alerts"), url: "/manage/app/alerts", icon: SirenIcon },
    { title: $t("manage.nav.subscriptions"), url: "/manage/app/subscriptions", icon: BellIcon },
    { title: $t("manage.nav.users"), url: "/manage/app/users", icon: UserIcon },
    { title: $t("manage.nav.groups"), url: "/manage/app/groups", icon: UsersRoundIcon },
    { title: $t("manage.nav.roles"), url: "/manage/app/roles", icon: ShieldIcon },
    { title: $t("manage.nav.triggers"), url: "/manage/app/triggers", icon: MailboxIcon },
    { title: $t("manage.nav.email_settings"), url: "/manage/app/email-settings", icon: MailSettingsIcon },
    { title: $t("manage.nav.templates"), url: "/manage/app/templates", icon: TemplateIcon },
    { title: $t("manage.nav.badges"), url: "/manage/app/badges", icon: BadgeIcon },
    { title: $t("manage.nav.embed"), url: "/manage/app/embed", icon: CodeIcon },
    { title: $t("manage.nav.api_keys"), url: "/manage/app/api-keys", icon: KeyIcon },
    { title: $t("manage.nav.export_import"), url: "/manage/app/export-import", icon: ArrowLeftRightIcon },
    { title: $t("manage.nav.api_docs"), url: "/manage/app/api-docs", icon: BookTextIcon },
  ]);

  const navItems = $derived(
    allNavItems
      .filter((item) => {
        const routeId = `/(manage)${item.url}`;
        const requiredPermission = ROUTE_PERMISSION_MAP[routeId];
        if (requiredPermission === undefined) return false;
        if (requiredPermission === null) return true;
        return (data.userPermissions ?? []).includes(requiredPermission);
      })
      .map((item) => ({ ...item, url: clientResolver(resolve, item.url) }))
  );

  // Derive page title from current URL
  let pageTitle = $derived(navItems.find((item) => page.url.pathname.startsWith(item.url))?.title || "Dashboard");
</script>

<ModeWatcher />
<Toaster />

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
  <title>{pageTitle} | Kener</title>
  <link rel="icon" href={clientResolver(resolve, "/logo96.png")} />
  {#if data.font?.cssSrc}
    <link rel="stylesheet" href={data.font.cssSrc} />
  {/if}
  {@html `
	<style>
		.kener-manage {
			--up: ${data.siteStatusColors.UP};
			--degraded: ${data.siteStatusColors.DEGRADED};
			--down: ${data.siteStatusColors.DOWN};
			--maintenance: ${data.siteStatusColors.MAINTENANCE};
			--accent: ${data.siteStatusColors.ACCENT || "#f4f4f5"};
			--accent-foreground: ${data.siteStatusColors.ACCENT_FOREGROUND || data.siteStatusColors.ACCENT || "#e96e2d"};
			${data.font?.family ? `--font-family:'${data.font.family}', sans-serif;` : ""}
		}
		:is(.dark) .kener-manage {
			--up: ${data.siteStatusColorsDark.UP};
			--degraded: ${data.siteStatusColorsDark.DEGRADED};
			--down: ${data.siteStatusColorsDark.DOWN};
			--maintenance: ${data.siteStatusColorsDark.MAINTENANCE};
			--accent: ${data.siteStatusColorsDark.ACCENT || "#27272a"};
			--accent-foreground: ${data.siteStatusColorsDark.ACCENT_FOREGROUND || data.siteStatusColorsDark.ACCENT || "#e96e2d"};
		}
	</style>`}
</svelte:head>
<main class="kener-manage">
  <Sidebar.Provider style="--sidebar-width: calc(var(--spacing) * 72); --header-height: calc(var(--spacing) * 12);">
    <AppSidebar variant="inset" {navItems} />
    <Sidebar.Inset>
      <SiteHeader title={pageTitle} />
      <div class="p-4">
        <div class="@container/main flex flex-1">
          <Tooltip.Provider>
            {@render children()}
          </Tooltip.Provider>
        </div>
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
</main>

<style>
  /* Apply the global font family using the CSS variable */
  * {
    font-family: var(--font-family);
  }
</style>
