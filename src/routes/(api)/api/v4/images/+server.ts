import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import db from "$lib/server/db/db";
import { uploadImage, formatImageMeta } from "$lib/server/controllers/imageController";
import type { GetImagesListResponse, UploadImageResponse, InternalServerErrorResponse } from "$lib/types/api";

export const GET: RequestHandler = async () => {
  try {
    const images = await db.getAllImages();
    const response: GetImagesListResponse = {
      images: images.map(formatImageMeta),
    };
    return json(response);
  } catch (err) {
    const errorResponse: InternalServerErrorResponse = {
      error: { code: "INTERNAL_ERROR", message: "Failed to retrieve images" },
    };
    return json(errorResponse, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return json(
        { error: { code: "BAD_REQUEST", message: "Content-Type must be multipart/form-data" } },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return json(
        { error: { code: "BAD_REQUEST", message: "No file provided. Include a 'file' field in the form data." } },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const fileName = file.name || undefined;

    const { id } = await uploadImage({
      base64,
      mimeType,
      fileName,
      maxWidth: 4096,
      maxHeight: 4096,
    });

    const image = await db.getImageById(id);
    if (!image) {
      return json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to retrieve uploaded image" } },
        { status: 500 },
      );
    }

    const response: UploadImageResponse = {
      image: formatImageMeta(image),
    };
    return json(response, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload image";
    const isValidationError =
      message.includes("Invalid image") ||
      message.includes("too large") ||
      message.includes("does not match") ||
      message.includes("Image data is required") ||
      message.includes("Could not detect") ||
      message.includes("dimensions exceed");
    return json(
      { error: { code: isValidationError ? "BAD_REQUEST" : "INTERNAL_ERROR", message } },
      { status: isValidationError ? 400 : 500 },
    );
  }
};
