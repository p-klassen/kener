import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { importData, type ExportPayload } from "$lib/server/controllers/exportImportController";
import type { ImportResultResponse, InternalServerErrorResponse } from "$lib/types/api";

export const POST: RequestHandler = async ({ request }) => {
	let payload: ExportPayload;

	try {
		payload = await request.json();
	} catch {
		return json(
			{ error: { code: "BAD_REQUEST", message: "Request body must be valid JSON" } },
			{ status: 400 },
		);
	}

	// Basic structural validation
	if (!payload || typeof payload !== "object") {
		return json(
			{ error: { code: "BAD_REQUEST", message: "Invalid import payload: must be an object" } },
			{ status: 400 },
		);
	}

	if (!payload.version || !payload.scope || !payload.exported_at) {
		return json(
			{
				error: {
					code: "BAD_REQUEST",
					message:
						"Invalid import payload: missing required fields (version, scope, exported_at)",
				},
			},
			{ status: 400 },
		);
	}

	const VALID_SCOPES = ["config", "users_groups_roles", "everything"];
	if (!VALID_SCOPES.includes(payload.scope)) {
		return json(
			{
				error: {
					code: "BAD_REQUEST",
					message: `Invalid scope '${payload.scope}'. Must be one of: ${VALID_SCOPES.join(", ")}`,
				},
			},
			{ status: 400 },
		);
	}

	try {
		const result = await importData(payload);
		const response: ImportResultResponse = result;
		return json(response);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Import failed";
		const errorResponse: InternalServerErrorResponse = {
			error: { code: "INTERNAL_ERROR", message },
		};
		return json(errorResponse, { status: 500 });
	}
};
