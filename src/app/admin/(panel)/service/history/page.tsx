import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, DataTable, Panel, RangeFilter, Status, day, km, range, type SP } from "@/components/best-fit/ui";
import { getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service History" };

type Row = { id: string; booking_code: string; customer_name: string; category_label: string | null; category: string; service_type_label: string | null; service_mode: string; status: string; assigned_to: string | null; verified_distance_km: number | null; created_at: string; completed_at: string | null };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([
    supabase.from("service_bookings").select("id, booking_code, customer_name, category_label, category, service_type_label, service_mode, status, assigned_to, verified_distance_km, created_at, completed_at")
      .in("status", ["completed", "ready_for_delivery", "invoiced", "cancelled"]).gte("created_at", from).lt("created_at", `${to}T23:59:59.999`).order("created_at", { ascending: false }).limit(500),
    getPeople(),
  ]);
  const rows = (data ?? []) as Row[];
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title={`${rows.length} closed bookings`}>
        <DataTable rows={rows} cols={[
          { key: "b", label: "Booking", render: (r) => <Link href={`/admin/service/${r.id}`} className="font-mono font-semibold text-royal">{r.booking_code}</Link> },
          { key: "c", label: "Customer", render: (r) => r.customer_name },
          { key: "p", label: "Product / type", render: (r) => <>{r.category_label ?? r.category}<p className="text-xs text-muted-foreground">{r.service_type_label ?? ""} · {r.service_mode === "centre" ? "Centre" : "Home"}</p></> },
          { key: "t", label: "Technician", render: (r) => personName(people, r.assigned_to) },
          { key: "k", label: "Distance", render: (r) => km(r.verified_distance_km) },
          { key: "s", label: "Status", render: (r) => <Status s={r.status} /> },
          { key: "d", label: "Booked / done", render: (r) => <>{day(r.created_at)}<p className="text-xs text-muted-foreground">{day(r.completed_at)}</p></> },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Service History" module="service"><Content {...props} /></BfPage>;
}
