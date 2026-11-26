import type { Metadata } from "next";
import { OpForm } from "@/components/best-fit/op-form";
import { BfPage, Panel } from "@/components/best-fit/ui";
import { getSetting } from "@/features/best-fit/queries";

export const metadata: Metadata = { title: "Customer Visibility" };

type Vis = { show_technician_name: boolean; show_technician_phone: boolean; show_timeline: boolean; show_invoices: boolean };

async function Content() {
  const v = await getSetting<Vis>("best_fit.visibility", { show_technician_name: true, show_technician_phone: false, show_timeline: true, show_invoices: true });
  return (
    <>
      <Panel title="What customers see in “My Services”" description="Customers only ever see their own bookings, invoices and payments. Commissions, staff earnings and company figures are never shown — the database blocks them.">
        <OpForm op="setting.save" transform="settingValue" hidden={{ key: "best_fit.visibility" }} initial={v} columns={2}
          fields={[
            { name: "show_technician_name", label: "Show the technician's name", type: "bool" },
            { name: "show_technician_phone", label: "Show the technician's phone", type: "bool" },
            { name: "show_timeline", label: "Show the status timeline", type: "bool" },
            { name: "show_invoices", label: "Show pre-invoices and invoices", type: "bool" },
          ]} />
      </Panel>
    </>
  );
}

export default function Page() {
  return <BfPage title="Customer Visibility" module="best_fit"><Content /></BfPage>;
}
