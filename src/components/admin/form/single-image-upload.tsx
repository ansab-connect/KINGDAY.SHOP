"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { isSupabaseConfigured } from "@/lib/env";
import { publicStorageUrl, type PublicBucket } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

/**
 * Uploads one image straight from the browser to a public Storage bucket.
 * Storage RLS only lets staff write; the returned path is re-validated by the
 * server action before it is saved.
 */
export function SingleImageUpload({
  id,
  label,
  bucket,
  folder,
  value,
  onChange,
  maxEdge = 800,
}: {
  id: string;
  label: string;
  bucket: PublicBucket;
  folder: string;
  value: string | null;
  onChange: (path: string | null) => void;
  maxEdge?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = publicStorageUrl(bucket, value);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const img = await optimizeImage(file, maxEdge);
      const path = `${folder}/${randomFileId()}.${img.extension}`;
      const { error: upErr } = await createClient()
        .storage.from(bucket)
        .upload(path, img.blob, { contentType: img.blob.type, cacheControl: "31536000", upsert: false });
      if (upErr) throw new Error("Upload failed. Check your permissions and try again.");
      onChange(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-deep">{label}</span>
      <div className="flex items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/50">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of a just-uploaded file
            <img src={url} alt="" className="size-full object-contain" />
          ) : (
            <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={busy || !isSupabaseConfigured}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <label
            htmlFor={id}
            aria-disabled={busy || !isSupabaseConfigured}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium text-deep hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImagePlus aria-hidden className="size-4" />}
            {value ? "Replace" : "Upload"}
          </label>
          {value ? (
            <button type="button" onClick={() => onChange(null)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-danger hover:bg-danger-soft">
              <Trash2 aria-hidden className="size-4" /> Remove
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : <p className="text-xs text-muted-foreground">JPG, PNG, WebP or AVIF. Resized and converted automatically.</p>}
    </div>
  );
}
