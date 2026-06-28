import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RequestHandler } from "./$types";

const DEV_PATH = join(process.cwd(), "static", "api-references", "v4.json");
const PROD_PATH = join(process.cwd(), "build", "client", "api-references", "v4.json");

export const GET: RequestHandler = async () => {
  try {
    const specPath = existsSync(PROD_PATH) ? PROD_PATH : DEV_PATH;
    const spec = JSON.parse(await readFile(specPath, "utf-8")) as { info: { version: string } };

    // Always reflect the running app version — no manual spec version updates needed
    const buildVersion = import.meta.env.PACKAGE_VERSION as string | undefined;
    if (buildVersion) spec.info.version = buildVersion;

    return new Response(JSON.stringify(spec), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // no-cache: revalidate on every request so the version badge always matches the app
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: {
          code: "NOT_FOUND",
          message: "API specification not found",
        },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  }
};
