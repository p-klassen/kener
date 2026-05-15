import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetMonitorsParsed } from "$lib/server/controllers/monitorsController.js";
import { GetAllPages } from "$lib/server/controllers/pagesController.js";
import { GetLoggedInSession } from "$lib/server/controllers/userController.js";
import db from "$lib/server/db/db.js";

export const GET: RequestHandler = async ({ cookies }) => {
  const publicMonitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO", is_public: 1 });
  const allowedMonitors = new Map<string, string>(publicMonitors.map((m) => [m.tag, m.name]));
  const accessiblePageIds = new Set<number>();

  const session = await GetLoggedInSession(cookies);
  if (session) {
    const accessible = await db.getAccessibleResources(session.id);
    for (const id of accessible.pageIds) accessiblePageIds.add(id);
    if (accessible.monitorTags.size > 0) {
      const roleMonitors = await GetMonitorsParsed({
        status: "ACTIVE",
        is_hidden: "NO",
        tags: [...accessible.monitorTags],
      });
      for (const m of roleMonitors) allowedMonitors.set(m.tag, m.name);
    }
  }

  // Build grouped pages — only include pages the caller can view
  const allPages = await GetAllPages();
  const pages: Array<{ slug: string; name: string; monitors: Array<{ tag: string; name: string }> }> = [];

  for (const p of allPages) {
    if (p.is_public !== 1 && !accessiblePageIds.has(p.id)) continue;
    const pageMonitors = await db.getPageMonitorsExcludeHidden(p.id);
    const accessible = pageMonitors
      .filter((pm) => allowedMonitors.has(pm.monitor_tag))
      .map((pm) => ({ tag: pm.monitor_tag, name: allowedMonitors.get(pm.monitor_tag)! }));
    if (accessible.length > 0) {
      pages.push({ slug: p.page_path, name: p.page_title, monitors: accessible });
    }
  }

  // Keep flat monitors list for backwards compat
  return json({
    monitors: [...allowedMonitors.entries()].map(([tag, name]) => ({ tag, name })),
    pages,
  });
};
