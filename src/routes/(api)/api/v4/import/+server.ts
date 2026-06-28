import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { importData, type ExportPayload, VALID_EXPORT_SCOPES } from "$lib/server/controllers/exportImportController";
import type { ImportResultResponse, InternalServerErrorResponse } from "$lib/types/api";

// TODO(H-27): The API key system currently has no per-key permission or role field (see ApiKeyRecord in types/db.ts).
// Import is a destructive, privileged operation. Once API keys gain a permission/role field (e.g. "admin"
// or "settings.write"), add a check here: if (!key.is_admin) return 403.
// For now, access is restricted to any valid API key bearer (enforced by hooks.server.ts).
// Track this in the product roadmap before exposing the import endpoint publicly.

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return json(
			{ error: { code: "BAD_REQUEST", message: "Content-Type must be application/json" } },
			{ status: 400 },
		);
	}

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

	if (payload.version == null || !payload.scope || !payload.exported_at) {
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

	if (!VALID_EXPORT_SCOPES.includes(payload.scope)) {
		return json(
			{
				error: {
					code: "BAD_REQUEST",
					message: `Invalid scope '${payload.scope}'. Must be one of: ${VALID_EXPORT_SCOPES.join(", ")}`,
				},
			},
			{ status: 400 },
		);
	}

	// Validate nested arrays to prevent DB errors from malformed payloads
	if (payload.config) {
		const { site_data, monitors, pages, triggers, images } = payload.config;
		if (
			(site_data !== undefined && !Array.isArray(site_data)) ||
			(monitors !== undefined && !Array.isArray(monitors)) ||
			(pages !== undefined && !Array.isArray(pages)) ||
			(triggers !== undefined && !Array.isArray(triggers)) ||
			(images !== undefined && !Array.isArray(images))
		) {
			return json(
				{ error: { code: "BAD_REQUEST", message: "Invalid import payload: config arrays must be arrays" } },
				{ status: 400 },
			);
		}
	}
	if (payload.users_groups_roles) {
		const { users, groups, roles } = payload.users_groups_roles;
		if (
			(users !== undefined && !Array.isArray(users)) ||
			(groups !== undefined && !Array.isArray(groups)) ||
			(roles !== undefined && !Array.isArray(roles))
		) {
			return json(
				{ error: { code: "BAD_REQUEST", message: "Invalid import payload: users_groups_roles arrays must be arrays" } },
				{ status: 400 },
			);
		}
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
