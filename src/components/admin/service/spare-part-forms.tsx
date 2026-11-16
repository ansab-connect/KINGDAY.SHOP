"use client";

import { ActionForm, FieldError, TextField } from "@/components/forms/action-form";
import { adjustSparePartStockAction, saveSparePartAction } from "@/features/service/parts-actions";

export type PartRow = {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  compatible_models: string | null;
  selling_price_paise: number;
  purchase_price_paise: number | null;
  stock: number;
  low_stock_threshold: number;
  is_active: boolean;
};

const rupees = (p: number | null | undefined) => (p ? String(p / 100) : "");

export function SparePartForm({ value, categories }: { value?: PartRow; categories: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveSparePartAction} submitLabel={value ? "Save part" : "Add part"} resetOnSuccess={!value}>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={value?.id ?? ""} />
          <TextField label="Item name" name="name" state={state} defaultValue={value?.name} required maxLength={120} />
          <TextField label="SKU" name="sku" state={state} defaultValue={value?.sku} required maxLength={40} placeholder="SP-BAT-12V" />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Category</span>
            <select name="category_id" defaultValue={value?.category_id ?? ""} className="h-11 rounded-lg border bg-white px-3 text-base sm:text-sm">
              <option value="">Any</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <FieldError state={state} name="category_id" />
          </label>
          <TextField label="Compatible products / models" name="compatible_models" state={state} defaultValue={value?.compatible_models ?? ""} maxLength={300} />
          <TextField label="Purchase price (₹)" name="purchase" type="number" min={0} step="0.01" inputMode="decimal" state={state} defaultValue={rupees(value?.purchase_price_paise)} />
          <TextField label="Selling price (₹)" name="selling" type="number" min={0} step="0.01" inputMode="decimal" state={state} defaultValue={rupees(value?.selling_price_paise)} />
          <TextField label="Low stock alert at" name="threshold" type="number" min={0} max={10000} state={state} defaultValue={String(value?.low_stock_threshold ?? 2)} />
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-deep">
            <input type="checkbox" name="is_active" defaultChecked={value?.is_active ?? true} className="size-4 accent-[#4B0082]" /> Active
          </label>
        </div>
      )}
    </ActionForm>
  );
}

export function StockForm({ id }: { id: string }) {
  return (
    <ActionForm action={adjustSparePartStockAction} submitLabel="Update stock" resetOnSuccess submitClassName="h-9">
      {(state) => (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Type</span>
            <select name="type" defaultValue="stock_in" className="h-11 rounded-lg border bg-white px-3 text-base sm:text-sm">
              <option value="stock_in">Stock in (+)</option>
              <option value="opening">Opening stock (+)</option>
              <option value="adjustment">Adjustment (+/−)</option>
            </select>
          </label>
          <TextField label="Quantity" name="quantity" type="number" min={-10000} max={10000} state={state} required />
          <TextField label="Note" name="note" state={state} maxLength={300} className="col-span-2" />
        </div>
      )}
    </ActionForm>
  );
}
