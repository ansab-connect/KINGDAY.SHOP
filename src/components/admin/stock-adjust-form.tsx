"use client";

import { useState } from "react";
import { ActionForm, FieldError } from "@/components/forms/action-form";
import { adjustStockAction } from "@/features/admin/actions";

const selectCls =
  "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

/** Record a manual stock movement. The database function keeps the ledger and balance. */
export function StockAdjustForm({ skus, disabled }: { skus: { id: string; label: string; stock: number }[]; disabled?: boolean }) {
  const [type, setType] = useState("stock_in");
  if (disabled) {
    return <p className="text-sm text-muted-foreground">Stock changes are saved once Supabase is connected.</p>;
  }
  if (skus.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a product first, then record its stock here.</p>;
  }
  return (
    <ActionForm action={adjustStockAction} submitLabel="Save stock change" resetOnSuccess>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-deep">SKU</span>
            <select name="variantId" required className={selectCls} defaultValue="">
              <option value="" disabled>Choose a SKU…</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>{s.label} (in stock: {s.stock})</option>
              ))}
            </select>
            <FieldError state={state} name="variantId" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Movement</span>
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
              <option value="stock_in">Stock in (received)</option>
              <option value="stock_out">Stock out (damaged / lost)</option>
              <option value="return">Customer return</option>
              <option value="adjustment">Count correction</option>
            </select>
          </label>
          {type === "adjustment" ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">Direction</span>
              <select name="direction" className={selectCls} defaultValue="add">
                <option value="add">Add units</option>
                <option value="remove">Remove units</option>
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Quantity</span>
            <input name="quantity" type="number" inputMode="numeric" min={1} max={10000} required className={selectCls} />
            <FieldError state={state} name="quantity" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-deep">Reason</span>
            <input name="reason" required minLength={3} maxLength={300} placeholder="e.g. Supplier invoice #1042" className={selectCls} />
            <FieldError state={state} name="reason" />
          </label>
        </div>
      )}
    </ActionForm>
  );
}
