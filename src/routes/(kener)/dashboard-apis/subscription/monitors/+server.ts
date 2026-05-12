import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetMonitorsParsed } from "$lib/server/controllers/monitorsController.js";
import { GetLoggedInSession } from "$lib/server/controllers/userController.js";
import db from "$lib/server/db/db.js";

export const GET: RequestHandler = async ({ cookies }) => {
  const publicMonitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO", is_public: 1 });

  const session = await GetLoggedInSession(cookies);
  if (!session) {
    return json({ monitors: publicMonitors.map((m) => ({ tag: m.tag, name: m.name })) });
  }

  // For logged-in users: merge public monitors with role-accessible monitors
  const accessible = await db.getAccessibleResources(session.id);
  if (accessible.monitorTags.size === 0) {
    return json({ monitors: publicMonitors.map((m) => ({ tag: m.tag, name: m.name })) });
  }

  const roleMonitors = await GetMonitorsParsed({
    status: "ACTIVE",
    is_hidden: "NO",
    tags: [...accessible.monitorTags],
  });

  // Merge and deduplicate by tag
  const merged = new Map<string, { tag: string; name: string }>();
  for (const m of [...publicMonitors, ...roleMonitors]) {
    merged.set(m.tag, { tag: m.tag, name: m.name });
  }

  return json({ monitors: [...merged.values()] });
};
