"use client";

import { ActionForm, TextField } from "@/components/forms/action-form";
import { reviewCustomItemAction } from "@/features/service/parts-actions";

/** Office decision on a technician's custom part: bill it (or not), and optionally add it to the master list. */
export function CustomItemReview({ id, name, price, requested }: { id: string; name: string; price: number; requested: boolean }) {
  return (
    <ActionForm action={reviewCustomItemAction} submitLabel="Save decision" submitClassName="h-9">
      {(state) => (
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-deep sm:col-span-2">
            <span className="font-semibold">{name}</span>
            {requested ? <span className="text-muted-foreground"> · technician asked to add it to the master list</span> : null}
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Decision</span>
            <select name="decision" defaultValue="approve" className="h-11 rounded-lg border bg-white px-3 text-base sm:text-sm">
              <option value="approve">Approve for this bill</option>
              <option value="reject">Reject (don&apos;t bill)</option>
            </select>
          </label>
          <TextField label="Price each (₹)" name="price" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={String(price / 100)} state={state} />
          <label className="flex items-center gap-2 text-sm text-deep sm:col-span-2">
            <input type="checkbox" name="addToMaster" defaultChecked={requested} className="size-4 accent-[#4B0082]" /> Also add to the Spare Parts master list
          </label>
          <TextField label="SKU (if adding)" name="sku" state={state} maxLength={40} placeholder="e.g. SP-HORN-SW" />
          <TextField label="Note" name="note" state={state} maxLength={300} />
        </div>
      )}
    </ActionForm>
  );
}
