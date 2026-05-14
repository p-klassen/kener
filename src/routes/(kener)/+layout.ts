import type { LayoutLoad } from "./$types";
import { GetLayoutClientData } from "$lib/client/layoutClientData";
import { setMode } from "mode-watcher";

export const load: LayoutLoad = async ({ data, fetch }) => {
  const clientData = await GetLayoutClientData(data.languageSetting, fetch, data.manualTimezone);

  const theme =
    data.defaultSiteTheme === "dark" || data.defaultSiteTheme === "light" || data.defaultSiteTheme === "system"
      ? data.defaultSiteTheme
      : "system";

  // Apply admin default theme once per session; re-apply if admin changed it.
  // Using sessionStorage so fresh sessions always start with the configured default,
  // but user toggles within a session are preserved across SPA navigations.
  if (typeof window !== "undefined") {
    const applied = sessionStorage.getItem("kener-theme-session");
    if (applied !== theme) {
      setMode(theme);
      sessionStorage.setItem("kener-theme-session", theme);
    }
  }

  return {
    ...data,
    ...clientData,
  };
};
