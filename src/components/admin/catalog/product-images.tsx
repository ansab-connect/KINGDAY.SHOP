"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { addProductImage, deleteProductImage, reorderProductImages, updateProductImageAlt } from "@/features/catalog/admin-actions";
import type { AdminProductImage } from "@/features/catalog/admin-repo";
import { isSupabaseConfigured } from "@/lib/env";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 12;

/**
 * Gallery manager: upload (optimised in-browser), alt text, reorder, delete.
 * With `variantId` it manages that combination's own gallery; without it, the shared
 * product images (used only for combinations that have no images of their own).
 */
export function ProductImages({
  productId,
  productName,
  images,
  variantId = null,
  compact = false,
}: {
  productId: string;
  productName: string;
  images: AdminProductImage[];
  variantId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(() => images.filter((i) => (i.variant_id ?? null) === variantId));
  const inputId = `product-images-input-${variantId ?? "shared"}`;
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function upload(files: FileList) {
    setError(null);
    const list = Array.from(files).slice(0, MAX_IMAGES - items.length);
    const supabase = createClient();
    for (const [i, file] of list.entries()) {
      setUploading(`Uploading ${i + 1} of ${list.length}…`);
      try {
        const img = await optimizeImage(file, 1600);
        const path = `products/${productId}/${randomFileId()}.${img.extension}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, img.blob, { contentType: img.blob.type, cacheControl: "31536000", upsert: false });
        if (upErr) throw new Error("Upload failed. Check your permissions and try again.");
        const r = await addProductImage({ productId, path, alt: productName, width: img.width, height: img.height, variantId });
        if (!r.ok) {
          await supabase.storage.from("product-images").remove([path]);
          throw new Error(r.error);
        }
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        break;
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved);
    setItems(next);
    start(async () => {
      const r = await reorderProductImages(productId, next.map((i) => i.id));
      if (!r.ok) setError(r.error);
    });
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    start(async () => {
      const r = await deleteProductImage(id);
      if (!r.ok) {
        setError(r.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {items.length ? (
        <ul className={cn("grid gap-3", compact ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4")}>
          {items.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-2 rounded-xl border p-2">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={img.url} alt={img.alt} className="size-full object-cover" />
                ) : null}
                {i === 0 ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-deep px-2 py-0.5 text-[0.65rem] font-semibold text-gold">
                    <Star aria-hidden className="size-3" /> Main
                  </span>
                ) : null}
              </div>
              <label className="sr-only" htmlFor={`alt-${img.id}`}>Alt text for image {i + 1}</label>
              <input
                id={`alt-${img.id}`}
                defaultValue={img.alt}
                maxLength={200}
                placeholder="Describe the image"
                onBlur={(e) => {
                  if (e.target.value !== img.alt) start(async () => void (await updateProductImageAlt(img.id, e.target.value)));
                }}
                className="h-8 rounded-md border px-2 text-xs outline-none focus:border-royal-300"
              />
              <div className="flex items-center justify-between">
                <div className="flex">
                  <button type="button" aria-label="Move left" disabled={i === 0 || pending} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                    <ArrowLeft className="size-4" />
                  </button>
                  <button type="button" aria-label="Move right" disabled={i === items.length - 1 || pending} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                    <ArrowRight className="size-4" />
                  </button>
                </div>
                <button type="button" aria-label="Delete image" disabled={pending} onClick={() => remove(img.id)} className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger-soft">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          disabled={Boolean(uploading) || items.length >= MAX_IMAGES || !isSupabaseConfigured}
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
        <label
          htmlFor={inputId}
          aria-disabled={Boolean(uploading) || items.length >= MAX_IMAGES || !isSupabaseConfigured}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground transition-colors hover:border-royal-300 hover:bg-royal-50/50",
            "aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
            compact ? "p-3" : "p-6",
          )}
        >
          {uploading ? <Loader2 aria-hidden className="size-6 animate-spin text-royal" /> : <ImagePlus aria-hidden className="size-6 text-royal" />}
          <span className="font-medium text-deep">{uploading ?? "Add images"}</span>
          <span className="text-xs">Up to {MAX_IMAGES} images. Resized to 1600px and converted to WebP automatically. The first image is the main image.</span>
        </label>
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
