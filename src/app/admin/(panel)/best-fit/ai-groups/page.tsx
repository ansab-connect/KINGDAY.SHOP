import type { Metadata } from "next";
import { RouteBuilder, type Suggestion } from "@/components/best-fit/route-builder";
import { BfPage, Panel, param, type SP } from "@/components/best-fit/ui";
import { suggestGroups } from "@/features/best-fit/grouping";
import { BOOKING_COLS, getGroups, getPeople, techOptions, type BfBooking } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Location Groups" };

type TS = { user_id: string; skills: string[]; service_areas: string[]; max_daily_tasks: number; is_available: boolean; base_latitude: number | null; base_longitude: number | null };

async function Content({ searchParams }: SP) {
  const radius = Math.min(50, Math.max(2, Number(param(await searchParams, "radius")) || 12));
  const supabase = await createClient();
  const [{ data }, people, groups, { data: st }, { data: wos }] = await Promise.all([
    supabase.from("service_bookings").select(BOOKING_COLS).eq("status", "new").neq("service_mode", "centre").order("created_at"),
    getPeople(),
    getGroups(),
    supabase.from("technician_settings").select("user_id, skills, service_areas, max_daily_tasks, is_available, base_latitude, base_longitude"),
    supabase.from("work_orders").select("technician_id").not("status", "in", "(cancelled,reassigned,completed,ready_for_delivery,invoiced)"),
  ]);
  const bookings = (data ?? []) as unknown as BfBooking[];
  const settings = new Map(((st ?? []) as TS[]).map((s) => [s.user_id, s]));
  const openCount = (id: string) => ((wos ?? []) as { technician_id: string | null }[]).filter((w) => w.technician_id === id).length;
  const techs = people.filter((p) => p.is_technician).map((p) => {
    const s = settings.get(p.user_id);
    return { id: p.user_id, name: p.full_name, areas: s?.service_areas ?? [], skills: s?.skills ?? [], capacity: s?.max_daily_tasks ?? 6, available: s?.is_available ?? true, open: openCount(p.user_id), base: s?.base_latitude != null && s.base_longitude != null ? { lat: s.base_latitude, lng: s.base_longitude } : null };
  });
  const gb = bookings.map((b) => ({ id: b.id, code: b.booking_code, lat: b.latitude, lng: b.longitude, town: b.town, category: b.category, priority: b.priority, createdAt: b.created_at, label: `${b.customer_name} · ${b.category_label ?? b.category} · ${b.town ?? (b.address ?? "").slice(0, 40)}` }));
  const unlocated = gb.filter((b) => b.lat == null || b.lng == null);
  const suggestions: Suggestion[] = [
    ...suggestGroups(gb, techs, radius).map((g, i) => ({ key: g.key, title: `Suggestion ${i + 1}`, reason: g.reason, technicianId: g.techId, stops: g.bookings.map((b) => ({ id: b.id, code: b.code, label: b.label, hint: b.priority !== "normal" ? `Priority: ${b.priority}` : undefined })) })),
    ...(unlocated.length ? [{ key: "nopin", title: "No map location", reason: "These customers didn't share a pin. Group them by hand.", technicianId: null, stops: unlocated.map((b) => ({ id: b.id, code: b.code, label: b.label })) }] : []),
  ];
  return (
    <>
      <form className="flex items-end gap-2 text-sm">
        <label className="flex flex-col gap-1"><span className="font-medium text-deep">Group radius (km)</span><input name="radius" type="number" min={2} max={50} defaultValue={radius} className="h-10 w-28 rounded-lg border px-3" /></label>
        <button className="h-10 rounded-lg border bg-white px-4 font-semibold text-deep">Recalculate</button>
      </form>
      <Panel title={`${suggestions.length} suggestions for ${bookings.length} unassigned home bookings`} description="Based on map position, priority, booking age, technician availability, skills, service areas and daily capacity. Accept, edit (tick/untick), merge (tick across groups) or reject. Nothing is assigned until you create the route, and work orders only if you tick that option.">
        {suggestions.length ? <RouteBuilder suggestions={suggestions} techs={techOptions(people)} groups={groups.filter((g) => g.is_active).map((g) => ({ value: g.id, label: g.name }))} /> : <p className="text-sm text-muted-foreground">No unassigned home bookings.</p>}
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="AI Location Groups" module="best_fit"><Content {...props} /></BfPage>;
}
