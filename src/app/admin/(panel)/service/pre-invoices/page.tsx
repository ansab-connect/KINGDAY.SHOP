import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, DataTable, Panel, RangeFilter, Status, day, param, range, rupees, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inspection Pre-Invoices" };

type Row = { id: string; invoice_number: string; booking_id: string; customer_name: string; customer_mobile: string; distance_km: number; slab_code: string; rate_paise: number; charge_paise: number; tax_paise: number; total_paise: number; balance: number; payment_status: string; status: string; created_at: string; service_bookings: { booking_code: string } | null };

async function Content({ searchParams }: SP) {
  const sp = await searchParams;
  const { from, to } = range(sp);
  const q = param(sp, "q").replace(/[%,()]/g, "");
  const supabase = await createClient();
  let query = supabase.from("inspection_pre_invoices").select("*, service_bookings(booking_code)").gte("created_at", from).lt("created_at", `${to}T23:59:59.999`).order("created_at", { ascending: false }).limit(500);
  if (q) query = query.or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const issued = rows.filter((r) => r.status === "issued");
  return (
    <>
      <RangeFilter from={from} to={to} extra={<label className="flex flex-col gap-1"><span className="font-medium text-deep">Search</span><input name="q" defaultValue={q} placeholder="PI number or name" className="h-10 rounded-lg border px-3" /></label>} />
      <Panel title={`${issued.length} issued · ${rupees(issued.reduce((n, r) => n + r.total_paise, 0))} · balance ${rupees(issued.reduce((n, r) => n + r.balance, 0))}`} description="Created from a booking page after the actual distance is verified. Printed and marked PRE-INVOICE.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Pre-invoice", render: (r) => <Link href={`/service-invoice/pre/${r.id}`} target="_blank" className="font-mono font-semibold text-royal">{r.invoice_number}</Link> },
          { key: "b", label: "Booking", render: (r) => <Link href={`/admin/service/${r.booking_id}`} className="font-mono text-xs text-royal">{r.service_bookings?.booking_code}</Link> },
          { key: "c", label: "Customer", render: (r) => <>{r.customer_name}<p className="text-xs text-muted-foreground">{r.customer_mobile}</p></> },
          { key: "d", label: "Distance × rate", render: (r) => `${r.distance_km} km × ${rupees(r.rate_paise)} (${r.slab_code})` },
          { key: "t", label: "Total", render: (r) => rupees(r.total_paise) },
          { key: "p", label: "Payment", render: (r) => <Status s={r.status === "void" ? "void" : r.payment_status} /> },
          { key: "at", label: "Date", render: (r) => day(r.created_at) },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Inspection Pre-Invoices" module="service"><Content {...props} /></BfPage>;
}
