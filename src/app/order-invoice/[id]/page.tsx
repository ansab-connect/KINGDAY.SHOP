import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { PrintButton } from "@/components/admin/print-button";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_WHATSAPP_DISPLAY, storeContact } from "@/config/storefront";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { getOrderDetail } from "@/features/orders/queries";
import { formatDate, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Order invoice", robots: { index: false, follow: false } };

/**
 * Printable product order invoice (customer: own orders; staff: all — RLS decides).
 * Each line shows the warranty and cycle size saved when the order was placed, so later
 * warranty changes never alter it. "Print / Save as PDF" uses the browser's PDF export.
 */
async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/order-invoice/${id}`);
  const o = await getOrderDetail(id, { staff: hasRole(me, "staff") });
  if (!o) notFound();
  const a = o.shipping_address;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <article className="rounded-2xl border bg-white p-6 shadow-card sm:p-10 print:rounded-none print:border-0 print:shadow-none">
        <header className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{storeContact.address}<br />{OFFICIAL_WHATSAPP_DISPLAY} · {storeContact.email}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">Tax invoice</p>
            <p className="mt-1 font-mono text-xl font-bold text-deep">{o.order_number}</p>
            <p className="mt-1 text-sm text-muted-foreground">Date: {formatDate(new Date(o.placed_at))}</p>
            <p className="text-sm text-muted-foreground">Payment: {o.payment_method === "cod" ? "Cash on delivery" : "Online"} · {o.payment_status}</p>
          </div>
        </header>
        <section className="border-b py-5 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Bill to</p>
          <p className="mt-1 font-semibold text-deep">{o.customer_name}</p>
          <p className="text-deep">{o.customer_phone}</p>
          <p className="text-deep">{[a.line1, a.line2, a.landmark, [a.city, a.state, a.postal_code].filter(Boolean).join(", ")].filter(Boolean).join(", ")}</p>
        </section>
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {o.order_items.map((i) => (
              <tr key={i.id} className="border-b border-border/60 align-top">
                <td className="py-2.5 pr-3 text-deep">
                  {i.product_name}{i.variant_name ? ` · ${i.variant_name}` : ""}
                  <span className="block text-xs text-muted-foreground">SKU {i.sku}</span>
                  {i.cycle_size ? <span className="block text-xs text-muted-foreground">Size: {i.cycle_size}</span> : null}
                  {i.warranty ? <span className="block text-xs text-muted-foreground">{i.warranty}</span> : null}
                </td>
                <td className="py-2.5 text-right">{i.quantity}</td>
                <td className="py-2.5 text-right">{formatPaise(i.unit_price)}</td>
                <td className="py-2.5 text-right text-deep">{formatPaise(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm tabular-nums">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatPaise(o.subtotal)}</dd></div>
          {o.discount_total ? <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>− {formatPaise(o.discount_total)}</dd></div> : null}
          <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{o.shipping_total ? formatPaise(o.shipping_total) : "Free"}</dd></div>
          {o.tax_total ? <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd>{formatPaise(o.tax_total)}</dd></div> : null}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold text-deep"><dt>Total</dt><dd>{formatPaise(o.grand_total)}</dd></div>
        </dl>
        <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          Warranty terms shown are those applicable on the date of purchase. Thank you for shopping with KING DAY. This is a computer-generated invoice.
        </footer>
      </article>
    </div>
  );
}

export default function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="min-h-screen bg-canvas print:bg-white">
      <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><Skeleton className="h-[36rem] rounded-2xl" /></div>}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}
