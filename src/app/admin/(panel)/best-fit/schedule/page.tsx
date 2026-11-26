import type { Metadata } from "next";
import Link from "next/link";
import { OpForm } from "@/components/best-fit/op-form";
import { BfPage, Panel, Status, day, param, type SP } from "@/components/best-fit/ui";
import { getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Task Scheduling" };

type WO = { id: string; work_order_number: string; booking_id: string; technician_id: string | null; status: string; scheduled_date: string | null; scheduled_slot: string | null; service_bookings: { booking_code: string; customer_name: string; town: string | null } | null };
const SLOTS = [{ value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }, { value: "evening", label: "Evening" }];

async function Content({ searchParams }: SP) {
  const sp = await searchParams;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "week")) ? new Date(`${param(sp, "week")}T00:00:00`) : new Date(new Date().toDateString());
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000).toLocaleDateString("en-CA"));
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([
    supabase.from("work_orders").select("id, work_order_number, booking_id, technician_id, status, scheduled_date, scheduled_slot, service_bookings(booking_code, customer_name, town)").not("status", "in", "(cancelled,reassigned,completed,ready_for_delivery,invoiced)").order("scheduled_date", { nullsFirst: true }),
    getPeople(),
  ]);
  const rows = (data ?? []) as unknown as WO[];
  const unscheduled = rows.filter((r) => !r.scheduled_date);
  const prev = new Date(start.getTime() - 7 * 86400000).toLocaleDateString("en-CA");
  const next = new Date(start.getTime() + 7 * 86400000).toLocaleDateString("en-CA");
  const card = (w: WO) => (
    <li key={w.id} className="rounded-lg border bg-white p-2 text-xs">
      <Link href={`/admin/service/${w.booking_id}`} className="font-mono font-semibold text-royal">{w.service_bookings?.booking_code}</Link> <Status s={w.status} />
      <p className="mt-1 text-deep">{w.service_bookings?.customer_name}{w.service_bookings?.town ? ` · ${w.service_bookings.town}` : ""}</p>
      <p className="text-muted-foreground">{personName(people, w.technician_id)}{w.scheduled_slot ? ` · ${w.scheduled_slot}` : ""}</p>
      <details className="mt-1"><summary className="cursor-pointer font-semibold text-royal">Reschedule</summary><div className="mt-1"><OpForm op="wo.schedule" hidden={{ id: w.id }} columns={1} initial={{ scheduled_date: w.scheduled_date, scheduled_slot: w.scheduled_slot }} fields={[{ name: "scheduled_date", label: "Date", type: "date", required: true }, { name: "scheduled_slot", label: "Slot", type: "select", options: SLOTS }]} /></div></details>
    </li>
  );
  return (
    <>
      <div className="flex gap-2 text-sm"><Link href={`?week=${prev}`} className="rounded-lg border bg-white px-3 py-1.5 font-semibold">← Previous week</Link><Link href="?" className="rounded-lg border bg-white px-3 py-1.5 font-semibold">This week</Link><Link href={`?week=${next}`} className="rounded-lg border bg-white px-3 py-1.5 font-semibold">Next week →</Link></div>
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => (
          <section key={d} className="rounded-xl bg-muted/50 p-2">
            <h2 className="mb-2 text-sm font-semibold text-deep">{day(d)}</h2>
            <ul className="flex flex-col gap-2">{rows.filter((r) => r.scheduled_date === d).map(card)}</ul>
          </section>
        ))}
      </div>
      <Panel title={`Not scheduled (${unscheduled.length})`}>
        <ul className="grid gap-2 md:grid-cols-3">{unscheduled.map(card)}</ul>
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Task Scheduling" description="Open work orders by day." module="best_fit"><Content {...props} /></BfPage>;
}
