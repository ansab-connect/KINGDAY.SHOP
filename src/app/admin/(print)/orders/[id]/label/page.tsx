import type { Metadata } from "next";
import { getCompany } from "@/features/company";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/admin/print-button";
import { assertCan } from "@/features/auth/session";
import { getOrderDetail } from "@/features/orders/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Shipping label", robots: { index: false } };

/** 100 × 150 mm shipping label (standard courier size). Print, or "Save as PDF" to download. */
async function Label({ params }: { params: PageProps<"/admin/orders/[id]/label">["params"] }) {
  const company = await getCompany();
  const { id } = await params;
  if (!isSupabaseConfigured) notFound();
  try {
    await assertCan("orders", "view");
  } catch {
    notFound();
  }
  const o = await getOrderDetail(id, { staff: true });
  if (!o) notFound();
  const a = (o.shipping_address ?? {}) as Record<string, string | null | undefined>;
  const paid = o.payment_status === "paid";
  const units = o.order_items.reduce((n, i) => n + i.quantity, 0);

  return (
    <main className="label-page bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{`@page { size: 100mm 150mm; margin: 0 } @media print { body { margin: 0 } .no-print { display: none !important } }`}</style>
      <div className="no-print mx-auto mb-4 flex w-[100mm] flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-neutral-700">Label for {o.order_number}</span>
        <span className="flex gap-2">
          <a href={`/admin/orders/${o.id}#delivery`} className="inline-flex h-9 items-center rounded-lg border border-neutral-400 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
            Edit details
          </a>
          <PrintButton label="Download / Print" />
        </span>
      </div>
      <article className="mx-auto flex h-[150mm] w-[100mm] flex-col overflow-hidden bg-white p-[5mm] font-sans text-black shadow-lg print:shadow-none">
        <header className="flex items-center justify-between border-b-2 border-black pb-2">
          <span className="text-xl font-extrabold tracking-[0.18em]">KING DAY</span>
          <span className={`rounded px-2 py-1 text-sm font-extrabold ${paid ? "border-2 border-black" : "bg-black text-white"}`}>
            {paid ? "PREPAID" : `COD ${formatPaise(o.grand_total)}`}
          </span>
        </header>

        <section className="mt-3 flex-1">
          <p className="text-[10px] font-bold tracking-widest text-neutral-600 uppercase">Deliver to</p>
          <p className="mt-1 text-lg leading-tight font-extrabold">{a.full_name ?? o.customer_name}</p>
          <p className="mt-1 text-[13px] leading-snug">
            {a.line1}
            {a.line2 ? <>, {a.line2}</> : null}
            {a.landmark ? <><br />Near {a.landmark}</> : null}
            <br />
            {[a.city, a.state].filter(Boolean).join(", ")}
          </p>
          <p className="mt-2 text-2xl font-extrabold tracking-wider">PIN {a.postal_code}</p>
          <p className="mt-1 text-base font-bold">Ph: {a.phone ?? o.customer_phone}</p>
        </section>

        <section className="mt-2 border-t-2 border-dashed border-black pt-2 text-[12px]">
          <div className="flex justify-between">
            <span className="font-bold">Order {o.order_number}</span>
            <span>{formatDateTime(new Date(o.placed_at))}</span>
          </div>
          <ul className="mt-1 max-h-[22mm] overflow-hidden">
            {o.order_items.slice(0, 4).map((i) => (
              <li key={i.id} className="truncate">
                {i.quantity} × {i.product_name}
                {i.variant_name && i.variant_name !== "Default" ? ` (${i.variant_name})` : ""}
              </li>
            ))}
            {o.order_items.length > 4 ? <li>+ {o.order_items.length - 4} more</li> : null}
          </ul>
          <p className="mt-1 font-bold">
            {units} item{units === 1 ? "" : "s"} · {paid ? "Paid online, do not collect cash" : `Collect ${formatPaise(o.grand_total)} in cash`}
          </p>
        </section>

        <footer className="mt-2 border-t-2 border-black pt-2 text-[10px] leading-snug">
          <span className="font-bold">From: KING DAY</span>, {company.address}, Kozhikode, Kerala · {company.whatsappDisplay}
          {company.email ? <> · {company.email}</> : null}
        </footer>
      </article>
    </main>
  );
}

export default function LabelPage(props: PageProps<"/admin/orders/[id]/label">) {
  return (
    <Suspense fallback={null}>
      <Label params={props.params} />
    </Suspense>
  );
}
