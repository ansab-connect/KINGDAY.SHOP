import type { Metadata } from "next";
import Link from "next/link";
import { OpButton } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, Status, Tabs, label, param, rupees, when, type SP } from "@/components/best-fit/ui";
import { getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician Invoice Management" };

type TI = { id: string; invoice_number: string; user_id: string; booking_id: string; service_invoice_id: string; inspection_paise: number; service_paise: number; parts_paise: number; travel_paise: number; total_paise: number; status: string; claim_reference: string | null; claimed_at: string | null; created_at: string; service_bookings: { booking_code: string } | null; work_orders: { work_order_number: string } | null };
type Alloc = { section: string; beneficiary: string; user_id: string | null; base_paise: number; percent: number; amount_paise: number; rule_snapshot: { technician_id?: string | null; reason?: string } };

type Travel = { slab_name: string; mode: string; distance_km: number; amount_paise: number | null };

async function Preview({ invoiceId }: { invoiceId: string }) {
  const supabase = await createClient();
  const [{ data: inv }, { data: active }, people] = await Promise.all([
    supabase.from("service_invoices").select("id, invoice_number, booking_id, approval_status, grand_total, service_bookings(booking_code)").eq("id", invoiceId).maybeSingle(),
    supabase.from("commission_allocations").select("section, beneficiary, user_id, base_paise, percent, amount_paise, rule_snapshot").eq("service_invoice_id", invoiceId).eq("status", "active"),
    getPeople(),
  ]);
  const i = inv as unknown as { id: string; invoice_number: string; booking_id: string; approval_status: string; grand_total: number; service_bookings: { booking_code: string } | null } | null;
  if (!i) return <Panel><p className="text-sm text-danger">Invoice not found.</p></Panel>;
  const finalised = (active ?? []) as Alloc[];
  let allocations: Alloc[] = finalised;
  let travel = null as Travel | null;
  let problem: string | null = null;
  if (!finalised.length) {
    const { data, error } = await supabase.rpc("preview_service_earnings", { p_invoice: invoiceId });
    if (error) problem = error.message;
    else {
      allocations = (data as { allocations: Alloc[] }).allocations;
      travel = (data as { travel: Travel | null }).travel;
    }
  }
  const who = (a: Alloc) => (a.beneficiary === "company" ? "Company" : personName(people, a.user_id));
  return (
    <Panel title={`${finalised.length ? "Finalised" : "Preview"}: ${i.invoice_number}`} description={`Booking ${i.service_bookings?.booking_code} · invoice total ${rupees(i.grand_total)} (tax is never part of a commission base)`}
      aside={<Link href={`/admin/service/${i.booking_id}`} className="text-sm font-semibold text-royal">Open booking</Link>}>
      {i.approval_status !== "approved" ? <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Approve the customer invoice first (booking page → Invoice).</p> : null}
      {problem ? <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{problem}</p> : null}
      <DataTable rows={allocations.map((a, n) => ({ ...a, id: n }))} empty="No amounts to split." cols={[
        { key: "s", label: "Section", render: (a) => label(a.section) },
        { key: "b", label: "Base", render: (a) => rupees(a.base_paise) },
        { key: "w", label: "Beneficiary", render: (a) => <>{who(a)}{a.rule_snapshot?.reason ? <p className="text-xs text-muted-foreground">{a.rule_snapshot.reason}</p> : a.rule_snapshot?.technician_id ? <p className="text-xs text-muted-foreground">Individual rule</p> : <p className="text-xs text-muted-foreground">Default rule</p>}</> },
        { key: "p", label: "%", render: (a) => `${a.percent}%` },
        { key: "a", label: "Amount", render: (a) => <b>{rupees(a.amount_paise)}</b> },
      ]} />
      {travel ? <p className="mt-3 text-sm text-deep">Technician travel ({travel.slab_name}, {travel.distance_km} km): {travel.mode === "custom" ? "custom amount — enter it when finalising" : rupees(travel.amount_paise)}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {!finalised.length && !problem && i.approval_status === "approved" ? (
          travel?.mode === "custom"
            ? <OpButton op="earnings.finalize" values={{ invoice_id: i.id }} label="Finalise & assign earnings" ask="Approved travel amount (₹)" askType="money" askKey="custom_travel_paise" />
            : <OpButton op="earnings.finalize" values={{ invoice_id: i.id }} label="Finalise & assign earnings" confirmText="Create the earnings invoices for each beneficiary? The customer invoice will be locked." />
        ) : null}
        {finalised.length ? <OpButton op="earnings.reverse" values={{ invoice_id: i.id }} label="Reverse earnings" tone="danger" ask="Reason for reversal" /> : null}
      </div>
    </Panel>
  );
}

async function Content({ searchParams }: SP) {
  const sp = await searchParams;
  const invoiceId = /^[0-9a-f-]{36}$/.test(param(sp, "invoice")) ? param(sp, "invoice") : "";
  const tab = param(sp, "tab") || "pending";
  const supabase = await createClient();
  const [{ data: tis }, { data: approved }, { data: alloc }, people] = await Promise.all([
    supabase.from("technician_invoices").select("*, service_bookings(booking_code), work_orders(work_order_number)").order("created_at", { ascending: false }).limit(300),
    supabase.from("service_invoices").select("id, invoice_number, booking_id, grand_total, approved_at, service_bookings(booking_code, customer_name)").eq("approval_status", "approved").order("approved_at", { ascending: false }).limit(200),
    supabase.from("commission_allocations").select("service_invoice_id").eq("status", "active"),
    getPeople(),
  ]);
  const done = new Set(((alloc ?? []) as { service_invoice_id: string }[]).map((a) => a.service_invoice_id));
  const waiting = ((approved ?? []) as unknown as { id: string; invoice_number: string; booking_id: string; grand_total: number; approved_at: string | null; service_bookings: { booking_code: string; customer_name: string } | null }[]).filter((i) => !done.has(i.id));
  const rows = ((tis ?? []) as unknown as TI[]).filter((t) => (tab === "pending" ? t.status === "pending_claim" : tab === "claimed" ? t.status === "claimed" : t.status === "reversed"));
  return (
    <>
      {invoiceId ? <Preview invoiceId={invoiceId} /> : null}
      <Panel title={`Approved invoices waiting for earnings (${waiting.length})`} description="Workflow: technician completes the job and submits the invoice → admin approves it → finalise here → beneficiaries claim → their Staff Earnings Wallet is credited.">
        <DataTable rows={waiting} empty="Nothing waiting." cols={[
          { key: "n", label: "Invoice", render: (i) => <span className="font-mono">{i.invoice_number}</span> },
          { key: "b", label: "Booking", render: (i) => <>{i.service_bookings?.booking_code}<p className="text-xs text-muted-foreground">{i.service_bookings?.customer_name}</p></> },
          { key: "t", label: "Total", render: (i) => rupees(i.grand_total) },
          { key: "a", label: "Approved", render: (i) => when(i.approved_at) },
          { key: "p", label: "", render: (i) => <Link href={`?invoice=${i.id}`} className="text-sm font-semibold text-royal">Preview & finalise</Link> },
        ]} />
      </Panel>
      <Tabs current={tab} tabs={[{ key: "pending", label: "Pending claim", href: "?tab=pending" }, { key: "claimed", label: "Claimed", href: "?tab=claimed" }, { key: "reversed", label: "Reversed", href: "?tab=reversed" }]} />
      <Panel title="Technician earnings invoices">
        <DataTable rows={rows} cols={[
          { key: "n", label: "Invoice", render: (t) => <><p className="font-mono font-semibold">{t.invoice_number}</p><p className="text-xs text-muted-foreground">{when(t.created_at)}</p></> },
          { key: "u", label: "Beneficiary", render: (t) => personName(people, t.user_id) },
          { key: "r", label: "Booking / WO", render: (t) => <><Link href={`?invoice=${t.service_invoice_id}`} className="font-mono text-xs text-royal">{t.service_bookings?.booking_code}</Link><p className="text-xs text-muted-foreground">{t.work_orders?.work_order_number ?? "—"}</p></> },
          { key: "s", label: "Inspection / service / parts / travel", render: (t) => `${rupees(t.inspection_paise)} / ${rupees(t.service_paise)} / ${rupees(t.parts_paise)} / ${rupees(t.travel_paise)}` },
          { key: "t", label: "Eligible", render: (t) => <b>{rupees(t.total_paise)}</b> },
          { key: "st", label: "Claim", render: (t) => <><Status s={t.status} />{t.claim_reference ? <p className="text-xs text-muted-foreground">{t.claim_reference}</p> : null}</> },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Technician Invoice Management" module="accounts"><Content {...props} /></BfPage>;
}
