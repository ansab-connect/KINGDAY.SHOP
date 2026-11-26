import type { Metadata } from "next";
import { BfPage, Panel, RangeFilter, Stats, range, rupees, type SP } from "@/components/best-fit/ui";
import { getAccountsSummary } from "@/features/best-fit/accounts";

export const metadata: Metadata = { title: "Accounts" };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const { data: s, error } = await getAccountsSummary(from, to);
  if (!s) return <p className="text-sm text-danger">{error}</p>;
  const q = `?from=${from}&to=${to}`;
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Stats items={[
        { label: "Total revenue", value: rupees(s.total_revenue), hint: "Excludes taxes collected", href: `/admin/accounts/reports${q}` },
        { label: "Company share (service)", value: rupees(s.company_share), hint: "From finalised commission splits" },
        { label: "Technician payables", value: rupees(s.outstanding_technician), hint: "Wallet balances + pending claims + approved reclaims", href: "/admin/best-fit/wallet" },
        { label: "Paid earnings", value: rupees(s.paid_earnings), href: "/admin/accounts/technician-payments" },
        { label: "Outstanding customer payments", value: rupees(s.outstanding_customer), href: "/admin/service/invoices" },
        { label: "Outstanding technician payments", value: rupees(s.outstanding_technician) },
        { label: "Total expenses", value: rupees(s.total_expenses), href: `/admin/accounts/profit-loss${q}` },
        { label: "Net operating result", value: rupees(s.net_operating_result), href: `/admin/accounts/profit-loss${q}` },
      ]} />
      <Panel title="Revenue by stream" description="Each rupee is counted once: inspection from pre-invoices, service and parts from approved final invoices (after discount, before tax), product sales from orders and sale bills.">
        <Stats items={[
          { label: "Product sales", value: rupees(s.product_sales) },
          { label: "Inspection revenue", value: rupees(s.inspection_revenue) },
          { label: "Service revenue", value: rupees(s.service_revenue) },
          { label: "Parts sales", value: rupees(s.parts_sales) },
          { label: "Other revenue (service bills)", value: rupees(s.other_revenue) },
          { label: "Taxes collected", value: rupees(s.taxes_collected) },
          { label: "Service payments received", value: rupees(s.payments_received), href: "/admin/accounts/payments" },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Accounts" description="Revenue, staff payables and expenses from recorded transactions only." module="accounts"><Content {...props} /></BfPage>;
}
