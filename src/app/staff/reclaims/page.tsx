import type { Metadata } from "next";
import { ReclaimForm } from "@/components/best-fit/reclaim-form";
import { DataTable, Status, day, label, rupees } from "@/components/best-fit/ui";
import { L } from "@/components/i18n/lang";
import { requireTeam } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reclaims" };

type R = { id: string; reclaim_number: string; category: string; expense_date: string; amount_paise: number; approved_paise: number | null; description: string; status: string; review_note: string | null; service_bookings: { booking_code: string } | null };

export default async function ReclaimsPage() {
  const user = await requireTeam();
  const supabase = await createClient();
  const [{ data }, { data: wos }] = await Promise.all([
    supabase.from("service_reclaims").select("id, reclaim_number, category, expense_date, amount_paise, approved_paise, description, status, review_note, service_bookings(booking_code)").eq("claimant_id", user.id).order("created_at", { ascending: false }),
    supabase.from("work_orders").select("booking_id, work_order_number, service_bookings(booking_code)").eq("technician_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const bookings = ((wos ?? []) as unknown as { booking_id: string; work_order_number: string; service_bookings: { booking_code: string } | null }[]).map((w) => ({ value: w.booking_id, label: `${w.service_bookings?.booking_code} · ${w.work_order_number}` }));
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-deep"><L en="Expense reclaims" ml="ചെലവ് ക്ലെയിമുകൾ" /></h1>
      <ReclaimForm userId={user.id} bookings={bookings} />
      <DataTable rows={(data ?? []) as unknown as R[]} empty="No reclaims yet." cols={[
        { key: "n", label: "Reclaim", render: (r) => <><p className="font-mono font-semibold">{r.reclaim_number}</p><p className="text-xs text-muted-foreground">{day(r.expense_date)}</p></> },
        { key: "c", label: "What", render: (r) => <>{label(r.category)}<p className="text-xs text-muted-foreground">{r.description}{r.service_bookings ? ` · ${r.service_bookings.booking_code}` : ""}</p></> },
        { key: "a", label: "Amount", render: (r) => <>{rupees(r.amount_paise)}{r.approved_paise != null && r.approved_paise !== r.amount_paise ? <p className="text-xs">Approved {rupees(r.approved_paise)}</p> : null}</> },
        { key: "s", label: "Status", render: (r) => <><Status s={r.status} />{r.review_note ? <p className="text-xs text-muted-foreground">{r.review_note}</p> : null}</> },
      ]} />
    </div>
  );
}
