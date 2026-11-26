import type { Metadata } from "next";
import { OpButton } from "@/components/best-fit/op-form";
import { DataTable, Stats, Status, label, rupees, when } from "@/components/best-fit/ui";
import { L } from "@/components/i18n/lang";
import { requireTeam } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My earnings" };

type TI = { id: string; invoice_number: string; inspection_paise: number; service_paise: number; parts_paise: number; travel_paise: number; total_paise: number; status: string; claim_reference: string | null; created_at: string; service_bookings: { booking_code: string } | null; work_orders: { work_order_number: string } | null };
type Led = { id: number; entry_type: string; amount_paise: number; claim_reference: string | null; payout_method: string | null; payout_reference: string | null; note: string | null; created_at: string };
type W = { total_earnings: number; pending_claims: number; claimed: number; paid: number; available: number; outstanding_payable: number };

/** Own earnings only. The database returns only this person's rows — never the company share or others' commissions. */
export default async function EarningsPage() {
  await requireTeam();
  const supabase = await createClient();
  const [{ data: tis }, { data: led }, { data: w }] = await Promise.all([
    supabase.from("technician_invoices").select("id, invoice_number, inspection_paise, service_paise, parts_paise, travel_paise, total_paise, status, claim_reference, created_at, service_bookings(booking_code), work_orders(work_order_number)").order("created_at", { ascending: false }),
    supabase.from("staff_wallet_ledger").select("id, entry_type, amount_paise, claim_reference, payout_method, payout_reference, note, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.rpc("wallet_summary"),
  ]);
  const invoices = (tis ?? []) as unknown as TI[];
  const s = (w ?? {}) as W;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-deep"><L en="My earnings" ml="എന്റെ വരുമാനം" /></h1>
      <Stats items={[
        { label: "Total earnings", value: rupees(s.total_earnings ?? 0) },
        { label: "Pending claims", value: rupees(s.pending_claims ?? 0) },
        { label: "Available (claimed − paid)", value: rupees(s.available ?? 0) },
        { label: "Paid to you", value: rupees(s.paid ?? 0) },
      ]} />
      <p className="text-sm text-muted-foreground"><L en="Claiming adds the amount to your earnings wallet. The office pays it out separately and records the payment here." ml="ക്ലെയിം ചെയ്താൽ തുക നിങ്ങളുടെ വാലറ്റിൽ ചേരും. പണം ഓഫീസ് പ്രത്യേകം നൽകും." /></p>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-deep"><L en="Earnings invoices" ml="വരുമാന ഇൻവോയ്സുകൾ" /></h2>
        <DataTable rows={invoices} empty="No earnings yet. They appear here after the office approves a completed job." cols={[
          { key: "n", label: "Invoice", render: (t) => <><p className="font-mono font-semibold">{t.invoice_number}</p><p className="text-xs text-muted-foreground">{t.service_bookings?.booking_code} · {t.work_orders?.work_order_number ?? ""}</p></> },
          { key: "b", label: "Inspection / service / parts / travel", render: (t) => `${rupees(t.inspection_paise)} / ${rupees(t.service_paise)} / ${rupees(t.parts_paise)} / ${rupees(t.travel_paise)}` },
          { key: "t", label: "Your amount", render: (t) => <b>{rupees(t.total_paise)}</b> },
          { key: "s", label: "Status", render: (t) => <><Status s={t.status} />{t.claim_reference ? <p className="text-xs text-muted-foreground">{t.claim_reference}</p> : null}</> },
          { key: "c", label: "", render: (t) => (t.status === "pending_claim" ? <OpButton op="claim" values={{ id: t.id }} label="Claim" tone="gold" confirmText={`Claim ${rupees(t.total_paise)}?`} /> : null) },
        ]} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-deep"><L en="Wallet history" ml="വാലറ്റ് ചരിത്രം" /></h2>
        <DataTable rows={(led ?? []) as Led[]} empty="No transactions yet." cols={[
          { key: "d", label: "When", render: (l) => when(l.created_at) },
          { key: "t", label: "Type", render: (l) => label(l.entry_type) },
          { key: "a", label: "Amount", render: (l) => <span className={l.amount_paise < 0 ? "text-danger" : "text-success"}>{rupees(l.amount_paise)}</span> },
          { key: "r", label: "Reference", render: (l) => <span className="text-xs">{[l.claim_reference, l.payout_method, l.payout_reference, l.note].filter(Boolean).join(" · ")}</span> },
        ]} />
      </section>
    </div>
  );
}
