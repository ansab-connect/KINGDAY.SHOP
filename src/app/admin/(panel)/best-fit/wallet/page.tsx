import type { Metadata } from "next";
import { OpForm } from "@/components/best-fit/op-form";
import { BfPage, DataTable, Panel, label, param, rupees, when, type SP } from "@/components/best-fit/ui";
import { can, getCurrentUser } from "@/features/auth/session";
import { getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Staff Earnings Wallet" };

type L = { id: number; user_id: string; entry_type: string; amount_paise: number; claim_reference: string | null; payout_method: string | null; payout_reference: string | null; note: string | null; created_at: string; technician_invoice_id: string | null; booking_id: string | null; work_order_id: string | null; customer_id: string | null };
type TI = { user_id: string; total_paise: number; status: string };
type RC = { claimant_id: string; approved_paise: number | null; status: string };

async function Content({ searchParams }: SP) {
  const focus = param(await searchParams, "user");
  const me = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: led }, { data: tis }, { data: rcs }, people] = await Promise.all([
    supabase.from("staff_wallet_ledger").select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from("technician_invoices").select("user_id, total_paise, status"),
    supabase.from("service_reclaims").select("claimant_id, approved_paise, status").in("status", ["approved", "partially_approved"]),
    getPeople(),
  ]);
  const ledger = (led ?? []) as L[];
  const ti = (tis ?? []) as TI[];
  const users = [...new Set([...ledger.map((l) => l.user_id), ...ti.map((t) => t.user_id)])];
  const sum = (xs: number[]) => xs.reduce((n, x) => n + Number(x), 0);
  const rows = users.map((u) => {
    const mine = ledger.filter((l) => l.user_id === u);
    const available = sum(mine.map((l) => l.amount_paise));
    const reclaims = sum(((rcs ?? []) as RC[]).filter((r) => r.claimant_id === u).map((r) => r.approved_paise ?? 0));
    return {
      id: u,
      total: sum(ti.filter((t) => t.user_id === u && t.status !== "reversed").map((t) => t.total_paise)),
      pending: sum(ti.filter((t) => t.user_id === u && t.status === "pending_claim").map((t) => t.total_paise)),
      claimed: sum(mine.filter((l) => l.entry_type === "claim_credit").map((l) => l.amount_paise)),
      paid: -sum(mine.filter((l) => l.entry_type === "payout").map((l) => l.amount_paise)),
      available,
      outstanding: available + reclaims,
    };
  });
  const canPay = can(me, "accounts", "create");
  const history = focus ? ledger.filter((l) => l.user_id === focus) : ledger.slice(0, 100);
  return (
    <>
      <Panel title="Wallets" description="A claim is an internal earnings credit, not a bank transfer. Record the actual payout here once the money is paid. Outstanding payable = available earnings + approved unpaid reclaims.">
        <DataTable rows={rows} empty="No earnings yet." cols={[
          { key: "u", label: "Staff", render: (r) => <a href={`?user=${r.id}`} className="font-semibold text-royal">{personName(people, r.id)}</a> },
          { key: "t", label: "Total earnings", render: (r) => rupees(r.total) },
          { key: "p", label: "Pending claims", render: (r) => rupees(r.pending) },
          { key: "c", label: "Claimed", render: (r) => rupees(r.claimed) },
          { key: "pd", label: "Paid", render: (r) => rupees(r.paid) },
          { key: "a", label: "Available", render: (r) => <b className={r.available < 0 ? "text-danger" : ""}>{rupees(r.available)}</b> },
          { key: "o", label: "Outstanding payable", render: (r) => rupees(r.outstanding) },
          { key: "x", label: "", render: (r) => (canPay && r.available > 0 ? (
            <details><summary className="cursor-pointer text-sm font-semibold text-royal">Record payout</summary>
              <div className="mt-2 w-[min(80vw,520px)]"><OpForm op="payout" hidden={{ user_id: r.id }} initial={{ amount_paise: r.available }} columns={2} submitLabel="Record payout"
                fields={[{ name: "amount_paise", label: "Amount paid (₹)", type: "money", required: true }, { name: "method", label: "Method", type: "select", required: true, options: [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "bank_transfer", label: "Bank transfer" }, { value: "other", label: "Other" }] }, { name: "reference", label: "Transaction reference" }, { name: "note", label: "Note" }]} /></div>
            </details>
          ) : null) },
        ]} />
      </Panel>
      <Panel title={focus ? `Transactions · ${personName(people, focus)}` : "Latest transactions"}>
        <DataTable rows={history} cols={[
          { key: "d", label: "When", render: (l) => when(l.created_at) },
          { key: "u", label: "Staff", render: (l) => personName(people, l.user_id) },
          { key: "t", label: "Type", render: (l) => label(l.entry_type) },
          { key: "a", label: "Amount", render: (l) => <span className={l.amount_paise < 0 ? "text-danger" : "text-success"}>{rupees(l.amount_paise)}</span> },
          { key: "r", label: "References", render: (l) => <span className="text-xs">{[l.claim_reference, l.payout_reference, l.payout_method, l.note].filter(Boolean).join(" · ") || "—"}</span> },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Staff Earnings Wallet" module="accounts"><Content {...props} /></BfPage>;
}
