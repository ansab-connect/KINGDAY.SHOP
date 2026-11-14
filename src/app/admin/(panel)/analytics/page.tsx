import type { Metadata } from "next";
import Link from "next/link";
import { IndianRupee, Percent, Repeat, ShoppingBag } from "lucide-react";
import { RevenueChart } from "@/components/admin/charts/revenue-chart";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StaffOnly } from "@/components/admin/staff-only";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/features/admin/source";
import {
  getCategoryPerformance,
  getDailyRevenue,
  getDashboardSummary,
  getOrderStatusBreakdown,
  getRepeatCustomerRate,
  getTopProducts,
} from "@/features/dashboard/metrics";
import { ORDER_STATUS_LABEL } from "@/features/orders/types";
import { formatNumber, formatPaise, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

const PERIODS = [7, 30, 60] as const;

async function AnalyticsPageContent({ searchParams }: PageProps<"/admin/analytics">) {
  const raw = (await searchParams).days;
  const days = PERIODS.find((p) => String(p) === (Array.isArray(raw) ? raw[0] : raw)) ?? 30;
  const data = await getAdminData();
  const s = getDashboardSummary(data, days);
  const daily = getDailyRevenue(data, days);
  const categories = getCategoryPerformance(data, days);
  const catMax = Math.max(1, ...categories.map((c) => c.revenue));
  const top = getTopProducts(data, 10, days);
  const statuses = getOrderStatusBreakdown(data, days);
  const statusTotal = statuses.reduce((a, b) => a + b.count, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Sales, product and customer performance · last ${days} days`}
        actions={
          <nav aria-label="Period" className="flex rounded-lg border bg-card p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/admin/analytics?days=${p}`}
                aria-current={p === days ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", p === days ? "bg-royal text-white" : "text-muted-foreground hover:text-royal")}
              >
                {p}d
              </Link>
            ))}
          </nav>
        }
      />
      {data.live ? null : <PreviewNotice />}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatPaise(s.revenue.value)} change={s.revenue.change} hint={`vs previous ${days} days`} icon={IndianRupee} tone="royal" />
        <StatCard label="Orders" value={formatNumber(s.orders.value)} change={s.orders.change} hint={`vs previous ${days} days`} icon={ShoppingBag} tone="gold" />
        <StatCard label="Avg. order value" value={formatPaise(s.averageOrderValue)} hint={`Discounts given: ${formatPaise(s.discounts)}`} icon={Percent} tone="neutral" />
        <StatCard label="Repeat customers" value={formatPercent(getRepeatCustomerRate(data)).replace("+", "")} hint="Of customers who ordered" icon={Repeat} tone="neutral" />
      </section>

      <Card className="mt-6 shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-base">Daily revenue</CardTitle>
          <CardDescription>Excludes cancelled, returned and refunded orders</CardDescription>
        </CardHeader>
        <CardContent><RevenueChart data={daily} /></CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="font-heading text-base">Category performance</CardTitle></CardHeader>
          <CardContent>
            {categories.length === 0 ? <Empty /> : (
              <ul className="flex flex-col gap-3">
                {categories.map((c) => (
                  <li key={c.category} className="text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="truncate">{c.category}</span>
                      <span className="shrink-0 font-medium tabular">{formatPaise(c.revenue)} · {c.units} units</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-royal" style={{ width: `${(c.revenue / catMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="font-heading text-base">Order status mix</CardTitle></CardHeader>
          <CardContent>
            {statuses.length === 0 ? <Empty /> : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {statuses.map((b) => (
                  <li key={b.status} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{ORDER_STATUS_LABEL[b.status]}</p>
                    <p className="mt-1 text-lg font-bold text-deep tabular">{b.count}</p>
                    <p className="text-xs text-muted-foreground">{Math.round((b.count / statusTotal) * 100)}%</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 shadow-card">
        <CardHeader><CardTitle className="font-heading text-base">Top products</CardTitle></CardHeader>
        <CardContent>
          {top.length === 0 ? <Empty /> : (
            <ol className="divide-y">
              {top.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-royal-50 text-xs font-bold text-royal">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="hidden text-muted-foreground sm:inline">{p.unitsSold30d} sold</span>
                  <span className="font-semibold tabular">{formatPaise(p.revenue30d)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period yet.</p>;
}

export default function AnalyticsPage(props: PageProps<"/admin/analytics">) {
  return (
    <StaffOnly module="analytics">
      <AnalyticsPageContent {...props} />
    </StaffOnly>
  );
}
