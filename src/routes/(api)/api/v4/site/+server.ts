import { json, type RequestHandler } from "@sveltejs/kit";
import db from "$lib/server/db/db";
import type { GetSiteDataResponse, SiteDataItem } from "$lib/types/api";

const SENSITIVE_SITE_DATA_KEYS = new Set(["smtp", "resend"]);

export const GET: RequestHandler = async () => {
  const rawData = await db.getAllSiteData();

  const siteData: SiteDataItem[] = rawData
    .filter((item) => !SENSITIVE_SITE_DATA_KEYS.has(item.key))
    .map((item) => ({
      key: item.key,
      value: item.data_type === "object" ? JSON.parse(item.value) : item.value,
      data_type: item.data_type,
    }));

  const response: GetSiteDataResponse = {
    site_data: siteData,
  };

  return json(response);
};
