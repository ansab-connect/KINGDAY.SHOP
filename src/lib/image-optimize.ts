/**
 * Browser-side image optimisation before upload: resizes to a maximum edge and
 * re-encodes as WebP (JPEG fallback). Keeps catalogue images small and fast.
 */
export type OptimizedImage = { blob: Blob; width: number; height: number; extension: "webp" | "jpg" };

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function optimizeImage(file: File, maxEdge = 1600, quality = 0.85): Promise<OptimizedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Use a JPG, PNG, WebP or AVIF image.");
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("Image is larger than 20 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process images.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, width, height, extension: "webp" };
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("Couldn't process this image.");
  return { blob: jpeg, width, height, extension: "jpg" };
}

export function randomFileId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}
