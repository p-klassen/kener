import { GetPageBadge } from "$lib/server/controllers/controller.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, url }) => {
	const query = url.searchParams;
	return GetPageBadge("status", {
		page_path: params.page_path,
		downMin: query.get("downMin"),
		degradedMin: query.get("degradedMin"),
		label: query.get("label"),
		labelColor: query.get("labelColor"),
		color: query.get("color"),
		style: query.get("style"),
		locale: query.get("locale"),
	});
};
