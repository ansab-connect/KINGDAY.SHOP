import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  IndianRupee,
  Package,
  ShoppingBag,
  Users,
  Wrench,
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
import { navFor } from "@/config/admin-nav";
import { allows, type Module, type Permissions } from "@/features/auth/permissions";
import { can, getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

const IN_PROGRESS = ["assigned", "accepted", "on_the_way", "reached", "inspection_started", "inspection_completed", "started"];

/** Real service counts; RLS returns rows only to people who may view service bookings. */
async function getServiceSummary() {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const head = () => supabase.from("service_bookings").select("id", { count: "exact", head: true });
  const [unassigned, active, done] = await Promise.all([
    head().eq("status", "new").is("assigned_to", null),
    head().in("status", IN_PROGRESS),
    head().in("status", ["completed", "ready_for_delivery", "invoiced"]).gte("updated_at", monthStart.toISOString()),
  ]);
  return { unassigned: unassigned.count ?? 0, active: active.count ?? 0, doneThisMonth: done.count ?? 0 };
}

async function AdminDashboardPageContent() {
  // Sections follow the viewer's permissions; null = local preview (show everything).
  const me = isSupabaseConfigured ? await getCurrentUser() : null;
  const perms: Permissions | null = me ? me.permissions : null;
  const sees = (m: Module) => perms === null || allows(perms, m, "view");
  const sales = sees("orders");
  const [data, service] = await Promise.all([getAdminData(), isSupabaseConfigured && sees("service") ? getServiceSummary() : null]);
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
        description={sales ? "Store performance for the last 30 days." : "Your work at a glance."}
        actions={
          <>
            {sales ? (
              <Button variant="outline" asChild>
                <Link href="/admin/orders">View orders</Link>
              </Button>
            ) : null}
            {sees("products") ? (
              <Button asChild>
                <Link href="/admin/products">
                  <Package aria-hidden /> Products
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {data.live ? null : <PreviewNotice />}

      {/* Primary KPIs */}
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sales ? (
          <>
            <StatCard label="Total revenue" value={formatPaise(s.revenue.value)} change={s.revenue.change} hint="vs previous 30 days" icon={IndianRupee} tone="royal" href="/admin/reports" />
            <StatCard label="Total orders" value={formatNumber(s.orders.value)} change={s.orders.change} hint="vs previous 30 days" icon={ShoppingBag} tone="gold" href="/admin/orders" />
          </>
        ) : null}
        {sees("customers") ? <StatCard label="Customers" value={formatNumber(s.customers.value)} hint={`${s.customers.newThisMonth} new this month`} icon={Users} tone="neutral" href="/admin/customers" /> : null}
        {sees("products") ? <StatCard label="Active products" value={formatNumber(s.products.active)} hint={`${s.products.total} in catalogue`} icon={Package} tone="neutral" href="/admin/products" /> : null}
      </section>

      {/* Operational KPIs */}
      {sales || sees("inventory") ? (
        <section aria-label="Operations" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {sales ? (
            <>
              <OpsTile href="/admin/orders" icon={Clock} label="Pending orders" value={s.pendingOrders} note="Need action" tone="text-warning bg-warning-soft" />
              <OpsTile href="/admin/orders" icon={CheckCircle2} label="Completed orders" value={s.completedOrders} note="Delivered" tone="text-success bg-success-soft" />
            </>
          ) : null}
          {sees("inventory") ? <OpsTile href="/admin/inventory" icon={AlertTriangle} label="Low stock" value={s.lowStock} note="At or below reorder level" tone="text-danger bg-danger-soft" /> : null}
        </section>
      ) : null}

      {/* Service (BEST FIT) */}
      {service ? (
        <section aria-label="Service" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <OpsTile href="/admin/service?status=unassigned" icon={Wrench} label="Bookings to assign" value={service.unassigned} note="New, no technician" tone="text-warning bg-warning-soft" />
          <OpsTile href="/admin/service" icon={Clock} label="Service in progress" value={service.active} note="Assigned to started" tone="text-royal bg-royal-50" />
          <OpsTile href="/admin/service" icon={CheckCircle2} label="Services done" value={service.doneThisMonth} note="This month" tone="text-success bg-success-soft" />
        </section>
      ) : null}

      {/* Sales chart + order statistics */}
      {sales ? (
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
      ) : null}

      {/* Recent orders + top products */}
      {sales ? (
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
      ) : null}

      {/* Low stock */}
      {sees("inventory") ? (
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
      ) : null}
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

/**
 * /admin is the Admin home. Someone without "Overview" goes straight to the first
 * module they may open, instead of a "no access" page.
 */
async function OverviewEntry() {
  if (isSupabaseConfigured) {
    const me = await getCurrentUser();
    if (me && !can(me, "overview")) {
      const first = navFor(me.permissions, me.role === "super_admin").flatMap((g) => g.items)[0];
      redirect(first?.href ?? "/staff");
    }
  }
  return <AdminDashboardPageContent />;
}

export default function AdminDashboardPage() {
  return (
    <StaffOnly>
      <OverviewEntry />
    </StaffOnly>
  );
}
