import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  IndianRupee,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import { RevenueChart } from "@/components/admin/charts/revenue-chart";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewNotice } from "@/components/admin/preview-notice";
import { StatCard } from "@/components/admin/stat-card";
import { OrderStatusBadge, PaymentStatusBadge, StockBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getDailyRevenue,
  getDashboardSummary,
  getLowStockProducts,
  getOrderStatusBreakdown,
  getRecentOrders,
  getTopProducts,
} from "@/features/dashboard/metrics";
import { getAdminData } from "@/features/admin/source";
import { ORDER_STATUS_LABEL } from "@/features/orders/types";
import { formatDateTime, formatNumber, formatPaise } from "@/lib/format";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Overview" };

async function AdminDashboardPageContent() {
  const data = await getAdminData();
  const s = getDashboardSummary(data);
  const daily = getDailyRevenue(data, 30);
  const breakdown = getOrderStatusBreakdown(data);
  const breakdownMax = Math.max(1, ...breakdown.map((b) => b.count));
  const recent = getRecentOrders(data, 6);
  const top = getTopProducts(data, 5);
  const lowStock = getLowStockProducts(data);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Store performance for the last 30 days."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/orders">View orders</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/products">
                <Package aria-hidden /> Products
              </Link>
            </Button>
          </>
        }
      />
      {data.live ? null : <PreviewNotice />}

      {/* Primary KPIs */}
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total revenue" value={formatPaise(s.revenue.value)} change={s.revenue.change} hint="vs previous 30 days" icon={IndianRupee} tone="royal" />
        <StatCard label="Total orders" value={formatNumber(s.orders.value)} change={s.orders.change} hint="vs previous 30 days" icon={ShoppingBag} tone="gold" />
        <StatCard label="Customers" value={formatNumber(s.customers.value)} hint={`${s.customers.newThisMonth} new this month`} icon={Users} tone="neutral" />
        <StatCard label="Active products" value={formatNumber(s.products.active)} hint={`${s.products.total} in catalogue`} icon={Package} tone="neutral" />
      </section>

      {/* Operational KPIs */}
      <section aria-label="Operations" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <OpsTile href="/admin/orders" icon={Clock} label="Pending orders" value={s.pendingOrders} note="Need action" tone="text-warning bg-warning-soft" />
        <OpsTile href="/admin/orders" icon={CheckCircle2} label="Completed orders" value={s.completedOrders} note="Delivered" tone="text-success bg-success-soft" />
        <OpsTile href="/admin/inventory" icon={AlertTriangle} label="Low stock" value={s.lowStock} note="At or below reorder level" tone="text-danger bg-danger-soft" />
      </section>

      {/* Sales chart + order statistics */}
      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">Daily revenue</CardTitle>
            <CardDescription>
              Last 30 days · avg. order value {formatPaise(s.averageOrderValue)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={daily} />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-base">Order statistics</CardTitle>
            <CardDescription>Orders by status, last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No orders in the last 30 days.</p> : null}
            <ul className="flex flex-col gap-3">
              {breakdown.map((b) => (
                <li key={b.status} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{ORDER_STATUS_LABEL[b.status]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-royal-500"
                      style={{ width: `${(b.count / breakdownMax) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-medium tabular">{b.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Recent orders + top products */}
      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">Recent orders</CardTitle>
            <CardDescription>Latest orders across all channels</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/orders">
                  View all <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Payment</TableHead>
                  <TableHead className="pr-6 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No orders yet.</TableCell></TableRow>
                ) : null}
                {recent.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6">
                      <span className="font-medium text-deep">{o.number}</span>
                      <span className="block text-xs text-muted-foreground">{formatDateTime(o.placedAt)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-40 truncate">{o.customerName}</span>
                      <span className="block text-xs text-muted-foreground">{o.city}</span>
                    </TableCell>
                    <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                    <TableCell className="hidden md:table-cell"><PaymentStatusBadge status={o.paymentStatus} /></TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular">{formatPaise(o.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-base">Top products</CardTitle>
            <CardDescription>By revenue, last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No sales in the last 30 days.</p> : null}
            <ol className="flex flex-col gap-4">
              {top.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg font-heading text-sm font-bold ${i === 0 ? "bg-gold text-deep" : "bg-royal-50 text-royal"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.unitsSold30d} sold · {p.category}</p>
                  </div>
                  <span className="text-sm font-semibold tabular">{formatPaise(p.revenue30d)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Low stock */}
      <section className="mt-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base">
              <AlertTriangle aria-hidden className="size-4 text-warning" /> Low stock alerts
            </CardTitle>
            <CardDescription>Products at or below their reorder level</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/inventory">
                  Inventory <ArrowRight aria-hidden />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products are above reorder level.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                    <StockBadge stock={p.stock} reorderLevel={p.reorderLevel} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function OpsTile({
  href,
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  href: string;
  icon: typeof Clock;
  label: string;
  value: number;
  note: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-heading text-xl font-bold text-deep tabular">{formatNumber(value)}</p>
      </div>
      <span className="hidden text-xs text-muted-foreground sm:block">{note}</span>
      <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function AdminDashboardPage() {
  return (
    <StaffOnly>
      <AdminDashboardPageContent />
    </StaffOnly>
  );
}
