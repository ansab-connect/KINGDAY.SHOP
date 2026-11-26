import type { Metadata } from "next";
import Link from "next/link";
import { BfPage, CsvLink, DataTable, Panel, RangeFilter, range, rupees, when, type SP } from "@/components/best-fit/ui";
import { getPeople, personName } from "@/features/best-fit/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician Payments" };

type L = { id: number; user_id: string; amount_paise: number; payout_method: string | null; payout_reference: string | null; note: string | null; created_at: string; created_by: string | null };

async function Content({ searchParams }: SP) {
  const { from, to } = range(await searchParams);
  const supabase = await createClient();
  const [{ data }, people] = await Promise.all([
    supabase.from("staff_wallet_ledger").select("id, user_id, amount_paise, payout_method, payout_reference, note, created_at, created_by").eq("entry_type", "payout").gte("created_at", from).lte("created_at", `${to}T23:59:59.999`).order("created_at", { ascending: false }),
    getPeople(),
  ]);
  const rows = (data ?? []) as L[];
  return (
    <>
      <RangeFilter from={from} to={to} />
      <Panel title={`Payouts: ${rupees(-rows.reduce((n, r) => n + Number(r.amount_paise), 0))}`} description="Actual money paid to staff from their earnings wallets. Record new payouts in Staff Earnings Wallet." aside={<div className="flex gap-2"><Link href="/admin/best-fit/wallet" className="inline-flex h-10 items-center rounded-lg bg-royal px-4 text-sm font-semibold text-white">Record a payout</Link><CsvLink href={`/admin/export/wallet?from=${from}&to=${to}`} /></div>}>
        <DataTable rows={rows} empty="No payouts in this period." cols={[
          { key: "d", label: "When", render: (r) => when(r.created_at) },
          { key: "u", label: "Paid to", render: (r) => personName(people, r.user_id) },
          { key: "a", label: "Amount", render: (r) => rupees(-r.amount_paise) },
          { key: "m", label: "Method / reference", render: (r) => `${r.payout_method ?? "—"}${r.payout_reference ? ` · ${r.payout_reference}` : ""}` },
          { key: "b", label: "Recorded by", render: (r) => personName(people, r.created_by) },
          { key: "n", label: "Note", render: (r) => r.note ?? "—" },
        ]} />
      </Panel>
    </>
  );
}

export default function Page(props: SP) {
  return <BfPage title="Technician Payments" module="accounts"><Content {...props} /></BfPage>;
}
