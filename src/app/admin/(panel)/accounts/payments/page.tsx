import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, CsvLink, DataTable, Panel, RangeFilter, label, range, rupees, when, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment History" };

type P = { id: string; payment_number: string; booking_id: string; amount_paise: number; method: string; reference: string | null; received_at: string; pre_invoice_id: string | null; service_invoice_id: string | null; service_bookings: { booking_code: string; customer_name: string } | null };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const supabase = await createClient();
  const { data } = await supabase.from("service_payments").select("*, service_bookings(booking_code, customer_name)").gte("received_at", from).lte("received_at", `${to}T23:59:59.999`).order("received_at", { ascending: false });
  const rows = (data ?? []) as unknown as P[];
  const byMethod = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.method]: (m[r.method] ?? 0) + r.amount_paise }), {});
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title={`Customer service payments: ${rupees(rows.reduce((n, r) => n + r.amount_paise, 0))}`} description={Object.entries(byMethod).map(([k, v]) => `${label(k)} ${rupees(v)}`).join(" · ") || "No payments in this period."} aside={<CsvLink href={`/admin/export/payments?from=${from}&to=${to}`} />}>
        <DataTable rows={rows} cols={[
          { key: "n", label: "Payment", render: (r) => <span className="font-mono">{r.payment_number}</span> },
          { key: "d", label: "Received", render: (r) => when(r.received_at) },
          { key: "b", label: "Booking", render: (r) => <><Link href={`/admin/service/${r.booking_id}`} className="font-mono text-xs text-royal">{r.service_bookings?.booking_code}</Link><p className="text-xs">{r.service_bookings?.customer_name}</p></> },
          { key: "f", label: "For", render: (r) => (r.pre_invoice_id ? "Inspection pre-invoice" : "Final invoice") },
          { key: "a", label: "Amount", render: (r) => rupees(r.amount_paise) },
          { key: "m", label: "Method", render: (r) => `${label(r.method)}${r.reference ? ` · ${r.reference}` : ""}` },
        ]} />
      </Panel>
      <p className="text-sm text-muted-foreground">Product order payments: <Link href="/admin/orders" className="font-semibold text-royal">Orders</Link> · counter bills: <Link href="/admin/billing" className="font-semibold text-royal">Billing</Link> · staff payouts: <Link href="/admin/accounts/technician-payments" className="font-semibold text-royal">Technician Payments</Link>.</p>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Payment History" module="accounts"><Content {...props} /></BfPage>;
}
