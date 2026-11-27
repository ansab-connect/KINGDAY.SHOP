import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Mail, PackageSearch, Truck } from "lucide-react";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/status-badge";
import { AccountShell } from "@/components/store/account/account-shell";
import { ComingSoon } from "@/components/store/coming-soon";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { supportMailto } from "@/config/storefront";
import { getMyOrders } from "@/features/account/queries";
import { requireUser } from "@/features/auth/session";
import { ORDER_STATUS_LABEL } from "@/features/orders/types";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "My Orders", robots: { index: false } };

const TRACK_STEPS = ["confirmed", "packed", "shipped", "delivered"] as const;

async function OrdersContent() {
  await requireUser("/account/orders");
  const orders = await getMyOrders();
  return (
    <AccountShell active="/account/orders" title="My orders">
      {orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <PackageSearch aria-hidden className="size-10 text-royal-300" />
          <p className="mt-4 font-heading text-lg font-semibold text-deep">No orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Orders placed with your account will appear here with live tracking.</p>
          <Link href="/shop" className="mt-6 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white">Start shopping</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-5">
          {orders.map((o) => {
            const reached = new Set(o.order_status_history.map((h) => h.to_status));
            const shipment = o.shipments[0];
            const stopped = ["cancelled", "returned", "refunded"].includes(o.status);
            return (
              <li key={o.id} className="rounded-2xl border p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-heading font-semibold text-deep">Order {o.order_number}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(new Date(o.placed_at))} · {o.payment_method === "cod" ? "Cash on delivery" : "Online payment"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2"><OrderStatusBadge status={o.status} /><PaymentStatusBadge status={o.payment_status} /></div>
                </div>
                {o.payment_method === "razorpay" && o.status === "pending" && o.payment_status !== "paid" ? (
                  <Link
                    href={`/checkout/payment?order=${o.order_number}`}
                    className="mt-4 inline-flex h-10 items-center rounded-full bg-gold px-4 text-sm font-bold text-deep hover:bg-gold-300"
                  >
                    Complete payment
                  </Link>
                ) : null}

                {!stopped ? (
                  <ol aria-label="Order progress" className="mt-5 grid grid-cols-4 gap-1">
                    {TRACK_STEPS.map((s) => {
                      const done = reached.has(s) || TRACK_STEPS.indexOf(s) <= TRACK_STEPS.indexOf(o.status as (typeof TRACK_STEPS)[number]);
                      return (
                        <li key={s} className="flex flex-col gap-1.5">
                          <span className={`h-1.5 rounded-full ${done ? "bg-royal" : "bg-muted"}`} />
                          <span className={`text-[0.7rem] sm:text-xs ${done ? "font-medium text-deep" : "text-muted-foreground"}`}>{ORDER_STATUS_LABEL[s]}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}

                <ul className="mt-5 divide-y text-sm">
                  {o.order_items.map((i) => (
                    <li key={i.sku} className="flex justify-between gap-4 py-2">
                      <span className="min-w-0 text-deep">
                        {i.product_name}{i.variant_name ? ` · ${i.variant_name}` : ""} <span className="text-muted-foreground">× {i.quantity}</span>
                        {i.cycle_size ? <span className="block text-xs text-muted-foreground">Size: {i.cycle_size}</span> : null}
                        {i.warranty ? <span className="block text-xs text-muted-foreground">{i.warranty}</span> : null}
                      </span>
                      <span className="shrink-0 tabular">{formatPaise(i.line_total)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between border-t pt-3 text-sm font-semibold text-deep"><span>Total</span><span className="tabular">{formatPaise(o.grand_total)}</span></p>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  {shipment?.tracking_url ? (
                    <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-royal hover:underline">
                      <Truck aria-hidden className="size-4" /> Track with {shipment.carrier ?? "courier"}{shipment.tracking_number ? ` (${shipment.tracking_number})` : ""}
                    </a>
                  ) : shipment?.tracking_number ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Truck aria-hidden className="size-4" /> {shipment.carrier} · {shipment.tracking_number}</span>
                  ) : null}
                  <a href={`/order-invoice/${o.id}`} target="_blank" className="inline-flex items-center gap-1.5 font-medium text-royal hover:underline">Invoice / PDF</a>
                  <a href={supportMailto(`Order ${o.order_number}`)} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-royal">
                    <Mail aria-hidden className="size-4" /> Help with this order
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}

export default function OrdersPage() {
  if (!isSupabaseConfigured) {
    return <ComingSoon icon={PackageSearch} title="Track your order" body="Order tracking will be available once customer accounts are connected." />;
  }
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full rounded-2xl" /></Container>}>
      <OrdersContent />
    </Suspense>
  );
}
