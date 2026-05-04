import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db";

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  if (!id) {
    throw error(400, "Image ID is required");
  }

  const image = await db.getImageById(id);

  if (!image) {
    throw error(404, "Image not found");
  }

  // Decode base64 data to binary
  const imageBuffer = Buffer.from(image.data, "base64");

  const headers: Record<string, string> = {
    "Content-Type": image.mime_type,
    "Content-Length": imageBuffer.length.toString(),
    "Cache-Control": "public, max-age=31536000, immutable", // Cache for 1 year
  };

  // Add CSP headers for SVG to prevent XSS
  if (image.mime_type === "image/svg+xml") {
    headers["Content-Security-Policy"] = "default-src 'none'";
    headers["X-Content-Type-Options"] = "nosniff";
  }

  return new Response(imageBuffer, {
    status: 200,
    headers,
  });
};
