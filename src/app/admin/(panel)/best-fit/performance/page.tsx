import type { Metadata } from "next";
import { BfPage, DataTable, Panel, RangeFilter, km, range, type SP } from "@/components/best-fit/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician Performance" };

type P = { user_id: string; full_name: string; staff_code: string | null; work_orders: number; completed: number; cancelled_or_reassigned: number; open_now: number; verified_km: number; avg_hours_to_complete: number | null };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("technician_performance", { p_from: from, p_to: to });
  const rows = ((data ?? []) as P[]).map((p) => ({ ...p, id: p.user_id }));
  return (
    <>
      <RangeFilter from={from} to={to} />
      {error ? <p className="text-sm text-danger">{error.message}</p> : null}
      <Panel title="Workload and results" description="From work orders created in the period.">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Technician", render: (p) => <><p className="font-semibold">{p.full_name}</p><p className="text-xs text-muted-foreground">{p.staff_code}</p></> },
          { key: "w", label: "Work orders", render: (p) => p.work_orders },
          { key: "c", label: "Completed", render: (p) => `${p.completed}${p.work_orders ? ` (${Math.round((p.completed / p.work_orders) * 100)}%)` : ""}` },
          { key: "x", label: "Cancelled / reassigned", render: (p) => p.cancelled_or_reassigned },
          { key: "o", label: "Open now", render: (p) => p.open_now },
          { key: "k", label: "Verified distance", render: (p) => km(p.verified_km) },
          { key: "h", label: "Avg hours to complete", render: (p) => p.avg_hours_to_complete ?? "—" },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Technician Performance" module="best_fit"><Content {...props} /></BfPage>;
}
