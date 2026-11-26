import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "lucide-react";
import { day, km, mapsDir, type RouteStop } from "@/components/best-fit/ui";
import { L } from "@/components/i18n/lang";
import { requireTeam } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My routes" };

type R = { id: string; route_number: string; plan_date: string; stops: RouteStop[]; total_km: number | null; total_minutes: number | null; notes: string | null };

const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

/** Published routes for this technician (or their group). Drafts are never shown. */
export default async function RoutesPage() {
  await requireTeam();
  const supabase = await createClient();
  const since = yesterday();
  const { data } = await supabase.from("route_plans").select("id, route_number, plan_date, stops, total_km, total_minutes, notes").eq("status", "published").gte("plan_date", since).order("plan_date");
  const routes = (data ?? []) as R[];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-deep"><L en="My routes" ml="എന്റെ റൂട്ടുകൾ" /></h1>
      {routes.length === 0 ? <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground"><L en="No published routes for you yet." ml="റൂട്ടുകൾ ഇതുവരെ ഇല്ല." /></p> : null}
      {routes.map((r) => (
        <section key={r.id} className="rounded-2xl border bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading font-semibold text-deep">{day(r.plan_date)} · {r.route_number}</h2>
            <p className="text-sm text-muted-foreground">{r.total_km != null ? `${km(r.total_km)} · about ${r.total_minutes} min` : `${r.stops.length} stops`}</p>
          </div>
          {r.notes ? <p className="mt-1 text-sm text-deep">{r.notes}</p> : null}
          <ol className="mt-3 flex flex-col gap-2">
            {r.stops.map((s) => (
              <li key={s.booking_id} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-royal text-xs font-bold text-white">{s.seq}</span>
                <span className="min-w-0 flex-1">
                  <Link href={`/staff/jobs/${s.booking_id}`} className="font-semibold text-royal">{s.booking_code ?? "Job"}</Link> <span className="text-deep">{s.label}</span>
                  {s.leg_km != null ? <span className="block text-xs text-muted-foreground">{km(s.leg_km)} · {s.leg_minutes} min from previous stop</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {mapsDir(r.stops) ? (
            <a href={mapsDir(r.stops)!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-royal px-5 text-sm font-semibold text-white"><Navigation className="size-4" /> <L en="Start navigation" ml="നാവിഗേഷൻ തുടങ്ങുക" /></a>
          ) : null}
        </section>
      ))}
    </div>
  );
}
