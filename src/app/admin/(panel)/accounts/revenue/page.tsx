import type { Metadata } from "next";
import { BfPage, DataTable, Panel, RangeFilter, range, rupees, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer Revenue" };

type C = { id: string; name: string; mobile: string; orders: number; inspection: number; service: number; parts: number; outstanding: number };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const end = `${to}T23:59:59.999`;
  const supabase = await createClient();
  const [{ data: orders }, { data: pis }, { data: invs }] = await Promise.all([
    supabase.from("orders").select("user_id, grand_total, status, customer_name, customer_phone").not("status", "in", "(cancelled,returned,refunded)").gte("placed_at", from).lte("placed_at", end),
    supabase.from("inspection_pre_invoices").select("customer_id, customer_name, customer_mobile, charge_paise, balance").eq("status", "issued").gte("created_at", from).lte("created_at", end),
    supabase.from("service_invoices").select("customer_name, customer_mobile, basic_charge, labour_charge, additional_total, spare_parts_total, discount, balance, service_bookings(customer_id)").eq("approval_status", "approved").gte("created_at", from).lte("created_at", end),
  ]);
  const map = new Map<string, C>();
  const get = (id: string, name: string, mobile: string) => {
    if (!map.has(id)) map.set(id, { id, name, mobile, orders: 0, inspection: 0, service: 0, parts: 0, outstanding: 0 });
    return map.get(id)!;
  };
  for (const o of (orders ?? []) as { user_id: string | null; grand_total: number; customer_name: string; customer_phone: string }[]) get(o.user_id ?? `guest-${o.customer_phone}`, o.customer_name, o.customer_phone).orders += o.grand_total;
  for (const p of (pis ?? []) as { customer_id: string | null; customer_name: string; customer_mobile: string; charge_paise: number; balance: number }[]) {
    const c = get(p.customer_id ?? p.customer_mobile, p.customer_name, p.customer_mobile);
    c.inspection += p.charge_paise;
    c.outstanding += p.balance;
  }
  for (const i of (invs ?? []) as unknown as { customer_name: string; customer_mobile: string; basic_charge: number; labour_charge: number; additional_total: number; spare_parts_total: number; discount: number; balance: number; service_bookings: { customer_id: string | null } | null }[]) {
    const c = get(i.service_bookings?.customer_id ?? i.customer_mobile, i.customer_name, i.customer_mobile);
    const svc = i.basic_charge + i.labour_charge + i.additional_total;
    const ds = svc + i.spare_parts_total ? Math.round((i.discount * svc) / (svc + i.spare_parts_total)) : 0;
    c.service += svc - ds;
    c.parts += i.spare_parts_total - (i.discount - ds);
    c.outstanding += i.balance;
  }
  const rows = [...map.values()].map((c) => ({ ...c, total: c.orders + c.inspection + c.service + c.parts })).sort((a, b) => b.total - a.total);
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title={`${rows.length} customers · ${rupees(rows.reduce((n, r) => n + r.total, 0))}`} description="Revenue before tax, per customer, from orders, pre-invoices and approved service invoices.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Customer", render: (r) => <><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.mobile}</p></> },
          { key: "o", label: "Product orders", render: (r) => rupees(r.orders) },
          { key: "i", label: "Inspection", render: (r) => rupees(r.inspection) },
          { key: "s", label: "Service", render: (r) => rupees(r.service) },
          { key: "p", label: "Parts", render: (r) => rupees(r.parts) },
          { key: "t", label: "Total", render: (r) => <b>{rupees(r.total)}</b> },
          { key: "d", label: "Outstanding", render: (r) => (r.outstanding ? <span className="text-warning">{rupees(r.outstanding)}</span> : "—") },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Customer Revenue" module="accounts"><Content {...props} /></BfPage>;
}
