import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText, Search, ShoppingBag, Wrench } from "lucide-react";
import { ClickableRow } from "@/components/admin/clickable-row";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Pill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBills } from "@/features/billing/bills";
import { isSupabaseConfigured } from "@/lib/env";
import { formatDateTime, formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

const TABS = [
  { value: "", label: "All bills" },
  { value: "sale", label: "Sale" },
  { value: "service", label: "Service" },
];
const payTone = { paid: "success", partial: "warning", unpaid: "danger" } as const;
const payLabel = { paid: "Paid", partial: "Part paid", unpaid: "Unpaid" } as const;

async function BillingContent({ searchParams }: { searchParams: PageProps<"/admin/billing">["searchParams"] }) {
  const params = await searchParams;
  const kind = params.kind === "sale" || params.kind === "service" ? params.kind : "";
  const q = typeof params.q === "string" ? params.q.slice(0, 60) : "";
  const bills = isSupabaseConfigured ? await listBills({ kind, q }) : [];
  const today = new Date().toDateString();
  const todays = bills.filter((b) => b.status === "active" && new Date(b.created_at).toDateString() === today);
  const href = (k: string) => {
    const sp = new URLSearchParams();
    if (k) sp.set("kind", k);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/admin/billing?${s}` : "/admin/billing";
  };

  return (
    <>
      <PageHeader
        title="Billing"
        description="Make a bill at the counter: a Sale bill for products, or a Service bill for repairs."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/billing/new?type=service"><Wrench aria-hidden /> New service bill</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/billing/new?type=sale"><ShoppingBag aria-hidden /> New sale bill</Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Bills today" value={String(todays.length)} />
        <Stat label="Billed today" value={formatPaise(todays.reduce((s, b) => s + b.grand_total, 0))} />
        <Stat label="Received today" value={formatPaise(todays.reduce((s, b) => s + b.amount_paid, 0))} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Bill type" className="flex gap-1.5">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={href(t.value)}
              aria-current={kind === t.value ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", kind === t.value ? "border-royal bg-royal text-white" : "bg-card text-muted-foreground hover:text-royal")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/billing" className="relative sm:w-72" role="search">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" type="search" defaultValue={q} aria-label="Search bills" placeholder="Bill no, customer ID, name, phone…" className="h-10 w-full rounded-lg border bg-card pr-3 pl-9 text-sm outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100" />
        </form>
      </div>

      <Card className="py-0 shadow-card">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Bill</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-6">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center">
                    <ReceiptText aria-hidden className="mx-auto size-8 text-royal-300" />
                    <p className="mt-3 font-medium text-deep">{q || kind ? "No bills match" : "No bills yet"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Use New sale bill or New service bill above.</p>
                  </TableCell>
                </TableRow>
              ) : (
                bills.map((b) => (
                  <ClickableRow key={b.id} href={`/admin/billing/${b.id}`} className={b.status === "cancelled" ? "opacity-60" : undefined}>
                    <TableCell className="pl-6">
                      <Link href={`/admin/billing/${b.id}`} className="font-medium text-royal hover:underline">{b.bill_number}</Link>
                      <p className="text-xs text-muted-foreground">{b.kind === "sale" ? "Sale" : "Service"}{b.status === "cancelled" ? " · Cancelled" : ""}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-deep">{b.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{[b.customer_code, b.customer_phone].filter(Boolean).join(" · ")}</p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(new Date(b.created_at))}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular", b.status === "cancelled" && "line-through")}>{formatPaise(b.grand_total)}</TableCell>
                    <TableCell className="pr-6">
                      {b.status === "cancelled" ? <Pill tone="neutral">Cancelled</Pill> : <Pill tone={payTone[b.payment_status]}>{payLabel[b.payment_status]}</Pill>}
                    </TableCell>
                  </ClickableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-card", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-bold text-deep tabular">{value}</p>
    </div>
  );
}

export default function BillingPage(props: PageProps<"/admin/billing">) {
  return (
    <StaffOnly module="orders">
      <BillingContent searchParams={props.searchParams} />
    </StaffOnly>
  );
}
