import { GetPageBadge } from "$lib/server/controllers/controller.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
	const query = url.searchParams;
	return GetPageBadge("uptime", {
		page_path: params.page_path,
		sinceLast: query.get("sinceLast"),
		hideDuration: query.get("hideDuration"),
		label: query.get("label"),
		labelColor: query.get("labelColor"),
		color: query.get("color"),
		style: query.get("style"),
	});
};
