"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { L } from "@/components/i18n/lang";
import { saveServiceInvoiceAction } from "@/features/service/invoice-actions";
import { cn } from "@/lib/utils";

type Item = { key: string; description: string; quantity: string; price: string };
export type InvoiceDraft = {
  service_description: string;
  basic: string;
  labour: string;
  discount: string;
  tax: string;
  /** Additional charges only (spare parts come from Replaced Items). */
  items: { description: string; quantity: number; unit_price: number; kind?: string }[];
  payment_method: string;
  amount_paid: string;
};

const toPaise = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const key = () => Math.random().toString(36).slice(2);

const METHODS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["bank_transfer", "Bank transfer"],
  ["other", "Other"],
] as const;

/**
 * Service bill: Service charge + Labour + Spare parts + Additional charges − Discount + Tax = Grand total.
 * Amount paid (advance) gives the balance. Technicians save drafts; people with the billing
 * approve permission approve the bill, which is when the customer can see it.
 */
export function InvoiceEditor({
  bookingId,
  initial,
  invoiceId,
  locked,
  sparePartsTotal,
  canApprove = false,
  approved = false,
}: {
  bookingId: string;
  initial: InvoiceDraft;
  invoiceId: string | null;
  locked: boolean;
  sparePartsTotal: number;
  canApprove?: boolean;
  approved?: boolean;
}) {
  const router = useRouter();
  const [desc, setDesc] = useState(initial.service_description);
  const [basic, setBasic] = useState(initial.basic);
  const [labour, setLabour] = useState(initial.labour);
  const [discount, setDiscount] = useState(initial.discount);
  const [tax, setTax] = useState(initial.tax);
  const [items, setItems] = useState<Item[]>(
    initial.items
      .filter((i) => (i.kind ?? "additional") === "additional")
      .map((i) => ({ key: key(), description: i.description, quantity: String(i.quantity), price: String(i.unit_price / 100) })),
  );
  const [method, setMethod] = useState(initial.payment_method);
  const [paid, setPaid] = useState(initial.amount_paid);
  const [approve, setApprove] = useState(approved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const lines = items.map((i) => ({ ...i, total: Math.max(0, Math.trunc(Number(i.quantity) || 0)) * toPaise(i.price) }));
  const additional = lines.reduce((n, l) => n + l.total, 0);
  const subtotal = toPaise(basic) + toPaise(labour) + sparePartsTotal + additional;
  const disc = toPaise(discount);
  const taxPct = Math.min(28, Math.max(0, Number(tax) || 0));
  const taxAmount = Math.round(((subtotal - Math.min(disc, subtotal)) * taxPct) / 100);
  const grand = subtotal - Math.min(disc, subtotal) + taxAmount;
  const paidPaise = Math.min(toPaise(paid), grand);
  const balance = Math.max(grand - paidPaise, 0);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await saveServiceInvoiceAction({
      bookingId,
      service_description: desc,
      basic_charge: toPaise(basic),
      labour_charge: toPaise(labour),
      discount: disc,
      tax_percent: taxPct,
      items: lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), quantity: Math.max(1, Math.trunc(Number(l.quantity) || 1)), unit_price: toPaise(l.price) })),
      amount_paid: paidPaise,
      payment_method: method,
      approve: canApprove && approve,
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: canApprove && approve ? `Bill ${res.number} approved. The customer can see it now.` : `Bill ${res.number} saved as a draft for office approval.` });
      router.refresh();
    } else setMsg({ ok: false, text: res.error });
  }

  if (locked) {
    return (
      <p className="text-sm text-muted-foreground">
        <L en="This bill is approved or paid. Only the office can change it." ml="ഈ ബിൽ അംഗീകരിച്ചു / അടച്ചു. ഓഫീസിന് മാത്രമേ മാറ്റാനാകൂ." />
      </p>
    );
  }

  const money = (value: string, set: (v: string) => void, label: React.ReactNode, id: string) => (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm font-medium text-deep">
      {label}
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
        <input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" className={cn(inputClass, "pl-7 tabular")} />
      </div>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
        <L en="Service description" ml="സർവീസ് വിവരണം" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={2000} className={cn(inputClass, "h-auto py-2")} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {money(basic, setBasic, <L en="Service charge" ml="സർവീസ് ചാർജ്" />, `inv-basic-${bookingId}`)}
        {money(labour, setLabour, <L en="Labour charge" ml="ലേബർ ചാർജ്" />, `inv-labour-${bookingId}`)}
      </div>

      <p className="flex justify-between rounded-lg bg-royal-50 px-3 py-2 text-sm">
        <span className="text-deep"><L en="Spare parts (from Replaced Items)" ml="സ്പെയർ പാർട്സ്" /></span>
        <span className="font-semibold text-royal tabular">{rupees(sparePartsTotal)}</span>
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-deep"><L en="Additional charges" ml="അധിക ചാർജുകൾ" /></p>
        {lines.map((l, idx) => (
          <div key={l.key} className="grid grid-cols-[1fr_4rem_6rem_auto] items-center gap-2">
            <input
              value={l.description}
              onChange={(e) => setItems(items.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))}
              maxLength={200}
              placeholder="e.g. Transport"
              aria-label={`Charge ${idx + 1} description`}
              className={inputClass}
            />
            <input
              value={l.quantity}
              onChange={(e) => setItems(items.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
              inputMode="numeric"
              aria-label={`Charge ${idx + 1} quantity`}
              className={cn(inputClass, "text-center tabular")}
            />
            <input
              value={l.price}
              onChange={(e) => setItems(items.map((x) => (x.key === l.key ? { ...x, price: e.target.value } : x)))}
              inputMode="decimal"
              placeholder="₹ each"
              aria-label={`Charge ${idx + 1} price`}
              className={cn(inputClass, "tabular")}
            />
            <button type="button" onClick={() => setItems(items.filter((x) => x.key !== l.key))} aria-label={`Remove charge ${idx + 1}`} className="grid size-10 place-items-center rounded-lg text-danger hover:bg-danger-soft">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setItems([...items, { key: key(), description: "", quantity: "1", price: "" }])} className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-deep hover:bg-muted">
          <Plus aria-hidden className="size-4" /> <L en="Add charge" ml="ചാർജ് ചേർക്കുക" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {money(discount, setDiscount, <L en="Discount" ml="ഇളവ്" />, `inv-disc-${bookingId}`)}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
          <L en="Tax %" ml="നികുതി %" />
          <input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" className={cn(inputClass, "tabular")} />
        </label>
      </div>

      <dl className="flex flex-col gap-1 rounded-xl bg-muted/50 p-4 text-sm tabular">
        {[
          ["Subtotal", rupees(subtotal)],
          ["Discount", `− ${rupees(Math.min(disc, subtotal))}`],
          [`Tax (${taxPct}%)`, rupees(taxAmount)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="text-deep">{v}</dd></div>
        ))}
        <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold"><dt className="text-deep"><L en="Grand total" ml="ആകെ" /></dt><dd className="text-royal">{rupees(grand)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground"><L en="Paid / advance" ml="അടച്ചത്" /></dt><dd className="text-deep">{rupees(paidPaise)}</dd></div>
        <div className="flex justify-between font-semibold"><dt className="text-deep"><L en="Balance" ml="ബാക്കി" /></dt><dd className={balance ? "text-warning" : "text-success"}>{rupees(balance)}</dd></div>
      </dl>
      {disc > subtotal ? <p className="text-xs text-danger">The discount is larger than the total.</p> : null}

      <div className="grid grid-cols-2 gap-3">
        {money(paid, setPaid, <L en="Amount paid (advance)" ml="അടച്ച തുക" />, `inv-paid-${bookingId}`)}
        <label className="flex flex-col gap-1.5 text-sm font-medium text-deep">
          <L en="Payment method" ml="പേയ്മെന്റ് രീതി" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {canApprove ? (
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm text-deep">
          <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} className="size-4 accent-[#4B0082]" />
          <BadgeCheck aria-hidden className="size-4 text-royal" /> Approve this bill (the customer can see it)
        </label>
      ) : (
        <p className="text-xs text-muted-foreground"><L en="The office approves the bill before the customer sees it." ml="ഉപഭോക്താവ് കാണുന്നതിന് മുമ്പ് ഓഫീസ് ബിൽ അംഗീകരിക്കും." /></p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || disc > subtotal} className="inline-flex h-12 items-center gap-2 rounded-xl bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {invoiceId ? <L en="Update bill" ml="ബിൽ പുതുക്കുക" /> : <L en="Generate bill" ml="ബിൽ ഉണ്ടാക്കുക" />}
        </button>
        {invoiceId ? (
          <Link href={`/service-invoice/${invoiceId}`} target="_blank" className="inline-flex h-12 items-center gap-2 rounded-xl border px-5 text-sm font-semibold text-deep hover:bg-muted">
            <FileText aria-hidden className="size-4" /> <L en="View / print" ml="കാണുക / പ്രിന്റ്" />
          </Link>
        ) : null}
        {msg ? <p role={msg.ok ? "status" : "alert"} className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
