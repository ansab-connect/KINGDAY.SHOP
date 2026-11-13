import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { MarkCodPaidForm, OrderNoteForm, OrderStatusForm, ShipmentForm } from "@/components/admin/order-actions";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NEXT_STATUSES, getOrderDetail } from "@/features/orders/queries";
import { ORDER_STATUS_LABEL, type PaymentStatus } from "@/features/orders/types";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Order" };

async function OrderContent({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured) notFound();
  const o = await getOrderDetail(id, { staff: true });
  if (!o) notFound();
  const a = o.shipping_address ?? {};
  const shipment = o.shipments.at(-1) ?? null;
  const phoneDigits = o.customer_phone.replace(/\D/g, "");
  const waNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
  const wa = phoneDigits
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${o.customer_name}, this is KING DAY about your order ${o.order_number}.`)}`
    : null;
  const payment = (["paid", "failed", "refunded"].includes(o.payment_status) ? o.payment_status : "pending") as PaymentStatus;

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
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Items</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {o.order_items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-deep">{i.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[i.variant_name, i.sku].filter(Boolean).join(" · ")} · {formatPaise(i.unit_price)} × {i.quantity}
                      </p>
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

          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Customer</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="font-medium text-deep">{o.customer_name}</p>
              <address className="text-muted-foreground not-italic">
                {[a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), a.postal_code]
                  .filter(Boolean)
                  .map((l, i) => <span key={i} className="block">{l}</span>)}
              </address>
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
    <StaffOnly>
      <OrderContent params={props.params} />
    </StaffOnly>
  );
}
