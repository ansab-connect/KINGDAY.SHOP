import type { Metadata } from "next";
import Link from "next/link";
import { OpButton } from "@/components/best-fit/op-form";
import { RouteBuilder } from "@/components/best-fit/route-builder";
import { BfPage, DataTable, Panel, Status, day, km, mapsDir, type RouteStop } from "@/components/best-fit/ui";
import { BOOKING_COLS, getGroups, getPeople, personName, techOptions, type BfBooking } from "@/features/best-fit/queries";
import { routingProvider } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Route Planning" };

type RouteRow = { id: string; route_number: string; plan_date: string; technician_id: string | null; group_id: string | null; status: string; stops: RouteStop[]; total_km: number | null; total_minutes: number | null };

async function Content() {
  const supabase = await createClient();
  const [{ data }, people, groups, { data: open }] = await Promise.all([
    supabase.from("route_plans").select("*").order("plan_date", { ascending: false }).limit(100),
    getPeople(),
    getGroups(),
    supabase.from("service_bookings").select(BOOKING_COLS).in("status", ["new", "assigned", "scheduled", "accepted"]).neq("service_mode", "centre").order("created_at"),
  ]);
  const routes = (data ?? []) as RouteRow[];
  const bookings = (open ?? []) as unknown as BfBooking[];
  return (
    <>
      {!routingProvider ? <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">No road-routing provider is configured (ROUTING_OSRM_URL). Routes can be planned and published, but stop order, distances and travel times are not calculated — they are never guessed.</p> : null}
      <Panel title="Routes" description="Draft → Approve → Publish. Technicians see only published routes for them or their group.">
        <DataTable rows={routes} empty="No routes yet." cols={[
          { key: "n", label: "Route", render: (r) => <><p className="font-mono font-semibold">{r.route_number}</p><p className="text-xs text-muted-foreground">{day(r.plan_date)}</p></> },
          { key: "t", label: "Technician / group", render: (r) => <>{personName(people, r.technician_id)}{r.group_id ? <p className="text-xs text-muted-foreground">{groups.find((g) => g.id === r.group_id)?.name}</p> : null}</> },
          { key: "s", label: "Stops", render: (r) => (
            <ol className="flex flex-col gap-0.5 text-xs">
              {r.stops.map((s) => <li key={s.booking_id}>{s.seq}. <Link href={`/admin/service/${s.booking_id}`} className="font-mono text-royal">{s.booking_code ?? "booking"}</Link> {s.label}{s.leg_km != null ? ` · ${km(s.leg_km)}, ${s.leg_minutes} min` : ""}</li>)}
            </ol>
          ) },
          { key: "d", label: "Total", render: (r) => (r.total_km != null ? `${km(r.total_km)} · ${r.total_minutes} min` : <span className="text-xs text-muted-foreground">not calculated</span>) },
          { key: "st", label: "Status", render: (r) => <Status s={r.status} /> },
          { key: "a", label: "", render: (r) => (
            <div className="flex flex-col gap-1">
              {mapsDir(r.stops) ? <a href={mapsDir(r.stops)!} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-royal">Open map</a> : null}
              {r.status === "draft" ? <OpButton op="route.review" values={{ id: r.id, action: "approve" }} label="Approve" /> : null}
              {r.status === "approved" ? <OpButton op="route.review" values={{ id: r.id, action: "publish" }} label="Publish" tone="gold" /> : null}
              {["draft", "approved"].includes(r.status) ? <OpButton op="route.review" values={{ id: r.id, action: "reject" }} label="Reject" tone="neutral" /> : null}
              {r.status === "published" ? <OpButton op="route.review" values={{ id: r.id, action: "unpublish" }} label="Unpublish" tone="neutral" /> : null}
              {["draft", "rejected"].includes(r.status) ? <OpButton op="route.delete" values={{ id: r.id }} label="Delete" tone="danger" confirmText="Delete this route?" /> : null}
            </div>
          ) },
        ]} />
      </Panel>
      <Panel title="Plan a new route" description="Tick bookings, choose the technician or group and the date. The routing provider puts the stops in the best order.">
        <RouteBuilder
          suggestions={[{ key: "open", title: "Open home bookings", reason: `${bookings.length} not yet started`, technicianId: null, stops: bookings.map((b) => ({ id: b.id, code: b.booking_code, label: `${b.customer_name} · ${b.town ?? (b.address ?? "").slice(0, 40)}`, hint: `${b.status}${b.assigned_to ? ` · ${personName(people, b.assigned_to)}` : ""}${b.latitude == null ? " · no map pin" : ""}` })) }]}
          techs={techOptions(people)}
          groups={groups.filter((g) => g.is_active).map((g) => ({ value: g.id, label: g.name }))}
        />
      </Panel>
    </>
  );
}

export default function Page() {
  return <BfPage title="Route Planning" module="best_fit"><Content /></BfPage>;
}
