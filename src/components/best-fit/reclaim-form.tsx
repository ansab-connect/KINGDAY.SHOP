"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { Notice } from "@/components/best-fit/op-form";
import { runOp, type OpResult } from "@/features/best-fit/ops";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";

const CATS = [["travel", "Travel"], ["fuel", "Fuel"], ["parking", "Parking"], ["toll", "Toll"], ["spare_parts", "Spare parts"], ["other", "Other"]];

/** Staff submit a reclaim with an optional receipt photo/PDF (private storage, own folder). */
export function ReclaimForm({ userId, bookings }: { userId: string; bookings: { value: string; label: string }[] }) {
  const file = useRef<HTMLInputElement>(null);
  const [v, setV] = useState({ category: "fuel", expense_date: new Date().toISOString().slice(0, 10), amount: "", description: "", booking_id: "" });
  const [receipt, setReceipt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<OpResult | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }));

  async function attach(f: File) {
    setUploading(true);
    try {
      const isPdf = f.type === "application/pdf";
      const blob = isPdf ? f : (await optimizeImage(f, 1600)).blob;
      const ext = isPdf ? "pdf" : blob.type === "image/webp" ? "webp" : "jpg";
      const path = `reclaims/${userId}/${randomFileId()}.${ext}`;
      const { error } = await createClient().storage.from("business-docs").upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      setReceipt(path);
    } catch {
      setResult({ ok: false, error: "Couldn't upload the receipt. Try again." });
    } finally {
      setUploading(false);
    }
  }

  function save(submit: boolean) {
    start(async () => {
      const r = await runOp("reclaim.save", { ...v, amount_paise: Math.round(Number(v.amount) * 100), booking_id: v.booking_id || null, receipt_path: receipt || null, submit });
      setResult(r);
      if (r.ok) {
        setV((s) => ({ ...s, amount: "", description: "" }));
        setReceipt("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Type</span><select value={v.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Date</span><input type="date" value={v.expense_date} onChange={(e) => set("expense_date", e.target.value)} className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Amount (₹)</span><input type="number" step="0.01" inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Booking / work order</span><select value={v.booking_id} onChange={(e) => set("booking_id", e.target.value)} className={inputClass}><option value="">Not for one booking</option>{bookings.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="font-medium">Description</span><input value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Petrol to Feroke and back" className={inputClass} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => file.current?.click()} disabled={uploading} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-deep">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{receipt ? "Receipt added ✓" : "Add receipt"}
        </button>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
        <button type="button" disabled={pending || uploading} onClick={() => save(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" /> : null}Submit</button>
        <button type="button" disabled={pending || uploading} onClick={() => save(false)} className="h-10 rounded-lg border px-4 text-sm font-semibold text-deep">Save draft</button>
        <Notice r={result} />
      </div>
    </div>
  );
}
