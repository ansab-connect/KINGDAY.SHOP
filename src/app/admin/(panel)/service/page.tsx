import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { SERVICE_STATUSES, categoryLabel, statusLabel } from "@/features/service/constants";
import { listTechnicians, type BookingRow, type Technician } from "@/features/service/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Service Management" };

const OPEN = ["new", "assigned", "accepted", "on_the_way", "reached", "started"];

async function ServiceContent({ searchParams }: PageProps<"/admin/service">) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? "")).trim();
  const status = first(sp.status) === "unassigned" || SERVICE_STATUSES.some((s) => s.value === first(sp.status)) ? first(sp.status) : "open";
  const q = first(sp.q).slice(0, 80);

  let rows: BookingRow[] = [];
  let error: string | null = null;
  const counts: Record<string, number> = {};
  let technicians: Technician[] = [];
  if (!isSupabaseConfigured) error = "Service management needs Supabase.";
  else {
    const supabase = await createClient();
    let query = supabase.from("service_bookings").select("*").order("preferred_date").order("created_at").limit(300);
    query = status === "open" ? query.in("status", OPEN) : status === "unassigned" ? query.eq("status", "new").is("assigned_to", null) : query.eq("status", status);
    if (q) query = query.or(`booking_code.ilike.%${q.replace(/[%,()]/g, "")}%,customer_name.ilike.%${q.replace(/[%,()]/g, "")}%,mobile.ilike.%${q.replace(/[%,()]/g, "")}%`);
    const [{ data, error: e }, { data: all }] = await Promise.all([query, supabase.from("service_bookings").select("status, assigned_to").limit(5000)]);
    if (e) error = /service_bookings|schema cache/i.test(e.message) ? "Apply migration 20261114001500_service_bookings.sql in Supabase first." : "Couldn't load bookings.";
    rows = (data ?? []) as BookingRow[];
    technicians = e ? [] : await listTechnicians();
    for (const r of (all ?? []) as { status: string; assigned_to: string | null }[]) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status === "new" && !r.assigned_to) counts.unassigned = (counts.unassigned ?? 0) + 1;
    }
  }
  const openCount = OPEN.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const tabs = [
    { value: "unassigned", label: "Needs technician", n: counts.unassigned ?? 0 },
    { value: "open", label: "Open", n: openCount },
    ...SERVICE_STATUSES.map((s) => ({ value: s.value, label: s.label, n: counts[s.value] ?? 0 })),
  ];

  return (
    <>
      <PageHeader title="Service Management" description="Customer service bookings. Assign technicians and follow every job to completion." />
      <AutoRefresh seconds={30} />
      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
          {technicians.length ? (
            <section aria-label="Technician performance" className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Technicians</h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {technicians.map((t) => (
                  <li key={t.user_id} className="rounded-xl border bg-white p-4 shadow-card">
                    <p className="truncate text-sm font-semibold text-deep">{t.full_name || "—"}</p>
                    <p className="font-mono text-xs text-royal">{t.staff_code ?? ""}</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {[["Open", t.open_jobs], ["30 days", t.completed_30d], ["Total done", t.completed_total]].map(([k, v]) => (
                        <div key={k} className="rounded-lg bg-muted/50 py-1.5">
                          <dd className="font-heading text-lg font-bold text-deep tabular">{v}</dd>
                          <dt className="text-[0.68rem] text-muted-foreground">{k}</dt>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <nav aria-label="Filter bookings" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {tabs.map((t) => (
                <Link
                  key={t.value}
                  href={{ pathname: "/admin/service", query: { ...(q ? { q } : {}), ...(t.value === "open" ? {} : { status: t.value }) } }}
                  aria-current={status === t.value ? "page" : undefined}
                  className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap", status === t.value ? "bg-royal text-white" : "bg-white text-deep/75 ring-1 ring-border hover:text-royal")}
                >
                  {t.label} <span className="tabular opacity-70">{t.n}</span>
                </Link>
              ))}
            </nav>
            <form role="search" className="flex gap-2">
              {status !== "open" ? <input type="hidden" name="status" value={status} /> : null}
              <input name="q" defaultValue={q} placeholder="Booking ID, name or mobile" aria-label="Search bookings" className="h-10 w-full rounded-lg border bg-white px-3 text-sm xl:w-72" />
              <button type="submit" className="h-10 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">Search</button>
            </form>
          </div>
          <Card className="py-0 shadow-card">
            <CardContent className="px-0">
              {rows.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">No bookings here.</p> : null}
              <ul className="divide-y">
                {rows.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/service/${b.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40">
                      <span className="w-28 shrink-0 font-mono text-xs font-semibold text-royal">{b.booking_code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-deep">{b.customer_name} · {b.mobile}</span>
                        <span className="block truncate text-xs text-muted-foreground">{categoryLabel(b.category)} · {b.product_name}</span>
                      </span>
                      <span className="hidden w-28 text-xs text-muted-foreground md:block">{formatDate(new Date(b.preferred_date))}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", b.status === "new" ? "bg-warning-soft text-warning" : b.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-royal-50 text-royal")}>
                        {b.status === "new" && !b.assigned_to ? "Needs technician" : statusLabel(b.status)}
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

export default function ServicePage(props: PageProps<"/admin/service">) {
  return (
    <StaffOnly module="service">
      <ServiceContent {...props} />
    </StaffOnly>
  );
}
