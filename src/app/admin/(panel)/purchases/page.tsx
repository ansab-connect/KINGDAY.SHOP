import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ClipboardList, IndianRupee, Plus, Search } from "lucide-react";
import { ClickableRow } from "@/components/admin/clickable-row";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPurchaseBills } from "@/features/purchases/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate, formatPaise } from "@/lib/format";

export const metadata: Metadata = { title: "Purchases" };

const thisMonth = () => new Date().toISOString().slice(0, 7);

async function PurchasesContent({ searchParams }: { searchParams: PageProps<"/admin/purchases">["searchParams"] }) {
  const params = await searchParams;
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : thisMonth();
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const bills = isSupabaseConfigured ? await listPurchaseBills({ month, q }) : [];
  const total = bills.reduce((s, b) => s + b.total_paise, 0);
  const due = bills.reduce((s, b) => s + Math.max(0, b.total_paise - b.paid_paise), 0);

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Supplier bills. Saving a bill adds the stock of every product on it."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/purchases/new"><Plus aria-hidden /> Enter manually</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/purchases/new"><Camera aria-hidden /> Import bill</Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Bills this month" value={String(bills.length)} icon={ClipboardList} />
        <StatCard label="Purchased" value={formatPaise(total)} icon={IndianRupee} tone="gold" />
        <StatCard label="Still to pay" value={formatPaise(due)} icon={IndianRupee} tone={due ? "warning" : "neutral"} />
      </div>

      <form action="/admin/purchases" className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <input type="month" name="month" defaultValue={month} aria-label="Month" className="h-10 rounded-lg border bg-card px-3 text-sm" />
        <div className="relative sm:w-72">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" type="search" defaultValue={q} aria-label="Search purchases" placeholder="Supplier or bill no." className="h-10 w-full rounded-lg border bg-card pr-3 pl-9 text-sm" />
        </div>
        <Button type="submit" variant="outline">Show</Button>
      </form>

      <Card className="py-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="hidden sm:table-cell">Bill no.</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.length ? (
                bills.map((b) => (
                  <ClickableRow key={b.id} href={`/admin/purchases/${b.id}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(new Date(b.bill_date))}</TableCell>
                    <TableCell>
                      <span className="font-medium text-deep">{b.supplier_name}</span>
                      <span className="block text-xs text-muted-foreground">{b.bill_number}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{b.supplier_bill_no ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.item_count}</TableCell>
                    <TableCell className="text-right font-semibold tabular">{formatPaise(b.total_paise)}</TableCell>
                    <TableCell className="hidden text-right tabular sm:table-cell">{b.total_paise > b.paid_paise ? formatPaise(b.total_paise - b.paid_paise) : "—"}</TableCell>
                  </ClickableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No purchases in this month. Press <strong>Import bill</strong> and take a photo of a supplier bill.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function PurchasesPage(props: PageProps<"/admin/purchases">) {
  return (
    <StaffOnly module="purchases">
      <PurchasesContent searchParams={props.searchParams} />
    </StaffOnly>
  );
}
