import type { Metadata } from "next";
import { BfPage, Panel, RangeFilter, range, rupees, type SP } from "@/components/best-fit/ui";
import { getAccountsSummary } from "@/features/best-fit/accounts";

export const metadata: Metadata = { title: "Profit & Loss" };

function Line({ k, v, bold, minus }: { k: string; v: number; bold?: boolean; minus?: boolean }) {
  return (
    <div className={`flex justify-between border-b py-2 text-sm ${bold ? "font-bold text-deep" : "text-deep"}`}>
      <span>{k}</span>
      <span className="tabular-nums">{minus ? `(${rupees(v)})` : rupees(v)}</span>
    </div>
  );
}

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const { data: s, error } = await getAccountsSummary(from, to);
  if (!s) return <p className="text-sm text-danger">{error}</p>;
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title={`Profit & Loss · ${from} to ${to}`} description="Operating view from recorded transactions. Product purchase costs (stock) are not deducted here; see Purchases for stock costs.">
        <div className="max-w-xl">
          <p className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Revenue</p>
          <Line k="Product sales" v={s.product_sales} />
          <Line k="Inspection revenue" v={s.inspection_revenue} />
          <Line k="Service revenue" v={s.service_revenue} />
          <Line k="Parts sales" v={s.parts_sales} />
          <Line k="Other revenue" v={s.other_revenue} />
          <Line k="Total revenue" v={s.total_revenue} bold />
          <p className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Expenses</p>
          <Line k="Technician compensation (commission)" v={s.technician_commission} minus />
          <Line k="Technician travel" v={s.technician_travel} minus />
          <Line k="Approved reclaims" v={s.reclaims} minus />
          <Line k="Spare parts cost (used in service)" v={s.spare_parts_cost} minus />
          <Line k="Operational expenses" v={s.operational_expenses} minus />
          <Line k="Total expenses" v={s.total_expenses} bold minus />
          <div className="mt-3"><Line k="Net operating result" v={s.net_operating_result} bold /></div>
          <p className="mt-3 text-xs text-muted-foreground">Taxes collected ({rupees(s.taxes_collected)}) are excluded from revenue.</p>
        </div>
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Profit & Loss" module="accounts"><Content {...props} /></BfPage>;
}
