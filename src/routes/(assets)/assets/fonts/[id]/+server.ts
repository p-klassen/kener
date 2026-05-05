import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db";

const FONT_MIME_TYPES = new Set(["font/ttf", "font/otf", "font/woff", "font/woff2"]);

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  if (!id) {
    throw error(400, "Font ID is required");
  }

  const record = await db.getImageById(id);

  if (!record || !FONT_MIME_TYPES.has(record.mime_type)) {
    throw error(404, "Font not found");
  }

  const buffer = Buffer.from(record.data, "base64");

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": record.mime_type,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
