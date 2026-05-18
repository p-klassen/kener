import { i18n } from "$lib/stores/i18n";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, fetch }) => {
  const { languageSetting } = data;
  await i18n.init(languageSetting.locales, languageSetting.defaultLocale ?? "en", fetch);
  return data;
};
