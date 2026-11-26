import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, DataTable, Panel, Status, Tabs, day, param, when, type SP } from "@/components/best-fit/ui";
import { getGroups, getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Work Orders" };

type WO = { id: string; work_order_number: string; booking_id: string; technician_id: string | null; group_id: string | null; status: string; scheduled_date: string | null; scheduled_slot: string | null; created_at: string; service_bookings: { booking_code: string; customer_name: string; category_label: string | null; category: string } | null };
const OPEN = "(cancelled,reassigned,completed,ready_for_delivery,invoiced)";

async function Content({ searchParams }: SP) {
  const tab = param(await searchParams, "tab") || "open";
  const supabase = await createClient();
  let q = supabase.from("work_orders").select("id, work_order_number, booking_id, technician_id, group_id, status, scheduled_date, scheduled_slot, created_at, service_bookings(booking_code, customer_name, category_label, category)").order("created_at", { ascending: false }).limit(500);
  q = tab === "open" ? q.not("status", "in", OPEN) : tab === "done" ? q.in("status", ["completed", "ready_for_delivery", "invoiced"]) : q.in("status", ["cancelled", "reassigned"]);
  const [{ data }, people, groups] = await Promise.all([q, getPeople(), getGroups()]);
  const rows = (data ?? []) as unknown as WO[];
  return (
    <>
      <Tabs current={tab} tabs={[{ key: "open", label: "Open", href: "?tab=open" }, { key: "done", label: "Completed", href: "?tab=done" }, { key: "closed", label: "Cancelled / reassigned", href: "?tab=closed" }]} />
      <Panel title={`${rows.length} work orders`} description="Each work order belongs to one Service Booking ID. Reassigning closes the old order and keeps it in history.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Work order", render: (r) => <><p className="font-mono font-semibold">{r.work_order_number}</p><p className="text-xs text-muted-foreground">{when(r.created_at)}</p></> },
          { key: "b", label: "Booking", render: (r) => <><Link href={`/admin/service/${r.booking_id}`} className="font-mono text-xs text-royal">{r.service_bookings?.booking_code}</Link><p className="text-xs">{r.service_bookings?.customer_name} · {r.service_bookings?.category_label ?? r.service_bookings?.category}</p></> },
          { key: "t", label: "Technician", render: (r) => <>{personName(people, r.technician_id)}{r.group_id ? <p className="text-xs text-muted-foreground">{groups.find((g) => g.id === r.group_id)?.name}</p> : null}</> },
          { key: "d", label: "Scheduled", render: (r) => (r.scheduled_date ? `${day(r.scheduled_date)}${r.scheduled_slot ? ` · ${r.scheduled_slot}` : ""}` : "—") },
          { key: "s", label: "Status", render: (r) => <Status s={r.status} /> },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Work Orders" module="best_fit"><Content {...props} /></BfPage>;
}
