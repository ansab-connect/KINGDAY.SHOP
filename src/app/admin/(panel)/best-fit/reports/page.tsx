import type { Metadata } from "next";
import { BfPage, CsvLink, DataTable, Panel, RangeFilter, Stats, km, label, range, rupees, type SP } from "@/components/best-fit/ui";
import { getGroups, getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "BEST FIT Reports" };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const end = `${to}T23:59:59.999`;
  const supabase = await createClient();
  const [{ data: bk }, { data: pis }, { data: inv }, { data: wos }, { data: routes }, people, groups] = await Promise.all([
    supabase.from("service_bookings").select("status, service_type_label, service_type, service_mode, verified_distance_km").gte("created_at", from).lte("created_at", end),
    supabase.from("inspection_pre_invoices").select("charge_paise").eq("status", "issued").gte("created_at", from).lte("created_at", end),
    supabase.from("service_invoices").select("basic_charge, labour_charge, additional_total, spare_parts_total").eq("approval_status", "approved").gte("created_at", from).lte("created_at", end),
    supabase.from("work_orders").select("technician_id, group_id, status, booking_id").gte("created_at", from).lte("created_at", end),
    supabase.from("route_plans").select("status, total_km, total_minutes, stops").gte("plan_date", from).lte("plan_date", to),
    getPeople(),
    getGroups(),
  ]);
  const b = (bk ?? []) as { status: string; service_type_label: string | null; service_type: string; service_mode: string; verified_distance_km: number | null }[];
  const count = <T,>(xs: T[], f: (x: T) => string) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {})).map(([k, n]) => ({ id: k, k, n }));
  const sum = (xs: number[]) => xs.reduce((n, x) => n + Number(x || 0), 0);
  const w = (wos ?? []) as { technician_id: string | null; group_id: string | null; status: string }[];
  const r = (routes ?? []) as { status: string; total_km: number | null; total_minutes: number | null; stops: unknown[] }[];
  const done = ["completed", "ready_for_delivery", "invoiced"];
  const svcRevenue = sum(((inv ?? []) as { basic_charge: number; labour_charge: number; additional_total: number }[]).map((i) => i.basic_charge + i.labour_charge + i.additional_total));
  const q = `?from=${from}&to=${to}`;
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Stats items={[
        { label: "Bookings", value: b.length },
        { label: "Inspection revenue", value: rupees(sum(((pis ?? []) as { charge_paise: number }[]).map((p) => p.charge_paise))) },
        { label: "Service revenue (gross)", value: rupees(svcRevenue) },
        { label: "Verified distance", value: km(sum(b.map((x) => x.verified_distance_km ?? 0))) },
      ]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="By status"><DataTable rows={count(b, (x) => x.status)} cols={[{ key: "k", label: "Status", render: (x) => label(x.k) }, { key: "n", label: "Bookings" }]} /></Panel>
        <Panel title="By service type"><DataTable rows={count(b, (x) => x.service_type_label ?? x.service_type)} cols={[{ key: "k", label: "Type" }, { key: "n", label: "Bookings" }]} /></Panel>
        <Panel title="By service mode"><DataTable rows={count(b, (x) => (x.service_mode === "centre" ? "Service centre" : "Home"))} cols={[{ key: "k", label: "Mode" }, { key: "n", label: "Bookings" }]} /></Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Technician workload">
          <DataTable rows={count(w, (x) => x.technician_id ?? "none").map((x) => ({ ...x, done: w.filter((y) => (y.technician_id ?? "none") === x.k && done.includes(y.status)).length }))} cols={[{ key: "k", label: "Technician", render: (x) => personName(people, x.k === "none" ? null : x.k) }, { key: "n", label: "Work orders" }, { key: "done", label: "Completed" }]} />
        </Panel>
        <Panel title="Group performance">
          <DataTable rows={count(w.filter((x) => x.group_id), (x) => x.group_id!).map((x) => ({ ...x, done: w.filter((y) => y.group_id === x.k && done.includes(y.status)).length }))} empty="No group work orders." cols={[{ key: "k", label: "Group", render: (x) => groups.find((g) => g.id === x.k)?.name ?? "—" }, { key: "n", label: "Work orders" }, { key: "done", label: "Completed" }]} />
        </Panel>
      </div>
      <Panel title="Route efficiency" description="Only routes calculated by the routing provider have distances.">
        <Stats items={[
          { label: "Routes", value: r.length },
          { label: "Published", value: r.filter((x) => x.status === "published").length },
          { label: "Stops per route", value: r.length ? (sum(r.map((x) => x.stops.length)) / r.length).toFixed(1) : "—" },
          { label: "Km per stop", value: sum(r.map((x) => x.stops.length)) && r.some((x) => x.total_km != null) ? (sum(r.filter((x) => x.total_km != null).map((x) => x.total_km!)) / sum(r.filter((x) => x.total_km != null).map((x) => x.stops.length))).toFixed(1) : "—" },
        ]} />
      </Panel>
      <div className="flex flex-wrap gap-2">
        <CsvLink href={`/admin/export/bookings${q}`} /><span className="self-center text-xs text-muted-foreground">bookings</span>
        <CsvLink href={`/admin/export/work-orders${q}`} /><span className="self-center text-xs text-muted-foreground">work orders</span>
        <CsvLink href={`/admin/export/earnings${q}`} /><span className="self-center text-xs text-muted-foreground">technician earnings</span>
      </div>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="BEST FIT Reports" module="best_fit"><Content {...props} /></BfPage>;
}
