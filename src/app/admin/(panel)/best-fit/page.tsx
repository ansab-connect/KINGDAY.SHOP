import type { Metadata } from "next";
import Link from "next/link";
import { OpForm } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Stats, day, km } from "@/components/best-fit/ui";
import { BOOKING_COLS, getGroups, getPeople, techOptions, type BfBooking } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Unassigned Services" };

async function Content() {
  const supabase = await createClient();
  const [{ data }, people, groups, { count: openWo }] = await Promise.all([
    supabase.from("service_bookings").select(BOOKING_COLS).eq("status", "new").order("created_at"),
    getPeople(),
    getGroups(),
    supabase.from("work_orders").select("id", { count: "exact", head: true }).not("status", "in", "(cancelled,reassigned,completed,ready_for_delivery,invoiced)"),
  ]);
  const rows = (data ?? []) as unknown as BfBooking[];
  const techs = techOptions(people);
  const groupOpts = groups.filter((g) => g.is_active).map((g) => ({ value: g.id, label: g.name }));
  return (
    <>
      <Stats items={[
        { label: "Unassigned", value: rows.length },
        { label: "Home visits", value: rows.filter((r) => r.service_mode !== "centre").length },
        { label: "At service centres", value: rows.filter((r) => r.service_mode === "centre").length },
        { label: "Open work orders", value: openWo ?? 0, href: "/admin/best-fit/work-orders" },
      ]} />
      <Panel title="Waiting for a technician" description="Oldest first. Assign a technician or a group (its leader takes the job). For many nearby bookings use AI Location Groups.">
        <DataTable rows={rows} empty="Every booking is assigned." cols={[
          { key: "b", label: "Booking", render: (r) => <><Link href={`/admin/service/${r.id}`} className="font-mono font-semibold text-royal">{r.booking_code}</Link><p className="text-xs text-muted-foreground">{day(r.created_at)}</p></> },
          { key: "c", label: "Customer", render: (r) => <>{r.customer_name}<p className="text-xs text-muted-foreground">{r.mobile}</p></> },
          { key: "p", label: "Service", render: (r) => <>{r.category_label ?? r.category}<p className="text-xs text-muted-foreground">{r.service_type_label} · {r.service_mode === "centre" ? "Centre" : "Home"}{r.voice_path ? " · 🎙 voice" : ""}</p></> },
          { key: "w", label: "Where", render: (r) => <>{r.town ?? (r.address ?? "").slice(0, 40)}<p className="text-xs text-muted-foreground">{r.verified_distance_km != null ? `Verified ${km(r.verified_distance_km)}` : r.estimated_distance_km != null ? `Est. ${km(r.estimated_distance_km)}` : r.latitude != null ? "Map pin" : "No pin"}</p></> },
          { key: "a", label: "Assign", render: (r) => (
            <div className="w-[min(70vw,520px)]">
              <OpForm op="wo.assign" hidden={{ booking_id: r.id }} columns={3} submitLabel="Assign"
                fields={[
                  { name: "technician_id", label: "Technician", type: "select", options: techs },
                  { name: "group_id", label: "or Group", type: "select", options: groupOpts },
                  { name: "scheduled_date", label: "Date", type: "date" },
                ]} />
            </div>
          ) },
        ]} />
      </Panel>
    </>
  );
}

export default function Page() {
  return <BfPage title="Unassigned Services" description="All new bookings land here until a work order is created." module="best_fit"><Content /></BfPage>;
}
