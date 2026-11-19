"use client";

import { useMemo, useState } from "react";
import { Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { ActionForm, FieldError, TextField } from "@/components/forms/action-form";
import { updateOrderDetailsAction, updateOrderItemsAction } from "@/features/admin/actions";
import type { FormState } from "@/features/forms";
import { formatPaise } from "@/lib/format";

const cls =
  "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

function EditToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-deep hover:bg-muted"
    >
      {open ? <X aria-hidden className="size-3.5" /> : <Pencil aria-hidden className="size-3.5" />}
      {open ? "Close" : label}
    </button>
  );
}

export function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {children}
    </p>
  );
}

// ---------------------------------------------------------------- Customer & address
export type OrderDetailsValues = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNote: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
};

export function OrderDetailsEditor({ orderId, values, children }: { orderId: string; values: OrderDetailsValues; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <EditToggle open={open} onClick={() => setOpen((o) => !o)} label="Edit details" />
      </div>
      {open ? (
        <ActionForm action={updateOrderDetailsAction} submitLabel="Save details">
          {(state: FormState) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="orderId" value={orderId} />
              <TextField label="Customer name" name="customerName" state={state} defaultValue={values.customerName} required maxLength={120} className="sm:col-span-2" />
              <TextField label="Phone" name="customerPhone" state={state} defaultValue={values.customerPhone} type="tel" inputMode="tel" required />
              <TextField label="Email (optional)" name="customerEmail" state={state} defaultValue={values.customerEmail} type="email" />
              <TextField label="House / building / street" name="line1" state={state} defaultValue={values.line1} required className="sm:col-span-2" />
              <TextField label="Area / locality" name="line2" state={state} defaultValue={values.line2} />
              <TextField label="Landmark" name="landmark" state={state} defaultValue={values.landmark} />
              <TextField label="City" name="city" state={state} defaultValue={values.city} required />
              <TextField label="State" name="state" state={state} defaultValue={values.state} required />
              <TextField label="PIN code" name="postalCode" state={state} defaultValue={values.postalCode} inputMode="numeric" maxLength={6} required />
              <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-deep">Customer note</span>
                <textarea name="customerNote" rows={2} maxLength={500} defaultValue={values.customerNote} className="w-full rounded-lg border bg-white px-3 py-2 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm" />
              </label>
            </div>
          )}
        </ActionForm>
      ) : (
        children
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Items & money
export type EditableLine = { variantId: string; name: string; sku: string; quantity: number; unitPrice: number /* rupees */ };
export type VariantOption = { id: string; label: string; sku: string; price: number /* rupees */; available: number };

export function OrderItemsEditor({
  orderId,
  lines: initial,
  shipping: initialShipping,
  discount: initialDiscount,
  tax,
  options,
  children,
}: {
  orderId: string;
  lines: EditableLine[];
  shipping: number;
  discount: number;
  tax: number;
  options: VariantOption[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState(initial);
  const [shipping, setShipping] = useState(String(initialShipping));
  const [discount, setDiscount] = useState(String(initialDiscount));
  const [adding, setAdding] = useState("");

  const subtotal = lines.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0);
  const total = subtotal - (Number(discount) || 0) + (Number(shipping) || 0) + tax;
  const available = useMemo(() => options.filter((o) => !lines.some((l) => l.variantId === o.id)), [options, lines]);

  const update = (i: number, patch: Partial<EditableLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () => {
    const o = options.find((x) => x.id === adding);
    if (!o) return;
    setLines((ls) => [...ls, { variantId: o.id, name: o.label, sku: o.sku, quantity: 1, unitPrice: o.price }]);
    setAdding("");
  };
  const reset = () => {
    setLines(initial);
    setShipping(String(initialShipping));
    setDiscount(String(initialDiscount));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <EditToggle
          open={open}
          onClick={() => {
            if (open) reset();
            setOpen((o) => !o);
          }}
          label="Edit items & prices"
        />
      </div>
      {!open ? (
        children
      ) : (
        <ActionForm action={updateOrderItemsAction} submitLabel="Save changes" confirm="Save these changes? Stock and the order total will be updated, and the customer is notified if the total changes.">
          {(state: FormState) => (
            <div className="flex flex-col gap-4">
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })))} />

              <ul className="flex flex-col gap-3">
                {lines.map((l, i) => (
                  <li key={l.variantId} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 rounded-xl border p-3 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate text-sm font-medium text-deep">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.sku}</p>
                    </div>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Qty</span>
                      <input type="number" inputMode="numeric" min={1} max={50} value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className={cls} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted-foreground">Unit price (₹)</span>
                      <input type="number" inputMode="decimal" min={1} step="1" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) })} className={cls} />
                    </label>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      disabled={lines.length === 1}
                      aria-label={`Remove ${l.name}`}
                      title={lines.length === 1 ? "An order needs at least one item. Cancel the order instead." : "Remove"}
                      className="row-start-1 col-start-2 grid size-10 place-items-center self-start rounded-lg border text-danger hover:bg-danger-soft disabled:opacity-40 sm:row-auto sm:col-auto sm:self-end"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Product to add" className={cls}>
                  <option value="">Add a product…</option>
                  {available.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.available <= 0}>
                      {o.label} · {o.sku} · ₹{o.price.toLocaleString("en-IN")} · {o.available > 0 ? `${o.available} free` : "out of stock"}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={add} disabled={!adding} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50">
                  <Plus aria-hidden className="size-4" /> Add
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-deep">Delivery charge (₹)</span>
                  <input name="shipping" type="number" inputMode="decimal" min={0} step="1" value={shipping} onChange={(e) => setShipping(e.target.value)} className={cls} />
                  <FieldError state={state} name="shipping" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-deep">Discount (₹)</span>
                  <input name="discount" type="number" inputMode="decimal" min={0} step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} className={cls} />
                  <FieldError state={state} name="discount" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium text-deep">Reason for the change</span>
                  <input name="reason" required minLength={3} maxLength={300} placeholder="e.g. Customer asked for 2 instead of 1" className={cls} />
                  <FieldError state={state} name="reason" />
                </label>
              </div>

              <dl className="grid gap-1 rounded-xl bg-muted/60 p-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Items</dt><dd className="tabular">{formatPaise(Math.round(subtotal * 100))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular">− {formatPaise(Math.round((Number(discount) || 0) * 100))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd className="tabular">{formatPaise(Math.round((Number(shipping) || 0) * 100))}</dd></div>
                <div className="flex justify-between border-t pt-1.5 font-bold text-deep"><dt>New total</dt><dd className="tabular">{formatPaise(Math.round(total * 100))}</dd></div>
              </dl>
            </div>
          )}
        </ActionForm>
      )}
    </div>
  );
}
