"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Package, Plus, Search, ShoppingBag, Trash2, Wrench } from "lucide-react";
import { CustomerPicker, EMPTY_CUSTOMER, type BillCustomer } from "@/components/admin/billing/customer-picker";
import { createBillAction, searchBillProductsAction, type BillProductHit } from "@/features/billing/actions";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = "sale" | "service";
type Pay = { key: number; method: (typeof METHODS)[number]["value"]; amount: string; reference: string };
type Line = { key: number; variantId: string | null; description: string; sku?: string; qty: number; price: string; available?: number };

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank" },
  { value: "other", label: "Other" },
] as const;

const SERVICE_QUICK = ["Service charge", "Labour charge", "Battery replacement", "Charger", "Motor repair", "Wiring / switch repair", "Tyre / wheel", "Remote repair"];

const toPaise = (rupees: string) => Math.round((Number(rupees) || 0) * 100);
let nextKey = 1;

/**
 * Manual counter bill. Pick Sale (products from the catalogue, stock goes down) or Service
 * (labour, parts and charges). The database works out the totals and the bill number.
 */
export function BillForm({ initialKind, allowSale, allowService }: { initialKind: Kind; allowSale: boolean; allowService: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(allowSale ? initialKind : "service");
  const [customer, setCustomer] = useState<BillCustomer>(EMPTY_CUSTOMER);
  const [extra, setExtra] = useState({ vehicle: "", note: "" });
  const [pays, setPays] = useState<Pay[]>([{ key: 0, method: "cash", amount: "", reference: "" }]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const subtotal = lines.reduce((s, l) => s + l.qty * toPaise(l.price), 0);
  const disc = Math.min(toPaise(discount), subtotal);
  const total = subtotal - disc;
  // An empty amount means "the rest of the bill" for that payment row.
  const payAmounts: number[] = [];
  for (const pr of pays) {
    const before = payAmounts.reduce((a, b) => a + b, 0);
    payAmounts.push(pr.amount === "" ? Math.max(total - before, 0) : toPaise(pr.amount));
  }
  const paidPaise = payAmounts.reduce((a, b) => a + b, 0);
  const updatePay = (key: number, patch: Partial<Pay>) => setPays((ps) => ps.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function switchKind(k: Kind) {
    if (k === kind) return;
    setKind(k);
    setLines([]);
    setError(null);
  }
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (l: Omit<Line, "key">) => setLines((ls) => [...ls, { ...l, key: nextKey++ }]);

  function addProduct(hit: BillProductHit) {
    const existing = lines.find((l) => l.variantId === hit.variantId);
    if (existing) update(existing.key, { qty: Math.min(existing.qty + 1, Math.max(hit.available, 1)) });
    else add({ variantId: hit.variantId, description: hit.name, sku: hit.sku, qty: 1, price: String(hit.price / 100), available: hit.available });
  }

  function save() {
    setError(null);
    if (!customer.id) return setError("Choose the customer by Customer ID (or create a new one).");
    if (paidPaise > total) return setError("Payments add up to more than the total.");
    if (!lines.length) return setError("Add at least one item.");
    if (lines.some((l) => !l.variantId && !l.description.trim())) return setError("Describe each item.");
    if (lines.some((l) => l.available !== undefined && l.qty > l.available)) return setError("Some items are more than the stock available.");
    start(async () => {
      const r = await createBillAction({
        kind,
        customer_id: customer.id,
        customer_name: customer.name || customer.code || "Customer",
        customer_phone: customer.phone,
        customer_address: customer.address,
        vehicle: kind === "service" ? extra.vehicle : "",
        note: extra.note,
        discount: disc,
        payments: pays.map((pr, i) => ({ method: pr.method, amount: payAmounts[i], reference: pr.reference })).filter((x) => x.amount > 0),
        items: lines.map((l) => ({ variant_id: l.variantId, description: l.description, quantity: l.qty, unit_price: toPaise(l.price) })),
      });
      if (!r.ok) return setError(r.error);
      router.push(`/admin/billing/${r.id}?new=1`);
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* 1. Bill type */}
        <section className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <h2 className="font-heading text-base font-semibold text-deep">1. Bill type</h2>
          <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Bill type">
            {([
              { k: "sale" as const, label: "Sale", hint: "Products from the shop", Icon: ShoppingBag, ok: allowSale },
              { k: "service" as const, label: "Service", hint: "Repair, labour, parts", Icon: Wrench, ok: allowService },
            ]).map(({ k, label, hint, Icon, ok }) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={!ok}
                onClick={() => switchKind(k)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:p-4",
                  kind === k ? "border-royal bg-royal-50" : "border-border hover:border-royal-200",
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", kind === k ? "bg-royal text-white" : "bg-muted text-royal")}>
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block font-heading font-semibold text-deep">{label} bill</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 2. Customer */}
        <section className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <h2 className="font-heading text-base font-semibold text-deep">2. Customer ID</h2>
          <CustomerPicker value={customer} onChange={setCustomer} />
          {kind === "service" ? (
            <Field label="Vehicle / product serviced" value={extra.vehicle} onChange={(v) => setExtra({ ...extra, vehicle: v })} placeholder="e.g. Kids Jeep 12V, red" maxLength={200} className="mt-3" />
          ) : null}
        </section>

        {/* 3. Items */}
        <section className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <h2 className="font-heading text-base font-semibold text-deep">3. {kind === "sale" ? "Products" : "Service items"}</h2>
          {kind === "sale" ? <ProductSearch onPick={addProduct} /> : (
            <div className="mt-3 flex flex-wrap gap-2">
              {SERVICE_QUICK.map((s) => (
                <button key={s} type="button" onClick={() => add({ variantId: null, description: s, qty: 1, price: "" })} className="rounded-full border px-3 py-1.5 text-sm font-medium text-deep hover:border-royal-200 hover:bg-royal-50">
                  + {s}
                </button>
              ))}
            </div>
          )}

          {lines.length ? (
            <ul className="mt-4 divide-y rounded-xl border">
              {lines.map((l) => {
                const over = l.available !== undefined && l.qty > l.available;
                return (
                  <li key={l.key} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1 basis-56">
                      {l.variantId ? (
                        <>
                          <p className="truncate text-sm font-semibold text-deep">{l.description}</p>
                          <p className={cn("text-xs", over ? "font-semibold text-danger" : "text-muted-foreground")}>
                            {l.sku} · {l.available} in stock
                          </p>
                        </>
                      ) : (
                        <input
                          aria-label="Item description"
                          value={l.description}
                          maxLength={200}
                          onChange={(e) => update(l.key, { description: e.target.value })}
                          placeholder="Item / work done"
                          className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100"
                        />
                      )}
                    </div>
                    <div className="flex items-center rounded-lg border">
                      <button type="button" aria-label="Less" onClick={() => update(l.key, { qty: Math.max(1, l.qty - 1) })} className="grid size-9 place-items-center text-deep hover:bg-muted">
                        <Minus aria-hidden className="size-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular">{l.qty}</span>
                      <button type="button" aria-label="More" onClick={() => update(l.key, { qty: Math.min(999, l.qty + 1) })} className="grid size-9 place-items-center text-deep hover:bg-muted">
                        <Plus aria-hidden className="size-4" />
                      </button>
                    </div>
                    <label className="flex items-center gap-1 text-sm">
                      <span className="text-muted-foreground">₹</span>
                      <input
                        aria-label="Price each"
                        inputMode="decimal"
                        value={l.price}
                        onChange={(e) => update(l.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                        placeholder="Price"
                        className="h-10 w-24 rounded-lg border px-2 text-right text-sm tabular outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100"
                      />
                    </label>
                    <span className="w-20 text-right text-sm font-semibold tabular">{formatPaise(l.qty * toPaise(l.price))}</span>
                    <button type="button" aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="grid size-9 place-items-center rounded-lg text-danger hover:bg-danger-soft">
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
              {kind === "sale" ? "Search a product above to add it." : "Tap an item above, or add your own."}
            </p>
          )}
          <button type="button" onClick={() => add({ variantId: null, description: "", qty: 1, price: "" })} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
            <Plus aria-hidden className="size-4" /> Add {kind === "sale" ? "other item" : "item"}
          </button>
        </section>
      </div>

      {/* 4. Payment + summary */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <section className="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <h2 className="font-heading text-base font-semibold text-deep">4. Payment</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatPaise(subtotal)}</dd></div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Discount (₹)</dt>
              <dd><input aria-label="Discount in rupees" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="h-9 w-24 rounded-lg border px-2 text-right tabular outline-none focus:border-royal-300" /></dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold text-deep"><dt>Total</dt><dd className="tabular">{formatPaise(total)}</dd></div>
          </dl>

          <p className="mt-4 text-sm font-medium text-deep">Payments</p>
          <ul className="mt-2 flex flex-col gap-2">
            {pays.map((pr, i) => (
              <li key={pr.key} className="rounded-xl border p-2">
                <div className="flex flex-wrap gap-1">
                  {METHODS.map((m) => (
                    <button key={m.value} type="button" aria-pressed={pr.method === m.value} onClick={() => updatePay(pr.key, { method: m.value })} className={cn("h-8 rounded-lg border px-2.5 text-xs font-semibold", pr.method === m.value ? "border-royal bg-royal text-white" : "hover:border-royal-200")}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">₹</span>
                  <input
                    aria-label={`Payment ${i + 1} amount`}
                    inputMode="decimal"
                    value={pr.amount}
                    onChange={(e) => updatePay(pr.key, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                    placeholder={String(payAmounts[i] / 100)}
                    className="h-9 w-24 rounded-lg border px-2 text-right text-sm tabular outline-none focus:border-royal-300"
                  />
                  {pr.method !== "cash" ? (
                    <input aria-label="Reference" value={pr.reference} maxLength={80} onChange={(e) => updatePay(pr.key, { reference: e.target.value })} placeholder="Ref / UTR (optional)" className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-xs" />
                  ) : (
                    <span className="flex-1" />
                  )}
                  {pays.length > 1 ? (
                    <button type="button" aria-label="Remove payment" onClick={() => setPays((ps) => ps.filter((x) => x.key !== pr.key))} className="grid size-8 place-items-center rounded-lg text-danger hover:bg-danger-soft">
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {pays.length < 6 ? (
            <button type="button" onClick={() => setPays((ps) => [...ps, { key: nextKey++, method: ps.some((x) => x.method === "cash") ? "upi" : "cash", amount: "", reference: "" }])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
              <Plus aria-hidden className="size-4" /> Add another payment (split)
            </button>
          ) : null}
          <p className={cn("mt-2 text-xs", paidPaise > total ? "font-semibold text-danger" : "text-muted-foreground")}>
            Paid {formatPaise(paidPaise)} · {paidPaise > total ? `${formatPaise(paidPaise - total)} more than the total` : paidPaise >= total ? "Fully paid." : `Balance due ${formatPaise(total - paidPaise)}.`} An empty amount takes the rest; type 0 if not paid.
          </p>
          <Field label="Note on bill" value={extra.note} onChange={(v) => setExtra({ ...extra, note: v })} placeholder="Optional, e.g. warranty 6 months" maxLength={1000} className="mt-3" />
        </section>

        {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{error}</p> : null}
        <button type="button" onClick={save} disabled={pending} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-royal text-base font-semibold text-white shadow-lift hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null} Save &amp; print bill · {formatPaise(total)}
        </button>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, className, ...rest }: { label: string; value: string; onChange: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-deep">{label}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-lg border px-3 outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100" />
    </label>
  );
}

function ProductSearch({ onPick }: { onPick: (hit: BillProductHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BillProductHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = window.setTimeout(async () => {
      setBusy(true);
      const r = await searchBillProductsAction(term);
      if (id === seq.current) {
        setHits(r);
        setBusy(false);
        setOpen(true);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div className="relative mt-3">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setOpen(false);
        }}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Search product name or SKU…"
        aria-label="Search products"
        className="h-11 w-full rounded-xl border bg-white pr-10 pl-9 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100"
      />
      {busy ? <Loader2 aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      {open && q.trim().length >= 2 ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-card p-1 shadow-lift">
          {hits.length ? (
            hits.map((h) => (
              <li key={h.variantId}>
                <button
                  type="button"
                  disabled={h.available < 1}
                  onClick={() => {
                    onPick(h);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Package aria-hidden className="size-4 shrink-0 text-royal" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-deep">{h.name}</span>
                    <span className="block text-xs text-muted-foreground">{h.sku} · {h.available > 0 ? `${h.available} in stock` : "Out of stock"}</span>
                  </span>
                  <span className="text-sm font-semibold tabular">{formatPaise(h.price)}</span>
                </button>
              </li>
            ))
          ) : busy ? null : (
            <li className="px-3 py-3 text-sm text-muted-foreground">No products found.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
