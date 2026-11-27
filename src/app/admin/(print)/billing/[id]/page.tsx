import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CancelBill, ShareBill } from "@/components/admin/billing/bill-actions";
import { PrintButton } from "@/components/admin/print-button";
import { OFFICIAL_WHATSAPP_DISPLAY, storeContact } from "@/config/storefront";
import { can, getCurrentUser, hasRole } from "@/features/auth/session";
import { BILL_PAYMENT_METHODS, getBill } from "@/features/billing/bills";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Bill", robots: { index: false } };

/** Printable A4 / receipt bill. Print, or "Save as PDF" to download. */
async function BillView({ params, searchParams }: { params: PageProps<"/admin/billing/[id]">["params"]; searchParams: PageProps<"/admin/billing/[id]">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isSupabaseConfigured) notFound();
  const me = await getCurrentUser();
  if (!me || !hasRole(me, "staff")) notFound();
  const b = await getBill(id);
  if (!b) notFound();
  const cancelled = b.status === "cancelled";
  const mayCancel =
    !cancelled &&
    (b.kind === "sale" ? can(me, "orders", "edit") || can(me, "orders", "delete") : can(me, "billing", "edit") || can(me, "billing", "delete") || can(me, "service", "edit"));
  const label = (v: string) => BILL_PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v;
  const method = b.payment_method ? label(b.payment_method) : undefined;
  const balance = b.grand_total - b.amount_paid;
  const title = b.kind === "sale" ? "SALE BILL" : "SERVICE BILL";
  const waText = [
    `KING DAY ${b.kind === "sale" ? "Sale" : "Service"} bill ${b.bill_number}`,
    b.customer_code ? `Customer ID: ${b.customer_code}` : "",
    `Date: ${formatDateTime(new Date(b.created_at))}`,
    ...b.items.map((i) => `${i.quantity} × ${i.description} = ${formatPaise(i.line_total)}`),
    b.discount ? `Discount: -${formatPaise(b.discount)}` : "",
    `Total: ${formatPaise(b.grand_total)}`,
    balance > 0 ? `Paid ${formatPaise(b.amount_paid)} · Balance ${formatPaise(balance)}` : "Paid in full. Thank you!",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <main className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm } @media print { body { margin: 0 } .no-print { display: none !important } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] flex-wrap items-center justify-between gap-2 px-4">
        <Link href="/admin/billing" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-400 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
          <ArrowLeft aria-hidden className="size-4" /> All bills
        </Link>
        <span className="flex flex-wrap gap-2">
          <Link href={`/admin/billing/new?type=${b.kind}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-400 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
            <Plus aria-hidden className="size-4" /> New bill
          </Link>
          <ShareBill phone={b.customer_phone} text={waText} />
          <PrintButton label="Print / PDF" />
          {mayCancel ? <CancelBill id={b.id} /> : null}
        </span>
        {sp.new === "1" ? <p className="w-full rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-800">Bill {b.bill_number} saved.</p> : null}
      </div>

      <article className="relative mx-auto max-w-[190mm] bg-white p-8 text-[13px] text-black shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {cancelled ? (
          <span className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 rounded-lg border-4 border-red-600 px-6 py-2 text-4xl font-extrabold tracking-widest text-red-600 opacity-70">
            CANCELLED
          </span>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            <Logo />
            <p className="mt-2 max-w-xs text-xs leading-snug text-neutral-700">
              {storeContact.address}, Kozhikode, Kerala
              <br />
              Ph / WhatsApp: {OFFICIAL_WHATSAPP_DISPLAY}
              {storeContact.email ? <><br />{storeContact.email}</> : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-extrabold tracking-[0.15em]">{title}</p>
            <p className="mt-1 font-semibold">{b.bill_number}</p>
            <p className="text-xs text-neutral-700">{formatDateTime(new Date(b.created_at))}</p>
          </div>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Bill to</p>
            <p className="mt-1 text-base font-bold">{b.customer_name}</p>
            {b.customer_code ? <p className="font-semibold">Customer ID: {b.customer_code}</p> : null}
            {b.customer_phone ? <p>Ph: {b.customer_phone}</p> : null}
            {b.customer_address ? <p className="whitespace-pre-line text-neutral-700">{b.customer_address}</p> : null}
          </div>
          {b.vehicle ? (
            <div className="sm:text-right">
              <p className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">Vehicle / product</p>
              <p className="mt-1 font-semibold">{b.vehicle}</p>
            </div>
          ) : null}
        </section>

        <table className="mt-5 w-full border-collapse text-left">
          <thead>
            <tr className="border-y-2 border-black text-xs uppercase">
              <th className="py-2 pr-2 font-bold">#</th>
              <th className="py-2 pr-2 font-bold">Item</th>
              <th className="py-2 pr-2 text-right font-bold">Qty</th>
              <th className="py-2 pr-2 text-right font-bold">Rate</th>
              <th className="py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {b.items.map((i, n) => (
              <tr key={i.id} className="border-b border-neutral-300 align-top">
                <td className="py-2 pr-2">{n + 1}</td>
                <td className="py-2 pr-2">
                  {i.description}
                  {i.sku ? <span className="block text-[11px] text-neutral-500">{i.sku}</span> : null}
                  {i.cycle_size ? <span className="block text-[11px] text-neutral-600">Size: {i.cycle_size}</span> : null}
                  {i.warranty ? <span className="block text-[11px] text-neutral-600">{i.warranty}</span> : null}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatPaise(i.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{formatPaise(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-4 ml-auto w-full max-w-xs text-sm">
          <Row label="Subtotal" value={formatPaise(b.subtotal)} />
          {b.discount ? <Row label="Discount" value={`- ${formatPaise(b.discount)}`} /> : null}
          <div className="mt-1 flex justify-between border-y-2 border-black py-2 text-lg font-extrabold">
            <span>Total</span>
            <span className="tabular-nums">{formatPaise(b.grand_total)}</span>
          </div>
          {b.payments.length > 1 ? (
            b.payments.map((p) => (
              <Row key={p.position} label={`Paid · ${label(p.method)}${p.reference ? ` (${p.reference})` : ""}`} value={formatPaise(p.amount)} />
            ))
          ) : (
            <Row label={`Paid${method ? ` (${method}${b.payments[0]?.reference ? ` · ${b.payments[0].reference}` : ""})` : ""}`} value={formatPaise(b.amount_paid)} />
          )}
          {balance > 0 ? <Row label="Balance due" value={formatPaise(balance)} strong /> : null}
        </section>

        {b.note ? <p className="mt-4 rounded border border-neutral-300 p-2 text-xs"><b>Note:</b> {b.note}</p> : null}
        {cancelled && b.cancel_reason ? <p className="mt-2 text-xs text-red-700">Cancelled: {b.cancel_reason}</p> : null}

        <footer className="mt-10 flex items-end justify-between gap-4 text-xs text-neutral-600">
          <p>Thank you for choosing KING DAY! 👑<br />Goods once sold can be exchanged as per store policy.</p>
          <p className="border-t border-neutral-500 pt-1 text-center">Authorised signature</p>
        </footer>
      </article>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function BillPage(props: PageProps<"/admin/billing/[id]">) {
  return (
    <Suspense fallback={null}>
      <BillView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
