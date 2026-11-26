import type { Metadata } from "next";
import { BfPage, CsvLink, Panel, RangeFilter, Stats, range, rupees, type SP } from "@/components/best-fit/ui";
import { getAccountsSummary } from "@/features/best-fit/accounts";

export const metadata: Metadata = { title: "Financial Reports" };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const { data: s, error } = await getAccountsSummary(from, to);
  if (!s) return <p className="text-sm text-danger">{error}</p>;
  const q = `?from=${from}&to=${to}`;
  const exports = [["pre-invoices", "Inspection pre-invoices"], ["invoices", "Final service invoices"], ["payments", "Customer payments"], ["allocations", "Commission allocations"], ["earnings", "Technician earnings"], ["wallet", "Wallet / payouts"], ["reclaims", "Reclaims"]];
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title="Revenue"><Stats items={[
        { label: "Customer revenue", value: rupees(s.total_revenue) }, { label: "Inspection", value: rupees(s.inspection_revenue) },
        { label: "Service", value: rupees(s.service_revenue) }, { label: "Parts sales", value: rupees(s.parts_sales) },
        { label: "Product sales", value: rupees(s.product_sales) }, { label: "Other", value: rupees(s.other_revenue) },
        { label: "Taxes collected", value: rupees(s.taxes_collected) }, { label: "Company share", value: rupees(s.company_share) },
      ]} /></Panel>
      <Panel title="Staff & expenses"><Stats items={[
        { label: "Technician commission", value: rupees(s.technician_commission) }, { label: "Technician travel", value: rupees(s.technician_travel) },
        { label: "Paid out", value: rupees(s.paid_earnings) }, { label: "Reclaims approved", value: rupees(s.reclaims) },
        { label: "Spare parts cost", value: rupees(s.spare_parts_cost) }, { label: "Operational expenses", value: rupees(s.operational_expenses) },
        { label: "Outstanding (customers)", value: rupees(s.outstanding_customer) }, { label: "Outstanding (staff)", value: rupees(s.outstanding_technician) },
      ]} /></Panel>
      <Panel title="Exports (CSV)" description="Each file contains the stored records for the chosen dates.">
        <div className="flex flex-wrap gap-3">{exports.map(([k, l]) => <span key={k} className="flex items-center gap-2"><CsvLink href={`/admin/export/${k}${q}`} /><span className="text-sm text-muted-foreground">{l}</span></span>)}</div>
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Financial Reports" module="accounts"><Content {...props} /></BfPage>;
}
