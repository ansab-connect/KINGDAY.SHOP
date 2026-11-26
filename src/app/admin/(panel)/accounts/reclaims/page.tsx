import type { Metadata } from "next";
import Link from "next/link";
import { OpButton } from "@/components/best-fit/op-form";
import { BfPage, CsvLink, DataTable, Panel, Status, Tabs, day, label, param, rupees, type SP } from "@/components/best-fit/ui";
import { getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reclaim Invoices" };

type R = { id: string; reclaim_number: string; claimant_id: string; category: string; expense_date: string; amount_paise: number; approved_paise: number | null; description: string; booking_id: string | null; receipt_path: string | null; status: string; review_note: string | null; payment_reference: string | null; service_bookings: { booking_code: string } | null; work_orders: { work_order_number: string } | null };
const TABS = [
  { key: "review", label: "To review", statuses: ["submitted", "under_review"] },
  { key: "pay", label: "Approved — to pay", statuses: ["approved", "partially_approved"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
];

async function Content({ searchParams }: SP) {
  const want = param(await searchParams, "tab");
  const tab = TABS.find((t) => t.key === want) ?? TABS[0];
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([
    supabase.from("service_reclaims").select("*, service_bookings(booking_code), work_orders(work_order_number)").in("status", tab.statuses).order("created_at", { ascending: false }).limit(500),
    getPeople(),
  ]);
  const rows = (data ?? []) as unknown as R[];
  const receipts = new Map<string, string>();
  await Promise.all(rows.filter((r) => r.receipt_path).map(async (r) => {
    const u = (await supabase.storage.from("business-docs").createSignedUrl(r.receipt_path!, 1800)).data?.signedUrl;
    if (u) receipts.set(r.id, u);
  }));
  return (
    <>
      <Tabs current={tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `?tab=${t.key}` }))} />
      <Panel title={`${rows.length} reclaims`} description="Travel, fuel, parking, tolls, spare parts and other costs paid by staff. Only approved amounts become payable; each reclaim can be paid once and the same expense can't be claimed twice." aside={<CsvLink href="/admin/export/reclaims" />}>
        <DataTable rows={rows} cols={[
          { key: "n", label: "Reclaim", render: (r) => <><p className="font-mono font-semibold">{r.reclaim_number}</p><p className="text-xs text-muted-foreground">{day(r.expense_date)}</p></> },
          { key: "c", label: "Claimant", render: (r) => personName(people, r.claimant_id) },
          { key: "d", label: "What", render: (r) => <>{label(r.category)}<p className="text-xs text-muted-foreground">{r.description}</p>{r.booking_id ? <Link href={`/admin/service/${r.booking_id}`} className="font-mono text-xs text-royal">{r.service_bookings?.booking_code}{r.work_orders ? ` · ${r.work_orders.work_order_number}` : ""}</Link> : null}</> },
          { key: "a", label: "Amount", render: (r) => <>{rupees(r.amount_paise)}{r.approved_paise != null && r.approved_paise !== r.amount_paise ? <p className="text-xs text-gold-700">Approved {rupees(r.approved_paise)}</p> : null}</> },
          { key: "rc", label: "Receipt", render: (r) => (receipts.get(r.id) ? <a href={receipts.get(r.id)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-royal">View</a> : "—") },
          { key: "s", label: "Status", render: (r) => <><Status s={r.status} />{r.review_note ? <p className="text-xs text-muted-foreground">{r.review_note}</p> : null}</> },
          { key: "x", label: "", render: (r) => (
            <div className="flex flex-col gap-1">
              {["submitted", "under_review"].includes(r.status) ? (
                <>
                  {r.status === "submitted" ? <OpButton op="reclaim.review" values={{ id: r.id, decision: "under_review" }} label="Mark under review" tone="neutral" /> : null}
                  <OpButton op="reclaim.review" values={{ id: r.id, decision: "approved" }} label="Approve in full" confirmText={`Approve ${rupees(r.amount_paise)}?`} />
                  <OpButton op="reclaim.review" values={{ id: r.id, decision: "partially_approved" }} label="Approve part" tone="gold" ask="Approved amount (₹)" askType="money" askKey="amount_paise" />
                  <OpButton op="reclaim.review" values={{ id: r.id, decision: "rejected" }} label="Reject" tone="danger" ask="Reason" askKey="note" />
                </>
              ) : null}
              {["approved", "partially_approved"].includes(r.status) ? (
                <>
                  <OpButton op="reclaim.pay" values={{ id: r.id, method: "upi" }} label="Paid by UPI" ask="UPI reference" askKey="reference" />
                  <OpButton op="reclaim.pay" values={{ id: r.id, method: "cash" }} label="Paid in cash" tone="neutral" confirmText="Mark as paid in cash?" />
                  <OpButton op="reclaim.pay" values={{ id: r.id, method: "bank_transfer" }} label="Paid by bank" tone="neutral" ask="Bank reference" askKey="reference" />
                </>
              ) : null}
              {r.payment_reference ? <span className="text-xs text-muted-foreground">Ref {r.payment_reference}</span> : null}
            </div>
          ) },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Reclaim Invoices" module="accounts"><Content {...props} /></BfPage>;
}
