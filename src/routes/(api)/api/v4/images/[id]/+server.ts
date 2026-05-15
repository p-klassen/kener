import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db";
import { formatImageMeta } from "$lib/server/controllers/imageController";
import type { GetImageResponse } from "$lib/types/api";

export const GET: RequestHandler = async ({ locals }) => {
  const image = locals.image!;
  const response: GetImageResponse = {
    image: formatImageMeta(image),
  };
  return json(response);
};

export const DELETE: RequestHandler = async ({ locals }) => {
  const image = locals.image!;
  await db.deleteImage(image.id);
  return new Response(null, { status: 204 });
};
