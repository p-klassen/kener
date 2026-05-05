import { i18n } from "$lib/stores/i18n";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, fetch }) => {
  const { userLocale, availableLocales, defaultLocale } = data;

  if (userLocale && typeof window !== "undefined") {
    localStorage.setItem("kener_preferred_locale", userLocale);
  }

  await i18n.init(availableLocales, defaultLocale ?? "en", fetch);
  return {};
};
