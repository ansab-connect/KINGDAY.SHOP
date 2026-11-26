import type { Metadata } from "next";
import { OpForm, type Field } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Status, day, rupees } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service Charge Settings" };

type C = { id: string; name: string; amount_paise: number; technician_pct: number; company_pct: number; effective_from: string; effective_to: string | null; is_active: boolean };
const fields: Field[] = [
  { name: "name", label: "Name", required: true },
  { name: "amount_paise", label: "Default service charge (₹)", type: "money", required: true },
  { name: "technician_pct", label: "Technician share %", type: "number", required: true },
  { name: "company_pct", label: "Company share %", type: "number", required: true, hint: "Both shares must add up to 100%." },
  { name: "effective_from", label: "Effective from", type: "date", required: true },
  { name: "effective_to", label: "Effective to", type: "date" },
  { name: "is_active", label: "Active", type: "bool" },
];

async function Content() {
  const supabase = await createClient();
  const { data } = await supabase.from("service_charge_settings").select("*").order("effective_from", { ascending: false });
  const rows = (data ?? []) as C[];
  return (
    <>
      <Panel title="Default service charge" description="Pre-fills the service charge on new invoices. Only one active setting may cover a date; old settings stay as history. Technicians cannot change these. The money split on each invoice follows the Service Cost commission rules.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Setting", render: (r) => r.name },
          { key: "a", label: "Amount", render: (r) => rupees(r.amount_paise) },
          { key: "sp", label: "Split", render: (r) => `Technician ${r.technician_pct}% = ${rupees(Math.round((r.amount_paise * r.technician_pct) / 100))} · Company ${r.company_pct}% = ${rupees(r.amount_paise - Math.round((r.amount_paise * r.technician_pct) / 100))}` },
          { key: "d", label: "Effective", render: (r) => `${day(r.effective_from)} → ${r.effective_to ? day(r.effective_to) : "open"}` },
          { key: "s", label: "Status", render: (r) => <Status s={r.is_active ? "active" : "inactive"} /> },
          { key: "e", label: "", render: (r) => <details><summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary><div className="mt-2 w-[min(80vw,600px)]"><OpForm op="charge.update" hidden={{ id: r.id }} initial={r} fields={fields} /></div></details> },
        ]} />
      </Panel>
      <Panel title="New service charge setting" description="To change the amount from a date: set an end date on the current one, then add the new one.">
        <OpForm op="charge.create" fields={fields} initial={{ name: "Default service charge", effective_from: new Date().toISOString().slice(0, 10), is_active: true }} resetOnSuccess columns={3} />
      </Panel>
    </>
  );
}

export default function Page() {
  return <BfPage title="Service Charge Settings" module="best_fit"><Content /></BfPage>;
}
