<script lang="ts">
  import InnerShadowTopIcon from "@lucide/svelte/icons/user";
  import NavMain from "./nav-main.svelte";
  import NavUser from "./nav-user.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import version from "$lib/version";
  import type { Component, ComponentProps } from "svelte";
  import { resolve } from "$app/paths";
  import clientResolver from "$lib/client/resolver.js";
  type NavItem = { title: string; url: string; icon: Component };
  type AdminBadge = { text: string; bgColor: string; textColor: string; enabled: boolean };

  let { navItems, adminBadge, ...restProps }: { navItems: NavItem[]; adminBadge?: AdminBadge } & ComponentProps<typeof Sidebar.Root> = $props();
  const appVersion = version();
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps}>
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:p-1.5!">
          {#snippet child({ props })}
            <a
              href={clientResolver(resolve, "/manage/app/site-configurations")}
              {...props}
              class="justify-start-safe flex items-center gap-2"
            >
              <img src={clientResolver(resolve, "/logo96.png")} class="size-5!" alt="Kener Logo" />
              <span class="text-base font-semibold"> Kener </span>
              <span class="text-muted-foreground pt-0.5 text-xs font-medium"> v{appVersion} </span>
              {#if adminBadge?.enabled && adminBadge?.text}
                <span class="rounded px-1.5 py-0.5 text-xs font-medium" style="background-color:{adminBadge.bgColor};color:{adminBadge.textColor};">{adminBadge.text}</span>
              {/if}
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>
  <Sidebar.Content>
    <NavMain items={navItems} />
  </Sidebar.Content>
  <Sidebar.Footer>
    <NavUser />
  </Sidebar.Footer>
</Sidebar.Root>
