import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, ChevronRight, MapPin } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { AutoRefresh } from "@/components/auto-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/features/auth/session";
import { SERVICE_STATUSES, categoryLabel } from "@/features/service/constants";
import type { BookingRow } from "@/features/service/queries";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My jobs" };

const GROUPS = [
  { key: "today", en: "Today", ml: "ഇന്ന്" },
  { key: "pending", en: "Pending", ml: "തീരുമാനിക്കാൻ" },
  { key: "progress", en: "In progress", ml: "നടക്കുന്നു" },
  { key: "completed", en: "Completed", ml: "പൂർത്തിയായി" },
  { key: "cancelled", en: "Cancelled", ml: "റദ്ദാക്കി" },
] as const;
type Group = (typeof GROUPS)[number]["key"];

const inGroup = (b: BookingRow, g: Group, today: string) =>
  g === "today"
    ? b.preferred_date === today && !["completed", "invoiced", "cancelled"].includes(b.status)
    : g === "pending"
      ? b.status === "assigned"
      : g === "progress"
        ? ["accepted", "on_the_way", "reached", "started"].includes(b.status)
        : g === "completed"
          ? ["completed", "invoiced"].includes(b.status)
          : b.status === "cancelled";

async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireTeam();
  const sp = await searchParams;
  const chosen = GROUPS.find((g) => g.key === sp.tab)?.key as Group | undefined;
  const supabase = await createClient();
  const { data } = await supabase.from("service_bookings").select("*").eq("assigned_to", user.id).order("preferred_date").limit(300);
  const jobs = (data ?? []) as BookingRow[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  // New jobs to accept come first, whatever their date; otherwise today's jobs.
  const tab: Group = chosen ?? (jobs.some((b) => b.status === "assigned") ? "pending" : "today");
  const shown = jobs.filter((b) => inGroup(b, tab, today));

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={20} />
      <h1 className="text-2xl font-bold text-deep"><L en="My jobs" ml="എന്റെ ജോലികൾ" /></h1>
      <nav aria-label="Job groups" className="grid grid-cols-5 gap-1.5">
        {GROUPS.map((g) => {
          const n = jobs.filter((b) => inGroup(b, g.key, today)).length;
          return (
            <Link
              key={g.key}
              href={`/staff/jobs?tab=${g.key}`}
              aria-current={tab === g.key ? "page" : undefined}
              className={cn("flex flex-col items-center rounded-xl border px-1 py-2.5 text-center", tab === g.key ? "border-royal bg-royal text-white" : "bg-white text-deep")}
            >
              <span className="font-heading text-xl font-bold tabular">{n}</span>
              <span className="text-[0.68rem] leading-tight font-semibold"><L en={g.en} ml={g.ml} /></span>
            </Link>
          );
        })}
      </nav>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-white px-6 py-12 text-center text-sm text-muted-foreground">
          <L en="No jobs here." ml="ഇവിടെ ജോലികൾ ഇല്ല." />
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((b) => (
            <li key={b.id}>
              <Link href={`/staff/jobs/${b.id}`} className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-card hover:shadow-lift">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-royal">{b.booking_code}</span>
                    <span className="rounded-full bg-royal-50 px-2 py-0.5 text-[0.68rem] font-semibold text-royal">{SERVICE_STATUSES.find((s) => s.value === b.status)?.label}</span>
                  </span>
                  <span className="mt-1 block truncate font-semibold text-deep">{b.customer_name} · {categoryLabel(b.category)}</span>
                  <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin aria-hidden className="size-3.5 shrink-0" /> {b.address}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock aria-hidden className="size-3.5" /> {formatDate(new Date(b.preferred_date))}</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MyJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<div className="flex flex-col gap-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}>
      <Jobs searchParams={searchParams} />
    </Suspense>
  );
}
