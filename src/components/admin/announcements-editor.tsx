"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { saveAnnouncementsAction } from "@/features/marketing/announcement-actions";

type Item = { key: number; text: string; href: string };
let nextKey = 1;
const inputCls = "h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100";

/** Edit the moving top-bar messages: text, optional link, order. */
export function AnnouncementsEditor({ initial }: { initial: { text: string; href: string }[] }) {
  const [items, setItems] = useState<Item[]>(initial.map((a) => ({ key: nextKey++, ...a })));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (key: number, patch: Partial<Item>) => setItems((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) =>
    setItems((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
      return n;
    });

  return (
    <div className="flex flex-col gap-3">
      {/* Live preview */}
      <div className="overflow-hidden rounded-xl bg-royal px-4 py-2.5 text-sm font-medium whitespace-nowrap text-white">
        {items.filter((i) => i.text.trim()).map((i) => i.text).join("   ✦   ") || "No messages: the top bar is hidden."}
      </div>
      {items.map((it, i) => (
        <div key={it.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_14rem_auto]">
          <input value={it.text} maxLength={90} onChange={(e) => set(it.key, { text: e.target.value })} placeholder="Message, e.g. 🎁 Diwali offers up to 40% off" aria-label={`Message ${i + 1}`} className={inputCls} />
          <input value={it.href} maxLength={300} onChange={(e) => set(it.key, { href: e.target.value.trim() })} placeholder="Link (optional), e.g. /offers" aria-label={`Link for message ${i + 1}`} className={inputCls} />
          <div className="flex gap-1">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-10 place-items-center rounded-lg border hover:bg-muted disabled:opacity-40"><ArrowUp className="size-4" /></button>
            <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="grid size-10 place-items-center rounded-lg border hover:bg-muted disabled:opacity-40"><ArrowDown className="size-4" /></button>
            <button type="button" aria-label="Remove" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="grid size-10 place-items-center rounded-lg text-danger hover:bg-danger-soft"><Trash2 className="size-4" /></button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={items.length >= 10} onClick={() => setItems((l) => [...l, { key: nextKey++, text: "", href: "" }])} className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50">
          <Plus aria-hidden className="size-4" /> Add message
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setStatus(null);
              const r = await saveAnnouncementsAction(items.filter((x) => x.text.trim()).map(({ text, href }) => ({ text, href })));
              setStatus(r.ok ? { ok: true, text: "Saved. The top bar on the website is updated." } : { ok: false, text: r.error ?? "Couldn't save." });
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Save
        </button>
        {status ? <p role="status" className={status.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>{status.text}</p> : null}
      </div>
    </div>
  );
}
