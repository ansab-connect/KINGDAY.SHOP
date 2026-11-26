import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, CsvLink, DataTable, Panel, RangeFilter, Status, day, range, rupees, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invoice History" };

type Row = { id: string; kind: string; number: string; href: string; customer: string; total: number; balance: number; status: string; date: string };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const end = `${to}T23:59:59.999`;
  const supabase = await createClient();
  const [{ data: pi }, { data: si }, { data: ti }] = await Promise.all([
    supabase.from("inspection_pre_invoices").select("id, invoice_number, customer_name, total_paise, balance, payment_status, status, created_at").gte("created_at", from).lte("created_at", end),
    supabase.from("service_invoices").select("id, invoice_number, customer_name, grand_total, balance, payment_status, approval_status, created_at").gte("created_at", from).lte("created_at", end),
    supabase.from("technician_invoices").select("id, invoice_number, total_paise, status, created_at, service_invoice_id").gte("created_at", from).lte("created_at", end),
  ]);
  const rows: Row[] = [
    ...((pi ?? []) as { id: string; invoice_number: string; customer_name: string; total_paise: number; balance: number; payment_status: string; status: string; created_at: string }[]).map((r) => ({ id: r.id, kind: "Inspection pre-invoice", number: r.invoice_number, href: `/service-invoice/pre/${r.id}`, customer: r.customer_name, total: r.total_paise, balance: r.balance, status: r.status === "void" ? "void" : r.payment_status, date: r.created_at })),
    ...((si ?? []) as { id: string; invoice_number: string; customer_name: string; grand_total: number; balance: number; payment_status: string; approval_status: string; created_at: string }[]).map((r) => ({ id: r.id, kind: "Final service invoice", number: r.invoice_number, href: `/service-invoice/${r.id}`, customer: r.customer_name, total: r.grand_total, balance: r.balance, status: r.approval_status === "draft" ? "draft" : r.payment_status, date: r.created_at })),
    ...((ti ?? []) as { id: string; invoice_number: string; total_paise: number; status: string; created_at: string; service_invoice_id: string }[]).map((r) => ({ id: r.id, kind: "Technician earnings (internal)", number: r.invoice_number, href: `/admin/best-fit/technician-invoices?invoice=${r.service_invoice_id}`, customer: "—", total: r.total_paise, balance: 0, status: r.status, date: r.created_at })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const q = `?from=${from}&to=${to}`;
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title={`${rows.length} invoices`} aside={<div className="flex gap-2"><CsvLink href={`/admin/export/pre-invoices${q}`} /><CsvLink href={`/admin/export/invoices${q}`} /></div>} description="Finalised invoices are never edited silently: changes go through reversal and re-finalisation, and every step is in the audit log.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Number", render: (r) => <Link href={r.href} className="font-mono font-semibold text-royal">{r.number}</Link> },
          { key: "k", label: "Type", render: (r) => r.kind },
          { key: "c", label: "Customer", render: (r) => r.customer },
          { key: "t", label: "Total", render: (r) => rupees(r.total) },
          { key: "b", label: "Balance", render: (r) => (r.balance ? rupees(r.balance) : "—") },
          { key: "s", label: "Status", render: (r) => <Status s={r.status} /> },
          { key: "d", label: "Date", render: (r) => day(r.date) },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Invoice History" module="accounts"><Content {...props} /></BfPage>;
}
