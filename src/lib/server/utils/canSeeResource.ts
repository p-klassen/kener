import db from "../db/db.js";
import type { UserRecordPublic } from "../types/db.js";

export type ResourceVisibility =
  | { visible: true }
  | { visible: false; mode: "hidden" | "teaser" | "locked" };

export async function canSeePage(
  user: UserRecordPublic | null,
  pageId: number,
  isPublic: number,
): Promise<boolean> {
  if (isPublic) return true;
  if (!user) return false;
  const { pageIds } = await db.getAccessibleResources(user.id);
  return pageIds.has(pageId);
}

export async function canSeeMonitor(
  user: UserRecordPublic | null,
  monitorTag: string,
  isPublic: number,
): Promise<boolean> {
  if (isPublic) return true;
  if (!user) return false;
  const { monitorTags } = await db.getAccessibleResources(user.id);
  return monitorTags.has(monitorTag);
}

export function getPageVisibility(visibilityMode: string): "hidden" | "teaser" | "locked" {
  if (visibilityMode === "teaser" || visibilityMode === "locked") return visibilityMode;
  return "hidden";
}
