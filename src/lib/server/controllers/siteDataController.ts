import db from "../db/db.js";
import { siteDataKeys } from "./siteDataKeys.js";
import type { Cookies } from "@sveltejs/kit";
import type {
  DataRetentionPolicy,
  EventDisplaySettings,
  GlobalPageVisibilitySettings,
  PageOrderingSettings,
  SiteAnalyticsItem,
  SiteAnnouncement,
  SiteCategory,
  SiteFont,
  SiteHero,
  SiteHomeDataMaxDays,
  SiteI18nConfig,
  SiteMetaTag,
  SiteNavItem,
  SiteStatusColors,
  SiteSubMenuOptions,
  SiteDateTimeFormat,
  SiteSubscriptionsSettings,
  SitemapXMLConfig,
  GlobalMaintenanceNotificationSettings,
  SitePageDefaults,
} from "../../types/site.js";

export interface SiteDataTransformed {
  title?: string;
  siteName?: string;
  siteURL: string;
  home?: string;
  logo?: string;
  favicon?: string;
  metaTags?: SiteMetaTag[];
  nav?: SiteNavItem[];
  hero?: SiteHero;
  footerHTML?: string;
  i18n: SiteI18nConfig;
  pattern?: string;
  analytics?: SiteAnalyticsItem[];
  theme?: string;
  themeToggle?: string;
  tzToggle?: string;
  manualTimezone?: string;
  barStyle: string;
  barRoundness?: string;
  summaryStyle?: string;
  colors: SiteStatusColors;
  colorsDark: SiteStatusColors;
  font: SiteFont;
  categories?: SiteCategory[];
  homeIncidentCount?: number | null;
  homeIncidentStartTimeWithin?: number;
  homeDataMaxDays?: SiteHomeDataMaxDays;
  kenerTheme?: string;
  subscriptionsSettings?: SiteSubscriptionsSettings;
  showSiteStatus?: string;
  monitorSort?: number[];

  subMenuOptions?: SiteSubMenuOptions;
  announcement?: SiteAnnouncement;
  dataRetentionPolicy?: DataRetentionPolicy;
  eventDisplaySettings?: EventDisplaySettings;
  socialPreviewImage?: string;
  customCSS?: string;
  globalPageVisibilitySettings?: GlobalPageVisibilitySettings;
  pageOrderingSettings?: PageOrderingSettings;
  dateAndTimeFormat?: SiteDateTimeFormat;
  metaSiteTitle?: string;
  metaSiteDescription?: string;
  sitemap?: SitemapXMLConfig;
  globalMaintenanceNotificationSettings?: GlobalMaintenanceNotificationSettings;
  pageDefaults?: SitePageDefaults;
  adminBadge?: { text: string; bgColor: string; textColor: string; enabled: boolean };
}

export function InsertKeyValue(key: string, value: string): Promise<number[]> {
  let f = siteDataKeys.find((k) => k.key === key);
  if (!f) {
    console.trace(`Invalid key: ${key}`);
    throw new Error(`Invalid key: ${key}`);
  }
  if (!f.isValid(value)) {
    console.trace(`Invalid value for key: ${key}`);
    throw new Error(`Invalid value for key: ${key}`);
  }
  return db.insertOrUpdateSiteData(key, value, f.data_type);
}

// These keys contain credentials (smtp_pass, resend_api_key) and must never be
// included in the general site-data payload sent to the manage UI. Dedicated
// endpoints (getSmtpStatus, getResendStatus) expose only the safe subsets.
const SENSITIVE_SITE_DATA_KEYS = new Set(["smtp", "resend"]);

export async function GetAllSiteData(): Promise<SiteDataTransformed> {
  let data = await db.getAllSiteData();
  //return all data as key value pairs, transform using data_type
  const transformedData: Record<string, unknown> = {};
  for (const d of data) {
    if (SENSITIVE_SITE_DATA_KEYS.has(d.key)) continue;
    if (d.data_type === "object") {
      transformedData[d.key] = JSON.parse(d.value);
    } else {
      transformedData[d.key] = d.value;
    }
  }
  return transformedData as unknown as SiteDataTransformed;
}

export const GetLocaleFromCookie = (site: SiteDataTransformed, cookies: Cookies): string => {
  let selectedLang = site.i18n?.defaultLocale || "en";
  const localLangCookie = cookies.get("localLang");
  if (!!localLangCookie && site.i18n?.locales?.find((l) => l.code === localLangCookie)) {
    selectedLang = localLangCookie;
  } else if (site.i18n?.defaultLocale && site.i18n?.locales?.length) {
    selectedLang = site.i18n.defaultLocale;
  }
  return selectedLang;
};

export const GetSiteLogoURL = async (siteURL: string, logo: string, base: string): Promise<string> => {
  if (logo.startsWith("http")) {
    return logo;
  }
  return siteURL + base + logo;
};

export async function GetAllAnalyticsData() {
  let data = await db.getAllSiteDataAnalytics();
  //return all data as key value pairs, transform using data_type
  let transformedData = [];
  for (const d of data) {
    transformedData.push({
      key: d.key,
      value: JSON.parse(d.value),
    });
  }
  return transformedData;
}
export const GetSiteDataByKey = async (key: string): Promise<unknown> => {
  let data = await db.getSiteDataByKey(key);
  if (!data) {
    return null;
  }
  if (data.data_type == "object") {
    return JSON.parse(data.value);
  }
  return data.value;
};

export const IsSetupComplete = async (): Promise<boolean> => {
  if (process.env.KENER_SECRET_KEY === undefined) {
    return false;
  }
  if (process.env.ORIGIN === undefined) {
    return false;
  }
  if (process.env.REDIS_URL === undefined) {
    return false;
  }
  let data = await db.getAllSiteData();

  if (!data || data.length === 0) {
    return false;
  }

  // Require at least one owner account to be present
  const users = await db.getAllUsers();
  const hasOwner = users.some((u) => u.is_owner === "YES");
  if (!hasOwner) {
    return false;
  }

  return true;
};
