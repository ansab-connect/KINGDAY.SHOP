"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { SingleImageUpload } from "@/components/admin/form/single-image-upload";
import { saveInstagramPostsAction } from "@/features/marketing/instagram-actions";
import { cn } from "@/lib/utils";

type Post = { key: string; url: string; image_path: string | null; caption: string };
const key = () => Math.random().toString(36).slice(2);
const inputCls = "h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

/** Royal Moments: paste each real post's link and upload its picture. Order = order on the homepage. */
export function InstagramEditor({ initial }: { initial: { url: string; image_path: string; caption: string }[] }) {
  const [posts, setPosts] = useState<Post[]>(initial.map((p) => ({ ...p, key: key() })));
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
        <button type="button" disabled={posts.length >= 12} onClick={() => setPosts((ps) => [...ps, { key: key(), url: "", image_path: null, caption: "" }])} className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50">
          <Plus aria-hidden className="size-4" /> Add post
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await saveInstagramPostsAction(posts.map(({ url, image_path, caption }) => ({ url, image_path: image_path ?? "", caption })));
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
