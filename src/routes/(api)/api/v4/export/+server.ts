import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { exportData, type ExportScope, VALID_EXPORT_SCOPES } from "$lib/server/controllers/exportImportController";
import type { InternalServerErrorResponse } from "$lib/types/api";

export const GET: RequestHandler = async ({ url }) => {
	const scopeParam = url.searchParams.get("scope") ?? "everything";

	if (!VALID_EXPORT_SCOPES.includes(scopeParam as ExportScope)) {
		return json(
			{
				error: {
					code: "BAD_REQUEST",
					message: `Invalid scope '${scopeParam}'. Must be one of: ${VALID_EXPORT_SCOPES.join(", ")}`,
				},
			},
			{ status: 400 },
		);
	}

	try {
		const payload = await exportData(scopeParam as ExportScope);
		return json(payload);
	} catch (err) {
		const errorResponse: InternalServerErrorResponse = {
			error: { code: "INTERNAL_ERROR", message: "Export failed" },
		};
		return json(errorResponse, { status: 500 });
	}
};
