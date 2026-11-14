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
import { getMyBookings } from "@/features/service/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My service bookings", robots: { index: false } };

async function Bookings() {
  await requireUser("/account/service");
  const bookings = await getMyBookings();
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
                  <p className="text-xs text-muted-foreground">{categoryLabel(b.category)} · Booked {formatDate(new Date(b.created_at))} · Preferred {formatDate(new Date(b.preferred_date))}</p>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", b.status === "cancelled" ? "bg-muted text-muted-foreground" : b.status === "completed" || b.status === "invoiced" ? "bg-success-soft text-success" : "bg-royal-50 text-royal")}>
                  {statusLabel(b.status)}
                </span>
              </div>
              {b.complaint ? <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{b.complaint}</p> : null}
              {b.status === "new" || b.status === "assigned" ? <CancelBookingButton id={b.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}

export default function MyServicePage() {
  return (
    <Suspense fallback={<Container className="py-10"><Skeleton className="h-64 rounded-2xl" /></Container>}>
      <Bookings />
    </Suspense>
  );
}
