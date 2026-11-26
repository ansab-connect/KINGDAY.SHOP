import type { Metadata } from "next";
import { OpButton, OpForm, type Field } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Status } from "@/components/best-fit/ui";
import { getPeople, staffOptions } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service Centres" };

type Centre = { id: string; name: string; address: string; town: string | null; latitude: number | null; longitude: number | null; phone: string | null; email: string | null; working_hours: string | null; sort_order: number; is_active: boolean; service_centre_staff: { user_id: string }[] };
const fields: Field[] = [
  { name: "name", label: "Centre name", required: true },
  { name: "town", label: "Town / district" },
  { name: "address", label: "Address", required: true, wide: true },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "working_hours", label: "Working hours", placeholder: "Mon–Sat 9:30 am – 7 pm" },
  { name: "sort_order", label: "Display order", type: "number" },
  { name: "latitude", label: "Latitude", type: "number" },
  { name: "longitude", label: "Longitude", type: "number" },
  { name: "is_active", label: "Active (shown to customers)", type: "bool" },
];

async function Content() {
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([supabase.from("service_centres").select("*, service_centre_staff(user_id)").order("sort_order"), getPeople()]);
  const rows = (data ?? []) as Centre[];
  return (
    <>
      <Panel title="Service centres" description="Customers who pick “Nearby Service Centre” choose from the active centres. These bookings never create a home visit.">
        <DataTable rows={rows} empty="No service centres yet. Add the first one below." cols={[
          { key: "name", label: "Centre", render: (r) => <><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.address}</p></> },
          { key: "hours", label: "Hours / contact", render: (r) => <><p>{r.working_hours ?? "—"}</p><p className="text-xs text-muted-foreground">{r.phone ?? ""}</p></> },
          { key: "staff", label: "Staff", render: (r) => r.service_centre_staff.map((s) => people.find((p) => p.user_id === s.user_id)?.full_name ?? "—").join(", ") || "—" },
          { key: "s", label: "Status", render: (r) => <Status s={r.is_active ? "active" : "inactive"} /> },
          { key: "edit", label: "", render: (r) => (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-royal">Manage</summary>
              <div className="mt-2 flex w-[min(80vw,640px)] flex-col gap-3">
                <OpForm op="centre.update" hidden={{ id: r.id }} initial={r} fields={fields} />
                <p className="text-sm font-semibold text-deep">Centre staff</p>
                <CentreStaff centreId={r.id} people={staffOptions(people)} current={r.service_centre_staff.map((s) => s.user_id)} names={people} />
                <OpButton op="centre.delete" values={{ id: r.id }} label="Delete centre" tone="danger" confirmText="Delete? Centres used by bookings can only be deactivated." />
              </div>
            </details>
          ) },
        ]} />
      </Panel>
      <Panel title="Add a service centre">
        <OpForm op="centre.create" fields={fields} initial={{ is_active: true, sort_order: rows.length + 1 }} resetOnSuccess columns={3} submitLabel="Add centre" />
      </Panel>
    </>
  );
}

function CentreStaff({ centreId, people, current, names }: { centreId: string; people: { value: string; label: string }[]; current: string[]; names: { user_id: string; full_name: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {current.map((u) => (
          <span key={u} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
            {names.find((n) => n.user_id === u)?.full_name ?? "Staff"}
            <OpButton op="centrestaff.delete" values={{ centre_id: centreId, user_id: u }} label="Remove" tone="neutral" />
          </span>
        ))}
      </div>
      <OpForm op="centrestaff.create" hidden={{ centre_id: centreId }} columns={1} submitLabel="Add staff" fields={[{ name: "user_id", label: "Staff member", type: "select", required: true, options: people.filter((p) => !current.includes(p.value)) }]} resetOnSuccess />
    </div>
  );
}

export default function Page() {
  return (
    <BfPage title="Service Centres" description="Locations, staff and operating hours for nearby-centre service." module="service">
      <Content />
    </BfPage>
  );
}
