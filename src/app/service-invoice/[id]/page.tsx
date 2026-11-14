import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { InvoiceShare } from "@/components/service/invoice-share";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_WHATSAPP_DISPLAY, storeContact } from "@/config/storefront";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/features/auth/session";
import { getInvoice, PAYMENT_METHODS } from "@/features/service/invoices";
import { formatDate, formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service invoice", robots: { index: false, follow: false } };

/**
 * Printable service invoice. Readable only by the customer, the assigned technician
 * and the service team (RLS). "Print / Save as PDF" uses the browser's own PDF export.
 */
async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/service-invoice/${id}`);
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const supabase = await createClient();
  const { data: b } = await supabase.from("service_bookings").select("booking_code").eq("id", inv.booking_id).maybeSingle();
  const bookingCode = (b as { booking_code?: string } | null)?.booking_code ?? "";
  const method = PAYMENT_METHODS.find((m) => m.value === inv.payment_method)?.label;

  const rows = [
    ...(inv.basic_charge ? [{ d: "Basic service charge", q: 1, p: inv.basic_charge, t: inv.basic_charge }] : []),
    ...(inv.labour_charge ? [{ d: "Labour charge", q: 1, p: inv.labour_charge, t: inv.labour_charge }] : []),
    ...inv.items.map((i) => ({ d: i.description, q: i.quantity, p: i.unit_price, t: i.line_total })),
  ];
  const link = `${siteConfig.url}/service-invoice/${inv.id}`;
  const waText = `KING DAY Service invoice ${inv.invoice_number}\nBooking ${bookingCode}\nTotal: ${formatPaise(inv.grand_total)} (${inv.payment_status === "paid" ? "Paid" : "Payment due"})\nView: ${link}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-6 print:hidden">
        <InvoiceShare whatsappText={waText} phone={inv.customer_mobile} />
      </div>
      <article className="rounded-2xl border bg-white p-6 shadow-card sm:p-10 print:rounded-none print:border-0 print:shadow-none">
        <header className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {storeContact.address}
              <br />
              {OFFICIAL_WHATSAPP_DISPLAY} · {storeContact.email}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold tracking-[0.18em] text-gold-700 uppercase">Service invoice</p>
            <p className="mt-1 font-mono text-xl font-bold text-deep">{inv.invoice_number}</p>
            <p className="mt-1 text-sm text-muted-foreground">Date: {formatDate(new Date(inv.created_at))}</p>
            <p className="text-sm text-muted-foreground">Booking: {bookingCode}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Bill to</p>
            <p className="mt-1 font-semibold text-deep">{inv.customer_name}</p>
            <p className="text-sm text-deep">{inv.customer_mobile}</p>
            <p className="text-sm whitespace-pre-line text-deep">{inv.customer_address}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Product</p>
            <p className="mt-1 text-sm text-deep">{inv.product}</p>
            {inv.service_description ? (
              <>
                <p className="mt-3 text-xs font-semibold text-muted-foreground uppercase">Service</p>
                <p className="mt-1 text-sm whitespace-pre-line text-deep">{inv.service_description}</p>
              </>
            ) : null}
          </div>
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2.5 pr-3 text-deep">{r.d}</td>
                <td className="py-2.5 text-right">{r.q}</td>
                <td className="py-2.5 text-right">{formatPaise(r.p)}</td>
                <td className="py-2.5 text-right text-deep">{formatPaise(r.t)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm tabular">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatPaise(inv.subtotal)}</dd></div>
          {inv.discount ? <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd>− {formatPaise(inv.discount)}</dd></div> : null}
          {inv.tax_percent ? <div className="flex justify-between"><dt className="text-muted-foreground">Tax ({inv.tax_percent}%)</dt><dd>{formatPaise(inv.tax_amount)}</dd></div> : null}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold text-deep"><dt>Grand total</dt><dd>{formatPaise(inv.grand_total)}</dd></div>
        </dl>

        <footer className="mt-8 flex flex-col gap-1 border-t pt-4 text-sm">
          <p>
            <span className="text-muted-foreground">Payment: </span>
            <span className={inv.payment_status === "paid" ? "font-semibold text-success" : "font-semibold text-warning"}>
              {inv.payment_status === "paid" ? `Paid${method ? ` (${method})` : ""}${inv.paid_at ? ` on ${formatDate(new Date(inv.paid_at))}` : ""}` : "Due"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Thank you for choosing KING DAY Service. This is a computer-generated invoice.</p>
        </footer>
      </article>
    </div>
  );
}

export default function ServiceInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="min-h-screen bg-canvas print:bg-white">
      <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><Skeleton className="h-[36rem] rounded-2xl" /></div>}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}
