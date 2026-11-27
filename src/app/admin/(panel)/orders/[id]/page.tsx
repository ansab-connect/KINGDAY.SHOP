import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone, Tag } from "lucide-react";
import { MarkCodPaidForm, OrderNoteForm, OrderStatusForm, ShipmentForm } from "@/components/admin/order-actions";
import { LockedNote, OrderDetailsEditor, OrderItemsEditor, type VariantOption } from "@/components/admin/order-edit-forms";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NEXT_STATUSES, getOrderDetail } from "@/features/orders/queries";
import { ORDER_STATUS_LABEL, type PaymentStatus } from "@/features/orders/types";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const EDITABLE_STATUSES = ["new", "pending", "confirmed", "processing", "packed"];

/** Active products staff can add to an order (prices in rupees for the form). */
async function loadVariantOptions(): Promise<VariantOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_variants")
    .select("id, sku, name, price, product:products!inner(name, status), inventory(on_hand, reserved)")
    .eq("is_active", true)
    .eq("product.status", "active")
    .order("sku")
    .limit(1000);
  type Row = { id: string; sku: string; name: string; price: number; product: { name: string }; inventory: { on_hand: number; reserved: number } | { on_hand: number; reserved: number }[] | null };
  return ((data ?? []) as unknown as Row[]).map((v) => {
    const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
    return {
      id: v.id,
      sku: v.sku,
      label: v.name === "Default" ? v.product.name : `${v.product.name} · ${v.name}`,
      price: v.price / 100,
      available: Math.max((inv?.on_hand ?? 0) - (inv?.reserved ?? 0), 0),
    };
  });
}

export const metadata: Metadata = { title: "Order" };

async function OrderContent({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured) notFound();
  const o = await getOrderDetail(id, { staff: true });
  if (!o) notFound();
  const editable = EDITABLE_STATUSES.includes(o.status);
  const itemsLocked = ["paid", "authorized", "refunded"].includes(o.payment_status);
  const canEditItems = editable && !itemsLocked && o.order_items.every((i) => i.variant_id);
  const options = canEditItems ? await loadVariantOptions() : [];
  const a = o.shipping_address ?? {};
  const shipment = o.shipments.at(-1) ?? null;
  const phoneDigits = o.customer_phone.replace(/\D/g, "");
  const waNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  const wa = phoneDigits
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${o.customer_name}, this is KING DAY about your order ${o.order_number}.`)}`
    : null;
  const payment = (["authorized", "paid", "failed", "refunded"].includes(o.payment_status) ? o.payment_status : "pending") as PaymentStatus;

  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-royal">
        <ArrowLeft aria-hidden className="size-4" /> All orders
      </Link>
      <PageHeader
        title={`Order ${o.order_number}`}
        description={`Placed ${formatDateTime(new Date(o.placed_at))} · ${o.payment_method === "cod" ? "Cash on delivery" : "Razorpay"}`}
        actions={
          <>
            <OrderStatusBadge status={o.status} />
            <PaymentStatusBadge status={payment} />
            <Button asChild size="sm" className="bg-royal text-white hover:bg-royal-800">
              <a href={`/admin/orders/${o.id}/label`} target="_blank" rel="noopener noreferrer">
                <Tag aria-hidden className="size-4" /> Download shipping label
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/order-invoice/${o.id}`} target="_blank" rel="noopener noreferrer">Invoice / PDF</a>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Items</CardTitle></CardHeader>
            <CardContent>
              {canEditItems ? (
                <OrderItemsEditor
                  orderId={o.id}
                  lines={o.order_items.map((i) => ({
                    variantId: i.variant_id as string,
                    name: [i.product_name, i.variant_name && i.variant_name !== "Default" ? i.variant_name : null].filter(Boolean).join(" · "),
                    sku: i.sku,
                    quantity: i.quantity,
                    unitPrice: i.unit_price / 100,
                  }))}
                  shipping={o.shipping_total / 100}
                  discount={o.discount_total / 100}
                  tax={o.tax_total / 100}
                  options={options}
                >
                  <ul className="divide-y">
                    {o.order_items.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-deep">{i.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[i.variant_name, i.sku].filter(Boolean).join(" · ")} · {formatPaise(i.unit_price)} × {i.quantity}
                          </p>
                          {i.cycle_size ? <p className="text-xs text-muted-foreground">Size: {i.cycle_size}</p> : null}
                          {i.warranty ? <p className="text-xs text-muted-foreground">{i.warranty}</p> : null}
                        </div>
                        <span className="shrink-0 font-semibold tabular">{formatPaise(i.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
                    <Row label="Subtotal" value={formatPaise(o.subtotal)} />
                    {o.discount_total ? <Row label={`Discount${o.coupon_code ? ` (${o.coupon_code})` : ""}`} value={`− ${formatPaise(o.discount_total)}`} /> : null}
                    <Row label="Shipping" value={o.shipping_total ? formatPaise(o.shipping_total) : "Free"} />
                    {o.tax_total ? <Row label="Tax" value={formatPaise(o.tax_total)} /> : null}
                    <Row label="Total" value={formatPaise(o.grand_total)} strong />
                  </dl>
                </OrderItemsEditor>
              ) : (
                <>
                  <ul className="divide-y">
                    {o.order_items.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-deep">{i.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[i.variant_name, i.sku].filter(Boolean).join(" · ")} · {formatPaise(i.unit_price)} × {i.quantity}
                          </p>
                          {i.cycle_size ? <p className="text-xs text-muted-foreground">Size: {i.cycle_size}</p> : null}
                          {i.warranty ? <p className="text-xs text-muted-foreground">{i.warranty}</p> : null}
                        </div>
                        <span className="shrink-0 font-semibold tabular">{formatPaise(i.line_total)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
                    <Row label="Subtotal" value={formatPaise(o.subtotal)} />
                    {o.discount_total ? <Row label={`Discount${o.coupon_code ? ` (${o.coupon_code})` : ""}`} value={`− ${formatPaise(o.discount_total)}`} /> : null}
                    <Row label="Shipping" value={o.shipping_total ? formatPaise(o.shipping_total) : "Free"} />
                    {o.tax_total ? <Row label="Tax" value={formatPaise(o.tax_total)} /> : null}
                    <Row label="Total" value={formatPaise(o.grand_total)} strong />
                  </dl>
                  <div className="mt-4">
                    <LockedNote>
                      {!editable
                        ? "Items can't be changed after the order ships."
                        : itemsLocked
                          ? "This order is already paid, so items and prices are locked. To change it, cancel and place a new order, or refund the difference in Razorpay."
                          : "A product in this order was deleted from the catalogue, so its items can't be edited."}
                    </LockedNote>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Shipment & tracking</CardTitle></CardHeader>
            <CardContent><ShipmentForm orderId={o.id} shipment={shipment} /></CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Status history</CardTitle></CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3 text-sm">
                {o.order_status_history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {h.from_status ? `${ORDER_STATUS_LABEL[h.from_status]} → ` : ""}
                      <strong className="text-deep">{ORDER_STATUS_LABEL[h.to_status]}</strong>
                      {h.note ? ` · ${h.note}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(new Date(h.created_at))}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Update status</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-5">
              <OrderStatusForm orderId={o.id} next={NEXT_STATUSES[o.status]} />
              {o.payment_method === "cod" && o.payment_status !== "paid" && o.payment_status !== "refunded" ? <MarkCodPaidForm orderId={o.id} /> : null}
            </CardContent>
          </Card>

          <Card id="delivery" className="scroll-mt-24 shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Customer &amp; delivery address</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {editable ? (
                <OrderDetailsEditor
                  orderId={o.id}
                  values={{
                    customerName: o.customer_name,
                    customerPhone: o.customer_phone,
                    customerEmail: o.customer_email ?? "",
                    customerNote: o.customer_note ?? "",
                    line1: a.line1 ?? "",
                    line2: a.line2 ?? "",
                    landmark: a.landmark ?? "",
                    city: a.city ?? "",
                    state: a.state ?? "",
                    postalCode: a.postal_code ?? "",
                  }}
                >
                  <CustomerSummary name={o.customer_name} phone={o.customer_phone} email={o.customer_email} lines={[a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), a.postal_code]} />
                </OrderDetailsEditor>
              ) : (
                <>
                  <CustomerSummary name={o.customer_name} phone={o.customer_phone} email={o.customer_email} lines={[a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), a.postal_code]} />
                  <LockedNote>Customer details can&apos;t be changed after the order ships.</LockedNote>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><a href={`tel:${o.customer_phone}`}><Phone aria-hidden /> Call</a></Button>
                {wa ? <Button variant="outline" size="sm" asChild><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> WhatsApp</a></Button> : null}
                {o.customer_email ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${o.customer_email}?subject=${encodeURIComponent(`Your KING DAY order ${o.order_number}`)}`}><Mail aria-hidden /> Email</a>
                  </Button>
                ) : null}
              </div>
              {o.customer_note ? <p className="rounded-lg bg-muted px-3 py-2"><span className="font-medium text-deep">Customer note:</span> {o.customer_note}</p> : null}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Notes</CardTitle></CardHeader>
            <CardContent><OrderNoteForm orderId={o.id} note={o.internal_note} /></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function CustomerSummary({ name, phone, email, lines }: { name: string; phone: string; email: string | null; lines: (string | undefined)[] }) {
  return (
    <div>
      <p className="font-medium text-deep">{name}</p>
      <p className="text-muted-foreground">{phone}{email ? ` · ${email}` : ""}</p>
      <address className="mt-1 text-muted-foreground not-italic">
        {lines.filter(Boolean).map((l, i) => (
          <span key={i} className="block">{l}</span>
        ))}
      </address>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "pt-1.5 text-base font-bold text-deep" : "text-muted-foreground"}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

export default function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <StaffOnly module="orders">
      <OrderContent params={props.params} />
    </StaffOnly>
  );
}
