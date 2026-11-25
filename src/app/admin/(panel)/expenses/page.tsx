import type { Metadata } from "next";
import { CalendarDays, IndianRupee, Receipt } from "lucide-react";
import { DeleteExpenseButton, ExpenseForm } from "@/components/admin/expenses/expense-form";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StaffOnly } from "@/components/admin/staff-only";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDate, formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Expenses" };

type Expense = { id: string; expense_date: string; category: string; amount_paise: number; payment_mode: string; paid_to: string | null; note: string | null; receipt_path: string | null };
const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank", card: "Card", other: "Other" };

async function ExpensesContent({ searchParams }: { searchParams: PageProps<"/admin/expenses">["searchParams"] }) {
  const params = await searchParams;
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const me = await getCurrentUser();

  let rows: Expense[] = [];
  let receipts = new Map<string, string>();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("expenses")
      .select("id, expense_date, category, amount_paise, payment_mode, paid_to, note, receipt_path")
      .gte("expense_date", `${month}-01`)
      .lt("expense_date", end)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    rows = ((data ?? []) as Expense[]).map((e) => ({ ...e, amount_paise: Number(e.amount_paise) }));
    const paths = rows.map((r) => r.receipt_path).filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("business-docs").createSignedUrls(paths, 60 * 30);
      receipts = new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string]));
    }
  }
  const total = rows.reduce((s, r) => s + r.amount_paise, 0);
  const byCategory = [...rows.reduce((map, r) => map.set(r.category, (map.get(r.category) ?? 0) + r.amount_paise), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Expenses" description="Shop running costs: rent, electricity, transport and more. Totals by month and category." />
      {!isSupabaseConfigured ? <PreviewNotice /> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Spent this month" value={formatPaise(total)} icon={IndianRupee} tone="gold" />
        <StatCard label="Entries" value={String(rows.length)} icon={Receipt} />
        <StatCard label="Biggest" value={byCategory[0] ? `${byCategory[0][0]}` : "—"} hint={byCategory[0] ? formatPaise(byCategory[0][1]) : undefined} icon={CalendarDays} tone="neutral" />
      </div>

      {can(me, "expenses", "create") ? (
        <div className="mb-6">
          <ExpenseForm categories={byCategory.map(([c]) => c)} />
        </div>
      ) : null}

      <form action="/admin/expenses" className="mb-4 flex gap-2">
        <input type="month" name="month" defaultValue={month} aria-label="Month" className="h-10 rounded-lg border bg-card px-3 text-sm" />
        <Button type="submit" variant="outline">Show</Button>
      </form>

      {byCategory.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {byCategory.map(([c, amount]) => (
            <span key={c} className="rounded-full border bg-card px-3 py-1 text-sm">
              {c}: <span className="font-semibold text-deep tabular">{formatPaise(amount)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <Card className="py-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden md:table-cell">Paid to / note</TableHead>
                <TableHead className="hidden sm:table-cell">Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(new Date(r.expense_date))}</TableCell>
                    <TableCell className="font-medium text-deep">
                      {r.category}
                      {r.receipt_path && receipts.get(r.receipt_path) ? (
                        <a href={receipts.get(r.receipt_path)} target="_blank" rel="noopener noreferrer" className="block text-xs font-normal text-royal hover:underline">Receipt</a>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{[r.paid_to, r.note].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{MODE[r.payment_mode] ?? r.payment_mode}</TableCell>
                    <TableCell className="text-right font-semibold tabular">{formatPaise(r.amount_paise)}</TableCell>
                    <TableCell>{can(me, "expenses", "delete") ? <DeleteExpenseButton id={r.id} /> : null}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No expenses in this month.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function ExpensesPage(props: PageProps<"/admin/expenses">) {
  return (
    <StaffOnly module="expenses">
      <ExpensesContent searchParams={props.searchParams} />
    </StaffOnly>
  );
}
