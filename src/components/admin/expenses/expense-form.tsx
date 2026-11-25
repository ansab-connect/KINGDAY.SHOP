"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Trash2, X } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { addExpenseAction, deleteExpenseAction } from "@/features/expenses/actions";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salary advance", "Transport / Freight", "Shop maintenance", "Marketing / Ads", "Internet & phone", "Packing material", "Tea & food", "Bank charges", "Other"];
const MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;
const today = () => new Date().toISOString().slice(0, 10);

/** Quick "Add expense" form; a receipt photo is optional. */
export function ExpenseForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<string>("");
  const blank = { expense_date: today(), category: "", amount: "", payment_mode: "cash", paid_to: "", note: "" };
  const [v, setV] = useState(blank);
  const set = (k: keyof typeof blank, val: string) => setV((x) => ({ ...x, [k]: val }));
  const all = [...new Set([...EXPENSE_CATEGORIES, ...categories])];

  async function attach(file: File) {
    setUploading(true);
    setError(null);
    try {
      const img = await optimizeImage(file, 1600);
      const path = `expenses/${randomFileId()}.${img.extension}`;
      const { error: e } = await createClient().storage.from("business-docs").upload(path, img.blob, { contentType: img.blob.type });
      if (e) throw e;
      setReceipt(path);
    } catch {
      setError("Couldn't upload the receipt photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await addExpenseAction({ ...v, payment_mode: v.payment_mode as "cash", amount: v.amount, receipt_path: receipt });
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      setV({ ...blank, expense_date: v.expense_date });
      setReceipt("");
      setErrors({});
      setError(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="rounded-2xl border bg-white p-4 shadow-card sm:p-5" noValidate>
      <h2 className="mb-3 font-heading text-base font-bold text-deep">Add expense</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <L label="Date" error={errors.expense_date}>
          <input type="date" value={v.expense_date} max={today()} onChange={(e) => set("expense_date", e.target.value)} className={inputClass} />
        </L>
        <L label="Category" error={errors.category}>
          <input list="expense-cats" value={v.category} maxLength={40} placeholder="Pick or type" onChange={(e) => set("category", e.target.value)} className={inputClass} />
          <datalist id="expense-cats">
            {all.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </L>
        <L label="Amount (₹)" error={errors.amount}>
          <input inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />
        </L>
        <L label="Paid by">
          <select value={v.payment_mode} onChange={(e) => set("payment_mode", e.target.value)} className={inputClass}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </L>
        <L label="Paid to (optional)">
          <input value={v.paid_to} maxLength={120} placeholder="e.g. KSEB" onChange={(e) => set("paid_to", e.target.value)} className={inputClass} />
        </L>
        <L label="Note (optional)">
          <input value={v.note} maxLength={500} onChange={(e) => set("note", e.target.value)} className={inputClass} />
        </L>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input ref={fileRef} id="expense-receipt" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
        {receipt ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs">
            Receipt attached
            <button type="button" onClick={() => setReceipt("")} aria-label="Remove receipt" className="grid size-5 place-items-center rounded hover:bg-muted">
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <label htmlFor="expense-receipt" className={cn("inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium text-deep hover:bg-muted", uploading && "pointer-events-none opacity-60")}>
            {uploading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Camera aria-hidden className="size-4" />} Receipt photo (optional)
          </label>
        )}
        <button type="submit" disabled={pending || uploading} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-700 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />} Add expense
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Delete expense"
      onClick={() => {
        if (!window.confirm("Delete this expense?")) return;
        start(async () => {
          const r = await deleteExpenseAction(id);
          if (!r.ok) window.alert(r.error);
          router.refresh();
        });
      }}
      className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger-soft disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  );
}

function L({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-deep">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}
