import type { Metadata } from "next";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Status, day, km, label, rupees } from "@/components/best-fit/ui";
import { getGroups, getPeople, personName, techOptions } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician Payment Slabs" };

type S = { id: string; name: string; mode: string; min_km: number; max_km: number | null; fixed_paise: number; per_km_paise: number; scope: string; technician_id: string | null; group_id: string | null; description: string | null; effective_from: string; effective_to: string | null; is_active: boolean };

async function Content() {
  const supabase = await createClient();
  const [{ data }, people, groups] = await Promise.all([supabase.from("technician_payment_slabs").select("*").order("scope").order("min_km"), getPeople(), getGroups()]);
  const rows = (data ?? []) as S[];
  const fields: Field[] = [
    { name: "name", label: "Name", required: true },
    { name: "mode", label: "Payment type", type: "select", required: true, options: [{ value: "per_km", label: "Per KM" }, { value: "fixed", label: "Fixed per task" }, { value: "fixed_plus_km", label: "Fixed + per KM" }, { value: "custom", label: "Custom approved amount" }] },
    { name: "scope", label: "Applies to", type: "select", required: true, options: [{ value: "all", label: "All technicians" }, { value: "individual", label: "One technician" }, { value: "group", label: "A group" }] },
    { name: "technician_id", label: "Technician (if one)", type: "select", options: techOptions(people) },
    { name: "group_id", label: "Group (if a group)", type: "select", options: groups.map((g) => ({ value: g.id, label: g.name })) },
    { name: "min_km", label: "From km", type: "number", required: true },
    { name: "max_km", label: "To km (empty = no limit)", type: "number" },
    { name: "fixed_paise", label: "Fixed amount (₹)", type: "money" },
    { name: "per_km_paise", label: "Per km (₹)", type: "money" },
    { name: "effective_from", label: "Effective from", type: "date", required: true },
    { name: "effective_to", label: "Effective to", type: "date" },
    { name: "description", label: "Description", wide: true },
    { name: "is_active", label: "Active", type: "bool" },
  ];
  return (
    <>
      <Panel title="Technician travel / task payment" description="Paid to the assigned technician on top of commission, using the verified distance. Separate from the customer inspection slabs. Priority: individual → group → all technicians. “Custom” asks for the approved amount when earnings are finalised.">
        <DataTable rows={rows} empty="No technician payment slabs yet (technicians then get commission only)." cols={[
          { key: "n", label: "Slab", render: (r) => <><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{label(r.mode)}</p></> },
          { key: "sc", label: "Applies to", render: (r) => (r.scope === "individual" ? personName(people, r.technician_id) : r.scope === "group" ? groups.find((g) => g.id === r.group_id)?.name ?? "Group" : "All technicians") },
          { key: "r", label: "Distance", render: (r) => `${km(r.min_km)} – ${r.max_km != null ? km(r.max_km) : "any"}` },
          { key: "a", label: "Amount", render: (r) => (r.mode === "custom" ? "Approved per task" : [r.fixed_paise ? rupees(r.fixed_paise) : null, r.per_km_paise ? `${rupees(r.per_km_paise)}/km` : null].filter(Boolean).join(" + ")) },
          { key: "d", label: "Effective", render: (r) => `${day(r.effective_from)} → ${r.effective_to ? day(r.effective_to) : "open"}` },
          { key: "s", label: "Status", render: (r) => <Status s={r.is_active ? "active" : "inactive"} /> },
          { key: "e", label: "", render: (r) => <details><summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary><div className="mt-2 flex w-[min(80vw,640px)] flex-col gap-2"><OpForm op="payslab.update" hidden={{ id: r.id }} initial={r} fields={fields} /><OpButton op="payslab.delete" values={{ id: r.id }} label="Delete" tone="danger" confirmText="Delete this slab?" /></div></details> },
        ]} />
      </Panel>
      <Panel title="Add a technician payment slab">
        <OpForm op="payslab.create" fields={fields} initial={{ scope: "all", mode: "per_km", min_km: 0, effective_from: new Date().toISOString().slice(0, 10), is_active: true }} resetOnSuccess columns={3} submitLabel="Add slab" />
      </Panel>
    </>
  );
}

export default function Page() {
  return <BfPage title="Technician Payment Slabs" module="best_fit"><Content /></BfPage>;
}
