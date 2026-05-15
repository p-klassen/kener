import type { PageServerLoad } from "./$types";
import { GetPageByPathWithMonitors } from "$lib/server/controllers/pagesController.js";

const DEFAULT_DAYS = 90;
const MAX_DAYS = 90;

export const load: PageServerLoad = async ({ params, url }) => {
	const rawPath = params.page_path;
	const pagePath = rawPath === "_root_" ? "" : rawPath;
	const theme = url.searchParams.get("theme");
	const daysParam = url.searchParams.get("days");
	const days = Math.min(MAX_DAYS, Math.max(1, daysParam ? parseInt(daysParam, 10) : DEFAULT_DAYS));

	const pageData = await GetPageByPathWithMonitors(pagePath);

	return {
		pageTitle: pageData?.page.page_title ?? null,
		monitorTags: pageData?.monitors.map((m) => m.monitor_tag) ?? [],
		days,
		theme,
	};
};
