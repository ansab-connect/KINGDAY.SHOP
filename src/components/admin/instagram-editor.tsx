"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Film, Loader2, Plus, Trash2, X } from "lucide-react";
import { SingleImageUpload } from "@/components/admin/form/single-image-upload";
import { saveInstagramPostsAction } from "@/features/marketing/instagram-actions";
import { isSupabaseConfigured } from "@/lib/env";
import { randomFileId } from "@/lib/image-optimize";
import { publicStorageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Post = { key: string; url: string; image_path: string | null; video_path: string; caption: string };
const key = () => Math.random().toString(36).slice(2);
const inputCls = "h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

/** Royal Moments: paste each real post's link and upload its picture. Order = order on the homepage. */
export function InstagramEditor({ initial }: { initial: { url: string; image_path: string; video_path?: string; caption: string }[] }) {
  const [posts, setPosts] = useState<Post[]>(initial.map((p) => ({ ...p, video_path: p.video_path ?? "", key: key() })));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, patch: Partial<Post>) => setPosts((ps) => ps.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  const move = (i: number, d: number) =>
    setPosts((ps) => {
      const next = [...ps];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      {posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts yet. The homepage shows only the Follow button until you add some.</p> : null}
      {posts.map((p, i) => (
        <div key={p.key} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[10rem_1fr_auto]">
          <SingleImageUpload id={`ig-${p.key}`} label="Picture (optional)" bucket="category-images" folder="instagram" value={p.image_path} onChange={(image_path) => set(p.key, { image_path })} maxEdge={800} />
          <div className="flex flex-col gap-3">
            <VideoField
              id={`igv-${p.key}`}
              value={p.video_path}
              busy={busy === p.key}
              onUpload={async (file) => {
                if (!["video/mp4", "video/webm"].includes(file.type)) return setMsg({ ok: false, text: "Use an MP4 or WebM video." });
                if (file.size > 50 * 1024 * 1024) return setMsg({ ok: false, text: "Video must be 50 MB or smaller (a 15–30 second clip is best)." });
                setBusy(p.key);
                const path = `instagram/${randomFileId()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
                const { error } = await createClient().storage.from("product-videos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
                setBusy(null);
                if (error) return setMsg({ ok: false, text: "Video upload failed." });
                set(p.key, { video_path: path });
                setMsg({ ok: true, text: "Video uploaded. Press Save gallery to publish it." });
              }}
              onClear={() => set(p.key, { video_path: "" })}
            />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">Instagram post link</span>
              <input value={p.url} onChange={(e) => set(p.key, { url: e.target.value })} placeholder="https://www.instagram.com/p/…" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">Caption (optional)</span>
              <input value={p.caption} onChange={(e) => set(p.key, { caption: e.target.value })} maxLength={150} className={inputCls} />
            </label>
          </div>
          <div className="flex gap-1 sm:flex-col">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-lg border hover:bg-muted disabled:opacity-40"><ArrowUp className="size-4" /></button>
            <button type="button" aria-label="Move down" disabled={i === posts.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-lg border hover:bg-muted disabled:opacity-40"><ArrowDown className="size-4" /></button>
            <button type="button" aria-label="Remove post" onClick={() => setPosts((ps) => ps.filter((x) => x.key !== p.key))} className="grid size-9 place-items-center rounded-lg text-danger hover:bg-danger-soft"><Trash2 className="size-4" /></button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={posts.length >= 12} onClick={() => setPosts((ps) => [...ps, { key: key(), url: "", image_path: null, video_path: "", caption: "" }])} className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50">
          <Plus aria-hidden className="size-4" /> Add post
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await saveInstagramPostsAction(posts.map(({ url, image_path, video_path, caption }) => ({ url, image_path: image_path ?? "", video_path, caption })));
              setMsg(res.ok ? { ok: true, text: "Saved. The homepage shows these posts now." } : { ok: false, text: res.error ?? "Couldn't save." });
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Save gallery
        </button>
        {msg ? <p role={msg.ok ? "status" : "alert"} className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : null}
      </div>
    </div>
  );
}

/** The reel's video file: the homepage plays it on its own (muted, looping). Instagram's player can't autoplay. */
function VideoField({ id, value, busy, onUpload, onClear }: { id: string; value: string; busy: boolean; onUpload: (f: File) => void; onClear: () => void }) {
  const src = value ? publicStorageUrl("product-videos", value) : null;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-deep">Video clip — plays automatically <span className="font-normal text-muted-foreground">(recommended)</span></span>
      {src ? (
        <div className="flex items-center gap-3">
          <video src={src} muted loop autoPlay playsInline className="h-24 w-14 rounded-md bg-deep object-cover" />
          <button type="button" onClick={onClear} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold text-deep hover:bg-muted">
            <X aria-hidden className="size-3.5" /> Remove video
          </button>
        </div>
      ) : (
        <label htmlFor={id} className={cn("inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-royal-300 px-4 font-semibold text-royal hover:bg-royal-50", busy && "pointer-events-none opacity-60")}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Film aria-hidden className="size-4" />}
          {busy ? "Uploading…" : "Upload reel video (MP4)"}
          <input id={id} type="file" accept="video/mp4,video/webm" className="sr-only" disabled={busy || !isSupabaseConfigured} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
        </label>
      )}
      <span className="text-xs text-muted-foreground">Save the reel from Instagram (or your phone) and upload it. Without a video, Instagram&apos;s own player is shown (it needs a tap to play).</span>
    </div>
  );
}
