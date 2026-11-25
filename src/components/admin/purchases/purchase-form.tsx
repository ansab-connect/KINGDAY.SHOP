"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, PackageCheck, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { readBillPhotoAction, recordPurchaseAction } from "@/features/purchases/actions";
import { GST_RATES, matchVariant, PURCHASE_PAYMENT_MODES, type BillDraft, type VariantOption } from "@/features/purchases/shared";
import { formatPaise } from "@/lib/format";
import { optimizeImage, randomFileId } from "@/lib/image-optimize";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Line = { key: number; variant_id: string; description: string; quantity: string; unit_cost: string; gst_rate: string };
let seq = 0;
const newLine = (p: Partial<Line> = {}): Line => ({ key: ++seq, variant_id: "", description: "", quantity: "1", unit_cost: "", gst_rate: "12", ...p });
const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * New purchase: either "Import bill" (photo → AI reads it → check → save) or type it in.
 * Lines linked to a product add that much stock when saved; other lines (freight,
 * packing) are just recorded. Costs are before GST.
 */
export function PurchaseForm({ variants, suppliers, aiEnabled }: { variants: VariantOption[]; suppliers: { id: string; name: string; gstin: string | null }[]; aiEnabled: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [reading, setReading] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<{ path: string; preview: string } | null>(null);
  const [printedTotal, setPrintedTotal] = useState<number | null>(null);
  const [head, setHead] = useState({
    supplier_name: "",
    supplier_gstin: "",
    supplier_bill_no: "",
    bill_date: today(),
    payment_mode: "",
    paid: "",
    other_charges: "",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const setH = (k: keyof typeof head, v: string) => setHead((h) => ({ ...h, [k]: v }));
  const setLine = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const supplier = suppliers.find((s) => s.name.toLowerCase() === head.supplier_name.trim().toLowerCase()) ?? null;
  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + Math.round(num(l.unit_cost) * 100) * Math.max(0, Math.round(num(l.quantity))), 0);
    const tax = lines.reduce((s, l) => s + Math.round((Math.round(num(l.unit_cost) * 100) * Math.max(0, Math.round(num(l.quantity))) * num(l.gst_rate)) / 100), 0);
    const other = Math.round(num(head.other_charges) * 100);
    return { sub, tax, other, total: Math.max(0, sub + tax + other) };
  }, [lines, head.other_charges]);
  const stockLines = lines.filter((l) => l.variant_id);

  async function importPhoto(file: File, readWithAi: boolean) {
    setNote(null);
    setReading("Uploading photo…");
    try {
      const img = await optimizeImage(file, 2000, 0.9);
      const path = `purchases/${randomFileId()}.${img.extension}`;
      const { error } = await createClient().storage.from("business-docs").upload(path, img.blob, { contentType: img.blob.type, upsert: false });
      if (error) throw new Error("Upload failed. Check your permission and try again.");
      setPhoto({ path, preview: URL.createObjectURL(img.blob) });
      if (!readWithAi) {
        setReading(null);
        return;
      }
      setReading("Reading the bill with AI… (about 10 seconds)");
      const r = await readBillPhotoAction(path);
      if (!r.ok) throw new Error(r.error);
      apply(r.data);
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : "Couldn't read the bill." });
    } finally {
      setReading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function apply(d: BillDraft) {
    const known = suppliers.find((s) => (d.supplier_gstin && s.gstin === d.supplier_gstin) || s.name.toLowerCase() === d.supplier_name.toLowerCase());
    setHead((h) => ({
      ...h,
      supplier_name: known?.name ?? (d.supplier_name || h.supplier_name),
      supplier_gstin: d.supplier_gstin || known?.gstin || h.supplier_gstin,
      supplier_bill_no: d.supplier_bill_no || h.supplier_bill_no,
      bill_date: d.bill_date || h.bill_date,
      other_charges: d.other_charges ? String(d.other_charges) : h.other_charges,
    }));
    setLines(
      d.items.map((i) =>
        newLine({
          description: i.description,
          quantity: String(i.quantity),
          unit_cost: i.unit_cost ? String(i.unit_cost) : "",
          gst_rate: String(i.gst_rate),
          variant_id: matchVariant(i.description, variants)?.id ?? "",
        }),
      ),
    );
    setPrintedTotal(d.total || null);
    const matched = d.items.filter((i) => matchVariant(i.description, variants)).length;
    setNote({
      kind: "success",
      text: `Read ${d.items.length} item${d.items.length === 1 ? "" : "s"}; ${matched} matched to your products. Check every line (product, qty, cost, GST), pick products for the rest, then save.`,
    });
  }

  function save() {
    setNote(null);
    start(async () => {
      const r = await recordPurchaseAction({
        supplier_id: supplier?.id ?? "",
        supplier_name: head.supplier_name,
        supplier_gstin: head.supplier_gstin,
        supplier_bill_no: head.supplier_bill_no,
        bill_date: head.bill_date,
        payment_mode: head.payment_mode as "",
        paid: head.paid || 0,
        other_charges: head.other_charges || 0,
        image_path: photo?.path ?? "",
        notes: head.notes,
        save_supplier: !supplier,
        items: lines.map((l) => ({ variant_id: l.variant_id, description: l.description || variants.find((v) => v.id === l.variant_id)?.label || "", quantity: l.quantity, unit_cost: l.unit_cost || 0, gst_rate: l.gst_rate })),
      });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        setNote({ kind: "error", text: r.error });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(`/admin/purchases/${r.data.id}?saved=1`);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Import bill */}
        <section className="overflow-hidden rounded-2xl border border-royal-200 bg-gradient-to-br from-royal-50 to-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-royal text-gold">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-base font-bold text-deep">Import bill</h2>
              <p className="text-sm text-muted-foreground">Take a photo of the supplier&apos;s bill. The AI fills supplier, bill no., date and every item; you check and save.</p>
            </div>
          </div>
          <input
            ref={fileRef}
            id="bill-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && importPhoto(e.target.files[0], aiEnabled)}
            disabled={Boolean(reading)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="bill-photo" className={cn("inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-700", reading && "pointer-events-none opacity-60")}>
              {reading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Camera aria-hidden className="size-4" />}
              {reading ?? (aiEnabled ? "Take / upload bill photo" : "Attach bill photo")}
            </label>
            {!aiEnabled ? <span className="text-xs text-muted-foreground">AI reading isn&apos;t set up; the photo is kept with the purchase.</span> : null}
            {photo ? (
              <span className="inline-flex items-center gap-2 rounded-lg border bg-white p-1 pr-2 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={photo.preview} alt="Bill photo" className="size-10 rounded object-cover" />
                Photo attached
                <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" className="grid size-6 place-items-center rounded hover:bg-muted">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : null}
          </div>
        </section>

        {note ? <p role="status" className={cn("rounded-xl px-4 py-3 text-sm", note.kind === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{note.text}</p> : null}

        {/* Bill details */}
        <section className="rounded-2xl border bg-white p-5 shadow-card">
          <h2 className="mb-4 font-heading text-base font-bold text-deep">Bill details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" required error={errors.supplier_name}>
              <input list="suppliers" value={head.supplier_name} maxLength={120} onChange={(e) => setH("supplier_name", e.target.value)} placeholder="Type or pick a supplier" className={inputClass} />
              <datalist id="suppliers">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
              {head.supplier_name && !supplier ? <span className="text-xs text-muted-foreground">New supplier: saved for next time.</span> : null}
            </Field>
            <Field label="Supplier GSTIN" error={errors.supplier_gstin}>
              <input value={head.supplier_gstin} maxLength={15} onChange={(e) => setH("supplier_gstin", e.target.value.toUpperCase())} placeholder="32ABCDE1234F1Z5" className={cn(inputClass, "font-mono")} />
            </Field>
            <Field label="Supplier bill no." error={errors.supplier_bill_no}>
              <input value={head.supplier_bill_no} maxLength={60} onChange={(e) => setH("supplier_bill_no", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Bill date" required error={errors.bill_date}>
              <input type="date" value={head.bill_date} max={today()} onChange={(e) => setH("bill_date", e.target.value)} className={inputClass} />
            </Field>
          </div>
        </section>

        {/* Items */}
        <section className="rounded-2xl border bg-white p-5 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-base font-bold text-deep">Items</h2>
            <span className="text-xs text-muted-foreground">Cost is per unit, before GST. Lines with a product add stock.</span>
          </div>
          {errors.items ? <p className="mb-2 text-xs text-danger">{errors.items}</p> : null}
          <ul className="flex flex-col gap-3">
            {lines.map((l, i) => {
              const lineTotal = Math.round(num(l.unit_cost) * 100) * Math.max(0, Math.round(num(l.quantity)));
              const err = (f: string) => errors[`items.${i}.${f}`];
              return (
                <li key={l.key} className={cn("rounded-xl border p-3", l.variant_id ? "border-success/40 bg-success-soft/20" : "bg-muted/20")}>
                  <div className="grid gap-2 md:grid-cols-[1.4fr_1fr]">
                    <VariantPicker variants={variants} value={l.variant_id} onChange={(variant_id) => setLine(l.key, { variant_id })} />
                    <input aria-label="Description on the bill" value={l.description} maxLength={200} placeholder="Description on the bill" onChange={(e) => setLine(l.key, { description: e.target.value })} className={inputClass} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[6rem_8rem_7rem_1fr_auto] sm:items-end">
                    <Mini label="Qty" error={err("quantity")}>
                      <input inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value.replace(/[^\d]/g, "") })} className={inputClass} />
                    </Mini>
                    <Mini label="Cost ₹ (before GST)" error={err("unit_cost")}>
                      <input inputMode="decimal" value={l.unit_cost} onChange={(e) => setLine(l.key, { unit_cost: e.target.value.replace(/[^\d.]/g, "") })} className={inputClass} />
                    </Mini>
                    <Mini label="GST %" error={err("gst_rate")}>
                      <select value={l.gst_rate} onChange={(e) => setLine(l.key, { gst_rate: e.target.value })} className={inputClass}>
                        {[...GST_RATES].sort((a, b) => a - b).map((r) => (
                          <option key={r} value={String(r)}>{r}%</option>
                        ))}
                      </select>
                    </Mini>
                    <p className="col-span-2 self-center text-sm sm:col-span-1">
                      <span className="text-muted-foreground">Line: </span>
                      <span className="font-semibold text-deep tabular">{formatPaise(lineTotal)}</span>
                      <span className="text-xs text-muted-foreground"> + GST {formatPaise(Math.round((lineTotal * num(l.gst_rate)) / 100))}</span>
                    </p>
                    <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} aria-label="Remove line" className="grid size-10 place-items-center rounded-lg text-danger hover:bg-danger-soft">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {err("description") ? <p className="mt-1 text-xs text-danger">{err("description")}</p> : null}
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => setLines((ls) => [...ls, newLine({ gst_rate: ls[ls.length - 1]?.gst_rate ?? "12" })])} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-royal-200 px-3 text-sm font-semibold text-royal hover:bg-royal-50">
            <Plus aria-hidden className="size-4" /> Add item
          </button>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-card">
          <h2 className="mb-4 font-heading text-base font-bold text-deep">Payment</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Paid by">
              <select value={head.payment_mode} onChange={(e) => setH("payment_mode", e.target.value)} className={inputClass}>
                <option value="">—</option>
                {PURCHASE_PAYMENT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount paid (₹)">
              <input inputMode="decimal" value={head.paid} onChange={(e) => setH("paid", e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />
            </Field>
            <Field label="Freight / other / round-off (₹)" error={errors.other_charges}>
              <input inputMode="decimal" value={head.other_charges} onChange={(e) => setH("other_charges", e.target.value.replace(/[^\d.-]/g, ""))} className={inputClass} />
            </Field>
          </div>
          <Field label="Notes" className="mt-4">
            <textarea value={head.notes} maxLength={2000} rows={2} onChange={(e) => setH("notes", e.target.value)} className={cn(inputClass, "h-auto py-2")} />
          </Field>
        </section>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-2xl border bg-white p-5 shadow-card">
          <h2 className="mb-3 font-heading text-base font-bold text-deep">Summary</h2>
          <dl className="grid gap-1.5 text-sm">
            <Row k="Items" v={`${lines.length}`} />
            <Row k="Adds stock to" v={`${stockLines.length} product line${stockLines.length === 1 ? "" : "s"} (${stockLines.reduce((s, l) => s + Math.round(num(l.quantity)), 0)} units)`} />
            <Row k="Before GST" v={formatPaise(totals.sub)} />
            <Row k="GST" v={formatPaise(totals.tax)} />
            {totals.other ? <Row k="Other charges" v={formatPaise(totals.other)} /> : null}
            <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold text-deep">
              <dt>Total</dt>
              <dd className="tabular">{formatPaise(totals.total)}</dd>
            </div>
            {printedTotal ? (
              <p className={cn("text-xs", Math.abs(printedTotal * 100 - totals.total) <= 100 ? "text-success" : "text-gold-700")}>
                Bill shows {formatPaise(Math.round(printedTotal * 100))}
                {Math.abs(printedTotal * 100 - totals.total) <= 100 ? " ✓ matches" : ": check the lines"}
              </p>
            ) : null}
          </dl>
          <button type="button" onClick={save} disabled={pending || Boolean(reading)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-royal text-sm font-semibold text-white hover:bg-royal-700 disabled:opacity-60">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            Save purchase{stockLines.length ? " & add stock" : ""}
          </button>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <PackageCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" /> Stock is added as soon as you save. Mistakes: correct them in Inventory.
          </p>
        </section>
      </aside>
    </div>
  );
}

/** Searchable product picker (name or SKU). */
function VariantPicker({ variants, value, onChange }: { variants: VariantOption[]; value: string; onChange: (id: string) => void }) {
  const current = variants.find((v) => v.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return variants.slice(0, 30);
    return variants.filter((v) => `${v.label} ${v.sku}`.toLowerCase().includes(t)).slice(0, 30);
  }, [q, variants]);
  return (
    <div className="relative">
      <input
        aria-label="Product (adds stock)"
        value={open ? q : current ? `${current.label} (${current.sku})` : ""}
        placeholder="Pick product to add stock (optional)"
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        className={cn(inputClass, current && !open && "border-success/60 font-medium")}
      />
      {open ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-white p-1 shadow-lift">
          {current ? (
            <li>
              <button type="button" onMouseDown={() => onChange("")} className="w-full rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-muted">
                No product (don&apos;t add stock)
              </button>
            </li>
          ) : null}
          {hits.map((v) => (
            <li key={v.id}>
              <button type="button" onMouseDown={() => onChange(v.id)} className={cn("w-full rounded px-2 py-1.5 text-left text-sm hover:bg-royal-50", v.id === value && "bg-royal-50 font-semibold")}>
                {v.label} <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
              </button>
            </li>
          ))}
          {!hits.length ? <li className="px-2 py-1.5 text-sm text-muted-foreground">No product matches.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function Field({ label, required, error, className, children }: { label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-deep">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

function Mini({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-danger">{error}</span> : null}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium text-deep tabular">{v}</dd>
    </div>
  );
}
