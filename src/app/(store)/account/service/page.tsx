import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { AccountShell } from "@/components/store/account/account-shell";
import { CancelBookingButton } from "@/components/store/service/cancel-booking";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/features/auth/session";
import { categoryLabel, statusLabel } from "@/features/service/constants";
import { preferredDateText } from "@/features/service/constants";
import { getMyBookings } from "@/features/service/queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My service bookings", robots: { index: false } };

async function Bookings() {
  await requireUser("/account/service");
  const bookings = await getMyBookings();
  const supabase = await createClient();
  const { data: invRows } = bookings.length
    ? await supabase.from("service_invoices").select("id, booking_id, invoice_number").in("booking_id", bookings.map((b) => b.id))
    : { data: [] };
  const { data: eventRows } = bookings.length
    ? await supabase.from("service_job_events").select("booking_id, status, note, created_at").in("booking_id", bookings.map((b) => b.id)).order("created_at")
    : { data: [] };
  const eventsByBooking = new Map<string, { status: string; note: string | null; created_at: string }[]>();
  for (const e of (eventRows ?? []) as { booking_id: string; status: string; note: string | null; created_at: string }[]) {
    eventsByBooking.set(e.booking_id, [...(eventsByBooking.get(e.booking_id) ?? []), e]);
  }
  const invoices = new Map(((invRows ?? []) as { id: string; booking_id: string; invoice_number: string }[]).map((i) => [i.booking_id, i]));
  return (
    <AccountShell active="/account/service" title="Service bookings">
      <div className="mb-5">
        <Link href="/book-service" className="inline-flex h-11 items-center gap-2 rounded-full bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800">
          <Wrench aria-hidden className="size-4" /> <L en="Book a new service" ml="പുതിയ സർവീസ് ബുക്ക് ചെയ്യുക" />
        </Link>
      </div>
      {bookings.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          <L en="No service bookings yet." ml="ഇതുവരെ ബുക്കിംഗുകൾ ഇല്ല." />
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.map((b) => (
            <li key={b.id} className="rounded-2xl border bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold text-royal">{b.booking_code}</p>
                  <p className="mt-1 font-semibold text-deep">{b.product_name}</p>
                  <p className="text-xs text-muted-foreground">{categoryLabel(b.category)} · Booked {formatDate(new Date(b.created_at))} · Preferred {preferredDateText(b.preferred_date)}</p>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", b.status === "cancelled" ? "bg-muted text-muted-foreground" : ["completed", "invoiced", "ready_for_delivery"].includes(b.status) ? "bg-success-soft text-success" : "bg-royal-50 text-royal")}>
                  {statusLabel(b.status)}
                </span>
              </div>
              {b.complaint ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{b.complaint}</p> : null}
              {b.status !== "cancelled" ? <ServiceProgress status={b.status} /> : null}
              {eventsByBooking.get(b.id)?.length ? (
                <details className="mt-3 rounded-xl bg-muted/40 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-royal">
                    <L en="Service timeline" ml="സർവീസ് ടൈംലൈൻ" />
                  </summary>
                  <ol className="mt-3 flex flex-col gap-3 border-l-2 border-royal-200 pl-4">
                    {eventsByBooking.get(b.id)!.map((e, i) => (
                      <li key={i} className="relative text-sm">
                        <span aria-hidden className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-royal" />
                        <span className="block font-semibold text-deep">{statusLabel(e.status)}</span>
                        <span className="block text-xs text-muted-foreground">{formatDateTime(new Date(e.created_at))}</span>
                        {e.note ? <span className="block text-sm break-words text-muted-foreground">{e.note}</span> : null}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
              {invoices.get(b.id) ? (
                <Link href={`/service-invoice/${invoices.get(b.id)!.id}`} className="mt-3 inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold text-royal hover:bg-royal-50">
                  <L en={`View invoice ${invoices.get(b.id)!.invoice_number}`} ml="ബിൽ കാണുക" />
                </Link>
              ) : null}
              {b.status === "new" || b.status === "assigned" ? <CancelBookingButton id={b.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}

/** Inspection-first progress: received → inspection → service → completed → ready for delivery. */
const STEPS = [
  { en: "Received", ml: "ലഭിച്ചു", at: ["new", "assigned", "accepted", "on_the_way", "reached"] },
  { en: "Inspection", ml: "പരിശോധന", at: ["inspection_started", "inspection_completed"] },
  { en: "In service", ml: "സർവീസ്", at: ["started"] },
  { en: "Completed", ml: "പൂർത്തിയായി", at: ["completed", "invoiced"] },
  { en: "Ready", ml: "തയ്യാർ", at: ["ready_for_delivery"] },
];
function ServiceProgress({ status }: { status: string }) {
  const current = Math.max(0, STEPS.findIndex((s) => s.at.includes(status)));
  return (
    <ol aria-label="Service progress" className="mt-4 grid grid-cols-5 gap-1">
      {STEPS.map((s, i) => (
        <li key={s.en} className="flex flex-col items-center gap-1 text-center">
          <span className={cn("h-1.5 w-full rounded-full", i <= current ? "bg-royal" : "bg-muted")} />
          <span className={cn("text-[0.65rem] leading-tight font-semibold sm:text-xs", i <= current ? "text-royal" : "text-muted-foreground")}>
            <L en={s.en} ml={s.ml} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function MyServicePage() {
  return (
    <Suspense fallback={<Container className="py-10"><Skeleton className="h-64 rounded-2xl" /></Container>}>
      <Bookings />
    </Suspense>
  );
}
