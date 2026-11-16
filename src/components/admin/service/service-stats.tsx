import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

type Stats = {
  total: number;
  new: number;
  inspection_pending: number;
  inspection_completed: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  service_revenue: number;
  spare_parts_revenue: number;
  pending_payments: number;
  bills_to_approve: number;
  parts_to_approve: number;
  low_stock_parts: number;
};

/** Service Management dashboard: real numbers from public.service_dashboard_stats(). */
export async function ServiceStats() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("service_dashboard_stats");
  if (error || !data) return null;
  const s = data as Stats;
  const tiles: { label: string; value: string; href?: string; tone?: "warn" }[] = [
    { label: "Total bookings", value: formatNumber(s.total) },
    { label: "New bookings", value: formatNumber(s.new), href: "/admin/service?status=new", tone: s.new ? "warn" : undefined },
    { label: "Inspection pending", value: formatNumber(s.inspection_pending) },
    { label: "Inspection completed", value: formatNumber(s.inspection_completed), href: "/admin/service?status=inspection_completed" },
    { label: "Service in progress", value: formatNumber(s.in_progress), href: "/admin/service?status=started" },
    { label: "Completed services", value: formatNumber(s.completed) },
    { label: "Cancelled", value: formatNumber(s.cancelled), href: "/admin/service?status=cancelled" },
    { label: "Service revenue", value: formatPaise(s.service_revenue) },
    { label: "Spare parts revenue", value: formatPaise(s.spare_parts_revenue) },
    { label: "Pending payments", value: formatPaise(s.pending_payments), tone: s.pending_payments ? "warn" : undefined },
    { label: "Bills to approve", value: formatNumber(s.bills_to_approve), tone: s.bills_to_approve ? "warn" : undefined },
    { label: "Low stock parts", value: formatNumber(s.low_stock_parts), href: "/admin/spare-parts?show=low", tone: s.low_stock_parts ? "warn" : undefined },
  ];
  return (
    <section aria-label="Service numbers" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {tiles.map((t) => {
        const body = (
          <>
            <span className="block text-xs text-muted-foreground">{t.label}</span>
            <span className={cn("mt-1 block font-heading text-lg font-bold break-words tabular", t.tone === "warn" ? "text-warning" : "text-deep")}>{t.value}</span>
          </>
        );
        return t.href ? (
          <Link key={t.label} href={t.href} className="rounded-xl border bg-white p-3 shadow-card hover:border-royal/40">
            {body}
          </Link>
        ) : (
          <div key={t.label} className="rounded-xl border bg-white p-3 shadow-card">
            {body}
          </div>
        );
      })}
    </section>
  );
}
