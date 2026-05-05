import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { GetMonitorsParsed } from "$lib/server/controllers/monitorsController.js";

export const GET: RequestHandler = async () => {
  const monitors = await GetMonitorsParsed({ status: "ACTIVE", is_hidden: "NO" });
  return json({
    monitors: monitors.map((m) => ({ tag: m.tag, name: m.name })),
  });
};
