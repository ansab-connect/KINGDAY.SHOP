import type { Metadata } from "next";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Status, day, km, rupees } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer Inspection Slabs" };

type Slab = { id: string; code: string; min_km: number; max_km: number | null; rate_paise: number; description: string | null; effective_from: string; effective_to: string | null; is_active: boolean };
const fields: Field[] = [
  { name: "code", label: "Slab", required: true, placeholder: "S5" },
  { name: "min_km", label: "From km", type: "number", required: true },
  { name: "max_km", label: "To km (empty = no limit)", type: "number" },
  { name: "rate_paise", label: "Rate per km (₹)", type: "money", required: true },
  { name: "effective_from", label: "Effective from", type: "date", required: true },
  { name: "effective_to", label: "Effective to", type: "date" },
  { name: "description", label: "Description", wide: true },
  { name: "is_active", label: "Active", type: "bool" },
];

async function Content() {
  const supabase = await createClient();
  const { data } = await supabase.from("inspection_slabs").select("*").order("is_active", { ascending: false }).order("min_km");
  const rows = (data ?? []) as Slab[];
  return (
    <>
      <Panel title="How the inspection charge is worked out" description="Actual verified one-way road distance × the rate of the slab it falls in. One rate covers the whole distance (35 km × ₹8.50 = ₹297.50). Active slabs cannot overlap; issued pre-invoices keep the rate they used.">
        <DataTable rows={rows} cols={[
          { key: "code", label: "Slab", render: (r) => <span className="font-semibold">{r.code}</span> },
          { key: "range", label: "Distance", render: (r) => `${km(r.min_km)} – ${r.max_km != null ? km(r.max_km) : "and above"}` },
          { key: "rate", label: "Rate", render: (r) => `${rupees(r.rate_paise)}/km` },
          { key: "dates", label: "Effective", render: (r) => `${day(r.effective_from)} → ${r.effective_to ? day(r.effective_to) : "open"}` },
          { key: "s", label: "Status", render: (r) => <Status s={r.is_active ? "active" : "inactive"} /> },
          { key: "edit", label: "", render: (r) => (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary>
              <div className="mt-2 w-[min(80vw,640px)]"><OpForm op="slab.update" hidden={{ id: r.id }} initial={r} fields={fields} /></div>
              <div className="mt-2"><OpButton op="slab.delete" values={{ id: r.id }} label="Delete" tone="danger" confirmText="Delete this slab? (Used slabs can only be deactivated.)" /></div>
            </details>
          ) },
        ]} />
      </Panel>
      <Panel title="Add a slab">
        <OpForm op="slab.create" fields={fields} initial={{ effective_from: new Date().toISOString().slice(0, 10), is_active: true }} resetOnSuccess columns={4} submitLabel="Add slab" />
      </Panel>
    </>
  );
}

export default function Page() {
  return (
    <BfPage title="Customer Inspection Slabs" description="Customer-facing inspection rates. Separate from technician payment slabs." module="best_fit">
      <Content />
    </BfPage>
  );
}
