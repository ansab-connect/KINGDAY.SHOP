"use client";

import { ActionForm, FieldError } from "@/components/forms/action-form";
import { markCodPaidAction, saveOrderNoteAction, saveShipmentAction, updateOrderStatusAction } from "@/features/admin/actions";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/features/orders/types";

const cls =
  "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";

export function OrderStatusForm({ orderId, next }: { orderId: string; next: OrderStatus[] }) {
  if (next.length === 0) return <p className="text-sm text-muted-foreground">This order is closed. No further status changes.</p>;
  return (
    <ActionForm action={updateOrderStatusAction} submitLabel="Update status" confirm="Change this order's status? The customer will see the new status.">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-deep">Move to</span>
        <select name="status" className={cls} defaultValue={next[0]}>
          {next.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}

type Shipment = { id: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null; status: string } | null;

export function ShipmentForm({ orderId, shipment }: { orderId: string; shipment: Shipment }) {
  return (
    <ActionForm action={saveShipmentAction} submitLabel={shipment ? "Update shipment" : "Add shipment"}>
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="orderId" value={orderId} />
          {shipment ? <input type="hidden" name="shipmentId" value={shipment.id} /> : null}
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Courier</span>
            <input name="carrier" maxLength={80} defaultValue={shipment?.carrier ?? ""} placeholder="e.g. Delhivery" className={cls} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Tracking number</span>
            <input name="trackingNumber" maxLength={80} defaultValue={shipment?.tracking_number ?? ""} className={cls} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-deep">Tracking link</span>
            <input name="trackingUrl" type="url" inputMode="url" defaultValue={shipment?.tracking_url ?? ""} placeholder="https://" className={cls} />
            <FieldError state={state} name="trackingUrl" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-deep">Shipment status</span>
            <select name="status" defaultValue={shipment?.status ?? "pending"} className={cls}>
              <option value="pending">Pending</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
              <option value="in_transit">In transit</option>
              <option value="delivered">Delivered</option>
            </select>
          </label>
        </div>
      )}
    </ActionForm>
  );
}

export function OrderNoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  return (
    <ActionForm action={saveOrderNoteAction} submitLabel="Save note">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-deep">Internal note (staff only)</span>
        <textarea name="note" rows={3} maxLength={2000} defaultValue={note ?? ""} className="w-full rounded-lg border bg-white px-3 py-2 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm" />
      </label>
    </ActionForm>
  );
}

export function MarkCodPaidForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={markCodPaidAction} submitLabel="Mark cash collected" pendingLabel="Recording…" confirm="Record that cash was collected for this order?" submitClassName="bg-success hover:bg-success/90">
      <input type="hidden" name="orderId" value={orderId} />
    </ActionForm>
  );
}
