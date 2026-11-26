import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, DataTable, Panel, RangeFilter, Status, day, range, rupees, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Final Service Invoices" };

type Row = { id: string; invoice_number: string; booking_id: string; customer_name: string; basic_charge: number; labour_charge: number; additional_total: number; spare_parts_total: number; grand_total: number; balance: number; payment_status: string; approval_status: string; created_at: string; service_bookings: { booking_code: string } | null };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const supabase = await createClient();
  const [{ data }, { data: alloc }] = await Promise.all([
    supabase.from("service_invoices").select("id, invoice_number, booking_id, customer_name, basic_charge, labour_charge, additional_total, spare_parts_total, grand_total, balance, payment_status, approval_status, created_at, service_bookings(booking_code)").gte("created_at", from).lt("created_at", `${to}T23:59:59.999`).order("created_at", { ascending: false }).limit(500),
    supabase.from("commission_allocations").select("service_invoice_id").eq("status", "active"),
  ]);
  const finalised = new Set(((alloc ?? []) as { service_invoice_id: string }[]).map((a) => a.service_invoice_id));
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title="Final service invoices" description="A: inspection (from the pre-invoice, never charged twice) · B: service / labour · C: parts. Once earnings are finalised the invoice is locked; reverse earnings to correct it.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Invoice", render: (r) => <a href={`/service-invoice/${r.id}`} target="_blank" className="font-mono font-semibold text-royal">{r.invoice_number}</a> },
          { key: "b", label: "Booking", render: (r) => <Link href={`/admin/service/${r.booking_id}`} className="font-mono text-xs text-royal">{r.service_bookings?.booking_code}</Link> },
          { key: "c", label: "Customer", render: (r) => r.customer_name },
          { key: "s", label: "Service", render: (r) => rupees(r.basic_charge + r.labour_charge + r.additional_total) },
          { key: "p", label: "Parts", render: (r) => rupees(r.spare_parts_total) },
          { key: "t", label: "Total", render: (r) => <>{rupees(r.grand_total)}{r.balance ? <p className="text-xs text-warning">Due {rupees(r.balance)}</p> : null}</> },
          { key: "st", label: "Status", render: (r) => <div className="flex flex-col gap-1"><Status s={r.approval_status} /><Status s={r.payment_status} />{finalised.has(r.id) ? <span className="text-xs text-success">Earnings finalised</span> : null}</div> },
          { key: "d", label: "Date", render: (r) => day(r.created_at) },
          { key: "e", label: "", render: (r) => (r.approval_status === "approved" ? <Link href={`/admin/best-fit/technician-invoices?invoice=${r.id}`} className="text-sm font-semibold text-royal">Earnings</Link> : null) },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Final Service Invoices" module="service"><Content {...props} /></BfPage>;
}
