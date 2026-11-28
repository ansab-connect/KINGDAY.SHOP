"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Check, Eye, ImagePlus, Images, Loader2, Trash2, X } from "lucide-react";
import { assignVariantImages, getImagePool, type PoolImage } from "@/features/catalog/admin-actions";
import type { AdminProductImage } from "@/features/catalog/admin-repo";
import { GALLERY_MAX } from "@/features/catalog/image-pool";
import { ACCEPTED_IMAGE_TYPES, optimizeImage, randomFileId } from "@/lib/image-optimize";
import { publicStorageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Temporary image gallery for one product: upload many images at once, then pick
 * them per variant with "Select Images". Files live in the product's normal storage
 * folder; a file is assigned while any gallery uses it, and only unassigned files are
 * removed by "Remove Unused Temporary Images".
 */

type Pool = {
  productId: string;
  productName: string;
  files: PoolImage[];
  loading: boolean;
  /** Storage path → where it is used ("Shared", "24″ • Red", …). */
  usage: Map<string, string[]>;
  /** Gallery images of one variant (null = shared), in order. */
  galleryOf: (variantId: string | null) => AdminProductImage[];
  /** Saved variants, for "Use for…" on each photo. */
  variants: [string, string][];
  refresh: () => Promise<void>;
};

/** Fired after the editor removed unused photos, so the gallery reloads. */
export const POOL_REFRESH_EVENT = "kd-image-pool-refresh";

const PoolContext = createContext<Pool | null>(null);
export const useImagePool = () => useContext(PoolContext);

const urlOf = (path: string) => publicStorageUrl("product-images", path) ?? "";

export function ImagePoolProvider({
  productId,
  productName,
  images,
  variantLabels,
  children,
}: {
  productId: string;
  productName: string;
  images: AdminProductImage[];
  /** Saved variant id → label shown on the image ("24″ • Red"). */
  variantLabels: Map<string, string>;
  children: React.ReactNode;
}) {
  const [files, setFiles] = useState<PoolImage[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await getImagePool(productId);
    if (r.ok) setFiles(r.data);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    let live = true;
    getImagePool(productId).then((r) => {
      if (!live) return;
      if (r.ok) setFiles(r.data);
      setLoading(false);
    });
    const reload = () => {
      getImagePool(productId).then((r) => live && r.ok && setFiles(r.data));
    };
    window.addEventListener(POOL_REFRESH_EVENT, reload);
    return () => {
      live = false;
      window.removeEventListener(POOL_REFRESH_EVENT, reload);
    };
  }, [productId]);

  const value = useMemo<Pool>(() => {
    const usage = new Map<string, string[]>();
    for (const img of images) {
      const where = img.variant_id ? (variantLabels.get(img.variant_id) ?? "Variant") : "Shared";
      usage.set(img.storage_path, [...new Set([...(usage.get(img.storage_path) ?? []), where])]);
    }
    // Images already in galleries but uploaded elsewhere still show in the pool.
    const known = new Set(files.map((f) => f.path));
    const extra = [...new Set(images.map((i) => i.storage_path))].filter((p) => !known.has(p)).map((path) => ({ path, createdAt: null }));
    return {
      productId,
      productName,
      files: [...files, ...extra],
      loading,
      usage,
      galleryOf: (variantId) => images.filter((i) => (i.variant_id ?? null) === variantId).sort((a, b) => a.position - b.position),
      variants: [...variantLabels.entries()],
      refresh,
    };
  }, [files, images, loading, productId, productName, refresh, variantLabels]);

  return <PoolContext.Provider value={value}>{children}</PoolContext.Provider>;
}

/** The "Temporary Bulk Image Upload" section. */
export function TemporaryImageGallery() {
  const pool = useImagePool();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const router = useRouter();
  const [assigning, startAssign] = useTransition();
  if (!pool) return null;
  const { files, usage, loading, productId } = pool;

  /** "Use for: Red" on a photo adds it to that variant's photos (or the main photos). */
  function assignTo(path: string, target: string) {
    const variantId = target === "main" ? null : target;
    const label = variantId ? (pool!.variants.find(([id]) => id === variantId)?.[1] ?? "") : "";
    const current = pool!.galleryOf(variantId).map((i) => i.storage_path);
    if (current.includes(path)) return;
    if (current.length >= GALLERY_MAX) return setNote({ kind: "error", text: `Up to ${GALLERY_MAX} photos per variant.` });
    startAssign(async () => {
      const r = await assignVariantImages({ productId, variantId, paths: [...current, path], alt: `${pool!.productName} ${label}`.trim() });
      if (!r.ok) return setNote({ kind: "error", text: r.error });
      setNote({ kind: "success", text: `Photo added to ${variantId ? label : "main photos"}.` });
      router.refresh();
    });
  }
  const unused = files.filter((f) => !usage.has(f.path));

  async function upload(list: FileList) {
    setNote(null);
    const chosen = Array.from(list).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
    const supabase = createClient();
    let done = 0;
    const failed: string[] = [];
    for (const [i, file] of chosen.entries()) {
      setBusy(`Uploading ${i + 1} of ${chosen.length}…`);
      try {
        const img = await optimizeImage(file, 1600);
        const path = `products/${productId}/${randomFileId()}.${img.extension}`;
        const { error } = await supabase.storage.from("product-images").upload(path, img.blob, { contentType: img.blob.type, cacheControl: "31536000", upsert: false });
        if (error) throw error;
        done++;
      } catch {
        failed.push(file.name);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    await pool!.refresh();
    setBusy(null);
    const skipped = list.length - chosen.length;
    setNote(
      failed.length || skipped
        ? { kind: "error", text: `${done} uploaded.${failed.length ? ` Couldn't upload: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}.` : ""}${skipped ? ` ${skipped} file(s) skipped (use JPG, PNG, WebP or AVIF).` : ""}` }
        : { kind: "success", text: `${done} image${done === 1 ? "" : "s"} uploaded. Now open a variant and press “Select Images”.` },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id="pool-upload"
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
          disabled={Boolean(busy)}
        />
        <label
          htmlFor="pool-upload"
          className={cn(
            "inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-700",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImagePlus aria-hidden className="size-4" />}
          {busy ?? "Upload images"}
        </label>
        <span className="text-sm text-muted-foreground">
          {files.length} image{files.length === 1 ? "" : "s"} · {unused.length} not assigned
        </span>
        {unused.length ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gold-50 px-3 py-2 text-xs font-medium text-gold-700">
            <Trash2 aria-hidden className="size-3.5" /> Not selected photos are deleted automatically when you save
          </span>
        ) : null}
      </div>
      {note ? <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", note.kind === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{note.text}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading images…</p>
      ) : files.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => {
            const where = usage.get(f.path);
            return (
              <li key={f.path} className={cn("overflow-hidden rounded-xl border bg-white", !where && "border-dashed")}>
                <button type="button" onClick={() => setPreview(f.path)} className="group relative block aspect-square w-full bg-muted" aria-label="Preview image">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                  <img src={urlOf(f.path)} alt="" loading="lazy" className="size-full object-cover" />
                  <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye aria-hidden className="size-4" />
                  </span>
                </button>
                <div className="flex min-h-12 flex-wrap items-center gap-1 p-2">
                  {where ? (
                    where.map((w) => (
                      <span key={w} className="rounded bg-royal-50 px-1.5 py-0.5 text-[0.7rem] font-semibold text-royal">{w}</span>
                    ))
                  ) : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">Not assigned</span>
                  )}
                  <select
                    value=""
                    disabled={assigning}
                    onChange={(e) => e.target.value && assignTo(f.path, e.target.value)}
                    aria-label="Use this photo for"
                    className="mt-1 h-8 w-full rounded-md border bg-white px-1.5 text-xs font-medium text-deep"
                  >
                    <option value="">Use for…</option>
                    <option value="main">Main photos</option>
                    {pool.variants.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <label htmlFor="pool-upload" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm text-muted-foreground hover:border-royal-200">
          <Images aria-hidden className="size-8 text-royal-300" />
          Upload all the product photos here at once, then assign them to each variant.
        </label>
      )}
      <PreviewDialog path={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function PreviewDialog({ path, onClose }: { path: string | null; onClose: () => void }) {
  return (
    <Dialog.Root open={Boolean(path)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
        <Dialog.Content className="fixed inset-4 z-[60] m-auto flex max-h-[90vh] max-w-3xl flex-col items-center justify-center outline-none">
          <Dialog.Title className="sr-only">Image preview</Dialog.Title>
          {path ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview
            <img src={urlOf(path)} alt="" className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain" />
          ) : null}
          <Dialog.Close className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-white text-deep shadow" aria-label="Close preview">
            <X className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** "Select Images" for one variant (or the shared gallery with variantId null). */
export function SelectImagesButton({ variantId, label, className }: { variantId: string | null; label: string; className?: string }) {
  const pool = useImagePool();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!pool) return null;
  const current = pool.galleryOf(variantId);

  function openPicker() {
    setPicked(current.map((i) => i.storage_path));
    setError(null);
    setOpen(true);
    void pool!.refresh();
  }

  function toggle(path: string) {
    setError(null);
    setPicked((list) => {
      if (list.includes(path)) return list.filter((p) => p !== path);
      if (list.length >= GALLERY_MAX) {
        setError(`Up to ${GALLERY_MAX} images per variant.`);
        return list;
      }
      return [...list, path];
    });
  }

  function save() {
    start(async () => {
      const r = await assignVariantImages({ productId: pool!.productId, variantId, paths: picked, alt: `${pool!.productName} ${variantId ? label : ""}`.trim() });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border border-royal-200 px-3 text-sm font-semibold text-royal hover:bg-royal-50", className)}
      >
        <Images aria-hidden className="size-4" /> Select Images{current.length ? ` (${current.length})` : ""}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/50" />
          <Dialog.Content className="fixed inset-x-2 top-[5vh] bottom-[5vh] z-50 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none sm:inset-x-6">
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <Dialog.Title className="font-heading text-base font-bold text-deep">Select images for {label}</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tap images to choose them, in the order they should show. The same image can be used for other variants too.
                </Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted" aria-label="Close">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {pool.files.length ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {pool.files.map((f) => {
                    const n = picked.indexOf(f.path);
                    const others = (pool.usage.get(f.path) ?? []).filter((w) => w !== (variantId ? label : "Shared"));
                    return (
                      <li key={f.path} className="relative">
                        <button
                          type="button"
                          onClick={() => toggle(f.path)}
                          aria-pressed={n >= 0}
                          aria-label={n >= 0 ? `Selected image ${n + 1}. Tap to remove` : "Select image"}
                          className={cn("relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-muted", n >= 0 ? "border-royal ring-2 ring-royal-100" : "border-transparent hover:border-royal-200")}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                          <img src={urlOf(f.path)} alt="" loading="lazy" className="size-full object-cover" />
                          <span className={cn("absolute top-2 left-2 grid size-7 place-items-center rounded-full text-xs font-bold", n >= 0 ? "bg-royal text-white" : "border-2 border-white bg-black/25")}>
                            {n >= 0 ? n + 1 : null}
                          </span>
                          {others.length ? (
                            <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/55 px-1.5 py-0.5 text-left text-[0.65rem] text-white">Also: {others.join(", ")}</span>
                          ) : null}
                        </button>
                        <button type="button" onClick={() => setPreview(f.path)} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/45 text-white" aria-label="Preview image">
                          <Eye aria-hidden className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">No images yet. Upload them in “Temporary Bulk Image Upload” first.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t p-4">
              <span className="text-sm text-muted-foreground">{picked.length} selected</span>
              {error ? <span className="text-sm text-danger">{error}</span> : null}
              <button type="button" onClick={() => setPicked([])} disabled={!picked.length} className="ml-auto text-sm font-medium text-muted-foreground hover:underline disabled:opacity-40">
                Clear
              </button>
              <button type="button" onClick={save} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-700 disabled:opacity-60">
                {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
                Save images
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <PreviewDialog path={preview} onClose={() => setPreview(null)} />
    </>
  );
}
