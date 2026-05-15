import sharp from "sharp";
import { nanoid } from "nanoid";
import heicConvert from "heic-convert";
import db from "../db/db.js";
import GC from "../../global-constants.js";
import type { ImageRecord } from "../types/db.js";

export interface ImageUploadData {
  base64: string; // base64 encoded image data (without data URI prefix)
  mimeType: string;
  fileName?: string;
  maxWidth?: number;
  maxHeight?: number;
  forceDimensions?: boolean;
  prefix?: string; // prefix for the ID (e.g., "logo_", "favicon_")
}

export async function uploadImage(data: ImageUploadData): Promise<{ id: string; url: string }> {
  const {
    base64,
    fileName,
    maxWidth = 256,
    maxHeight = 256,
    forceDimensions = false,
    prefix = "img_",
  } = data;
  let mimeType = data.mimeType;

  if (!base64) {
    throw new Error("Image data is required");
  }

  // Normalize browser-reported font MIME type aliases to canonical values
  const fontMimeAliases: Record<string, string> = {
    "application/x-font-ttf": "font/ttf",
    "application/x-font-otf": "font/otf",
    "application/font-woff": "font/woff",
    "application/font-woff2": "font/woff2",
    "application/vnd.ms-opentype": "font/otf",
    "application/x-font-woff": "font/woff",
  };
  if (fontMimeAliases[mimeType]) {
    mimeType = fontMimeAliases[mimeType];
  }
  // If browser reports octet-stream, try to derive from fileName extension
  if (mimeType === "application/octet-stream" && fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const extMap: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };
    if (extMap[ext]) mimeType = extMap[ext];
  }

  const allowedMimeTypes = [
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/heic", "image/heif", "image/svg+xml",
    "font/ttf", "font/otf", "font/woff", "font/woff2",
  ];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error(`Invalid image type. Allowed types: ${allowedMimeTypes.join(", ")}`);
  }

  // Decode base64 to buffer
  const imageBuffer = Buffer.from(base64, "base64");
  if (!imageBuffer.length) {
    throw new Error("Invalid image data");
  }

  if (imageBuffer.length > GC.MAX_UPLOAD_BYTES) {
    throw new Error("Image is too large. Maximum upload size is 5MB");
  }

  const normalizedRequestedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const maybeTextHeader = imageBuffer.subarray(0, 4096).toString("utf8");
  const looksLikeSvg = /<svg[\s>]/i.test(maybeTextHeader) || /<\?xml/i.test(maybeTextHeader);

  // Reject if content looks like SVG but client claims it's not SVG
  if (looksLikeSvg && normalizedRequestedMime !== "image/svg+xml") {
    throw new Error("Image content does not match the declared MIME type");
  }

  // Store font files as-is, bypassing sharp
  const FONT_MIME_TYPES = new Set(["font/ttf", "font/otf", "font/woff", "font/woff2"]);
  if (FONT_MIME_TYPES.has(normalizedRequestedMime)) {
    const ext = normalizedRequestedMime.split("/")[1]; // "ttf", "otf", "woff", "woff2"
    const fontId = `font_${nanoid(16)}.${ext}`;
    await db.insertImage({
      id: fontId,
      data: imageBuffer.toString("base64"),
      mime_type: normalizedRequestedMime,
      original_name: fileName || null,
      width: null,
      height: null,
      size: imageBuffer.length,
    });
    return { id: fontId, url: `/assets/fonts/${fontId}` };
  }

  // Store SVG as-is, bypassing sharp
  if (normalizedRequestedMime === "image/svg+xml") {
    const svgId = `${nanoid(16)}.svg`;
    await db.insertImage({
      id: svgId,
      data: imageBuffer.toString("base64"),
      mime_type: "image/svg+xml",
      original_name: fileName || null,
      width: null,
      height: null,
      size: imageBuffer.length,
    });
    return { id: svgId, url: `/assets/images/${svgId}` };
  }

  let processedBuffer: Buffer;
  let finalMimeType = mimeType;
  let width: number | undefined;
  let height: number | undefined;

  // Pre-convert HEIC/HEIF to JPEG before passing to sharp (sharp may lack HEVC codec)
  let sharpInputBuffer = imageBuffer;
  const heicSignature = imageBuffer.subarray(4, 12).toString("ascii");
  const isHeicData = heicSignature.includes("ftyp");
  if (isHeicData) {
    const converted = await heicConvert({
      buffer: new Uint8Array(imageBuffer) as unknown as ArrayBuffer,
      format: "JPEG",
      quality: 0.85,
    });
    sharpInputBuffer = Buffer.from(converted);
  }

  // Process with sharp and normalize output
  const image = sharp(sharpInputBuffer, { limitInputPixels: GC.MAX_INPUT_PIXELS });
  const metadata = await image.metadata();

  const formatToMime: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    heic: "image/heic",
    heif: "image/heif",
  };

  const detectedMimeType = metadata.format ? formatToMime[metadata.format] : undefined;
  if (!detectedMimeType) {
    throw new Error("Could not detect a valid image format");
  }

  // HEIC/HEIF files often have .jpg extension (e.g. iPhone photos); allow the mismatch
  const isHeicDetected = detectedMimeType === "image/heic" || detectedMimeType === "image/heif";
  const isHeicRequested = normalizedRequestedMime === "image/heic" || normalizedRequestedMime === "image/heif";
  if (normalizedRequestedMime !== detectedMimeType && !isHeicDetected && !isHeicRequested) {
    throw new Error("Image MIME type does not match file content");
  }

  const sourceWidth = metadata.width || maxWidth;
  const sourceHeight = metadata.height || maxHeight;

  if (sourceWidth > GC.MAX_IMAGE_DIMENSION || sourceHeight > GC.MAX_IMAGE_DIMENSION) {
    throw new Error(
      `Image dimensions exceed maximum allowed size of ${GC.MAX_IMAGE_DIMENSION}x${GC.MAX_IMAGE_DIMENSION}`,
    );
  }

  const boundedMaxWidth = Math.min(maxWidth, GC.MAX_IMAGE_DIMENSION);
  const boundedMaxHeight = Math.min(maxHeight, GC.MAX_IMAGE_DIMENSION);

  // Calculate new dimensions.
  let newWidth = sourceWidth;
  let newHeight = sourceHeight;

  if (forceDimensions) {
    newWidth = Math.max(1, boundedMaxWidth);
    newHeight = Math.max(1, boundedMaxHeight);
  } else if (newWidth > boundedMaxWidth || newHeight > boundedMaxHeight) {
    const ratio = Math.min(boundedMaxWidth / newWidth, boundedMaxHeight / newHeight);
    newWidth = Math.max(1, Math.round(newWidth * ratio));
    newHeight = Math.max(1, Math.round(newHeight * ratio));
  }

  width = newWidth;
  height = newHeight;

  // Keep JPEG as JPEG; convert HEIC/HEIF to JPEG; convert everything else (WebP/PNG) to PNG.
  if (detectedMimeType === "image/jpeg" || isHeicDetected) {
    processedBuffer = await image
      .resize(newWidth, newHeight, {
        fit: forceDimensions ? "cover" : "inside",
        position: "centre",
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    finalMimeType = "image/jpeg";
  } else {
    processedBuffer = await image
      .resize(newWidth, newHeight, {
        fit: forceDimensions ? "cover" : "inside",
        position: "centre",
      })
      .png()
      .toBuffer();
    finalMimeType = "image/png";
  }

  // Generate ID with nanoid and extension
  const fileExtension = finalMimeType === "image/jpeg" ? "jpg" : "png";
  const id = `${nanoid(16)}.${fileExtension}`;

  // Convert processed image back to base64
  const processedBase64 = processedBuffer.toString("base64");

  // Store in database
  await db.insertImage({
    id,
    data: processedBase64,
    mime_type: finalMimeType,
    original_name: fileName || null,
    width: width || null,
    height: height || null,
    size: processedBuffer.length,
  });

  return {
    id,
    url: `/assets/images/${id}`,
  };
}

export function formatImageMeta(img: ImageRecord) {
  return {
    id: img.id,
    mime_type: img.mime_type,
    original_name: img.original_name,
    width: img.width,
    height: img.height,
    size: img.size,
    created_at: new Date(img.created_at).toISOString(),
  };
}
