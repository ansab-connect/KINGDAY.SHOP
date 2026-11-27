import type { Metadata } from "next";
import { OpForm } from "@/components/best-fit/op-form";
import { BfPage, MoreLinks, DataTable, Panel, Status } from "@/components/best-fit/ui";
import { getGroups, getPeople } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician Dashboard" };

type Settings = { user_id: string; skills: string[]; service_areas: string[]; max_daily_tasks: number; is_available: boolean; base_latitude: number | null; base_longitude: number | null };

async function Content() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [people, groups, { data: st }, { data: wos }] = await Promise.all([
    getPeople(),
    getGroups(),
    supabase.from("technician_settings").select("*"),
    supabase.from("work_orders").select("technician_id, status, scheduled_date").not("status", "in", "(cancelled,reassigned)"),
  ]);
  const settings = new Map(((st ?? []) as Settings[]).map((s) => [s.user_id, s]));
  const w = (wos ?? []) as { technician_id: string | null; status: string; scheduled_date: string | null }[];
  const done = ["completed", "ready_for_delivery", "invoiced"];
  const rows = people.filter((p) => p.is_technician).map((p) => {
    const mine = w.filter((x) => x.technician_id === p.user_id);
    const s = settings.get(p.user_id);
    return { id: p.user_id, p, s, open: mine.filter((x) => !done.includes(x.status)).length, today: mine.filter((x) => x.scheduled_date === today && !done.includes(x.status)).length, done: mine.filter((x) => done.includes(x.status)).length, groups: groups.filter((g) => g.technician_group_members.some((m) => m.user_id === p.user_id)).map((g) => g.name) };
  });
  return (
    <Panel title="Service technicians" description="Skills, service areas, availability and daily capacity are used by AI Location Groups. Add technicians in Staff Management (Service Technician role).">
      <DataTable rows={rows} empty="No service technicians yet." cols={[
        { key: "n", label: "Technician", render: (r) => <><p className="font-semibold">{r.p.full_name}</p><p className="text-xs text-muted-foreground">{r.p.staff_code}</p></> },
        { key: "a", label: "Available", render: (r) => <Status s={r.s?.is_available === false ? "inactive" : "active"} /> },
        { key: "l", label: "Today / open / done", render: (r) => `${r.today} / ${r.open} / ${r.done}` },
        { key: "c", label: "Capacity", render: (r) => `${r.s?.max_daily_tasks ?? 6} per day` },
        { key: "sk", label: "Skills · areas", render: (r) => <>{(r.s?.skills ?? []).join(", ") || "—"}<p className="text-xs text-muted-foreground">{(r.s?.service_areas ?? []).join(", ") || "Any area"}</p></> },
        { key: "g", label: "Groups", render: (r) => r.groups.join(", ") || "—" },
        { key: "e", label: "", render: (r) => (
          <details><summary className="cursor-pointer text-sm font-semibold text-royal">Edit</summary>
            <div className="mt-2 w-[min(80vw,600px)]">
              <OpForm op="techsettings.upsert" hidden={{ user_id: r.id }} initial={r.s ?? { max_daily_tasks: 6, is_available: true }}
                fields={[
                  { name: "skills", label: "Skills (comma separated)", type: "list", placeholder: "battery, motor, cycle" },
                  { name: "service_areas", label: "Service areas (towns)", type: "list", placeholder: "Kozhikode, Feroke" },
                  { name: "max_daily_tasks", label: "Max tasks per day", type: "number", required: true },
                  { name: "is_available", label: "Available for new work", type: "bool" },
                  { name: "base_latitude", label: "Home base latitude", type: "number" },
                  { name: "base_longitude", label: "Home base longitude", type: "number" },
                ]} />
            </div>
          </details>
        ) },
      ]} />
    </Panel>
  );
}

export default function Page() {
  return <BfPage title="Technician Dashboard" module="best_fit"><MoreLinks links={[["/admin/best-fit/groups", "Technician groups"], ["/admin/best-fit/ai-groups", "AI location groups"], ["/admin/best-fit/schedule", "Task scheduling"]]} /><Content /></BfPage>;
}
