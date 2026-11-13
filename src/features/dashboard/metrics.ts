import "server-only";
import { OPEN_ORDER_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/features/orders/types";
import type { AdminData } from "@/features/admin/source";

/**
 * Dashboard / analytics metrics, computed from the admin data source (live
 * Supabase orders, or preview data in local design mode).
 */

export const REVENUE_EXCLUDED: readonly OrderStatus[] = ["cancelled", "refunded", "returned"];
const DAY = 86_400_000;

/** Calendar-day age in IST (0 = today), so buckets match the store's local days. */
const istDay = (d: Date) => Date.parse(d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
const ageInDays = (today: Date, d: Date) => Math.round((istDay(today) - istDay(d)) / DAY);

function changePct(current: number, previous: number) {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function windowed(data: AdminData, from: number, to: number, countedOnly = true) {
  return data.orders.filter((o) => {
    if (countedOnly && REVENUE_EXCLUDED.includes(o.status)) return false;
    const age = ageInDays(data.today, o.placedAt);
    return age >= from && age < to;
  });
}

export function getDashboardSummary(data: AdminData, days = 30) {
  const cur = windowed(data, 0, days);
  const prev = windowed(data, days, days * 2);
  const revenue = cur.reduce((s, o) => s + o.total, 0);
  const revenuePrev = prev.reduce((s, o) => s + o.total, 0);
  const ordersCur = windowed(data, 0, days, false);
  const ordersPrev = windowed(data, days, days * 2, false);
  const newCustomers = data.customers.filter((c) => ageInDays(data.today, c.joinedAt) < 30).length;

  return {
    revenue: { value: revenue, change: changePct(revenue, revenuePrev) },
    orders: { value: ordersCur.length, change: changePct(ordersCur.length, ordersPrev.length) },
    customers: { value: data.customers.length, newThisMonth: newCustomers },
    products: data.productCounts,
    pendingOrders: data.orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status)).length,
    completedOrders: data.orders.filter((o) => o.status === "delivered").length,
    lowStock: data.stock.filter((p) => p.stock <= p.reorderLevel).length,
    averageOrderValue: cur.length ? Math.round(revenue / cur.length) : 0,
    discounts: cur.reduce((s, o) => s + o.discount, 0),
  };
}

export type DailyRevenue = { date: string; label: string; revenue: number; orders: number };

export function getDailyRevenue(data: AdminData, days = 30): DailyRevenue[] {
  return Array.from({ length: days }, (_, i) => {
    const age = days - 1 - i;
    const day = new Date(data.today.getTime() - age * DAY);
    const rows = windowed(data, age, age + 1);
    return {
      date: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
      revenue: rows.reduce((s, o) => s + o.total, 0),
      orders: rows.length,
    };
  });
}

export function getOrderStatusBreakdown(data: AdminData, days = 30) {
  const cur = windowed(data, 0, days, false);
  return ORDER_STATUSES.map((status) => ({
    status,
    count: cur.filter((o) => o.status === status).length,
  })).filter((s) => s.count > 0);
}

export function getRecentOrders(data: AdminData, limit = 6) {
  return data.orders.slice(0, limit);
}

export function getTopProducts(data: AdminData, limit = 5, days = 30) {
  const map = new Map<string, { id: string; name: string; category: string; unitsSold30d: number; revenue30d: number }>();
  for (const l of data.sold) {
    if (REVENUE_EXCLUDED.includes(l.status) || ageInDays(data.today, l.placedAt) >= days) continue;
    const cur = map.get(l.productId) ?? { id: l.productId, name: l.name, category: l.category, unitsSold30d: 0, revenue30d: 0 };
    cur.unitsSold30d += l.units;
    cur.revenue30d += l.revenue;
    map.set(l.productId, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue30d - a.revenue30d).slice(0, limit);
}

export function getCategoryPerformance(data: AdminData, days = 30) {
  const map = new Map<string, { category: string; units: number; revenue: number }>();
  for (const l of data.sold) {
    if (REVENUE_EXCLUDED.includes(l.status) || ageInDays(data.today, l.placedAt) >= days) continue;
    const cur = map.get(l.category) ?? { category: l.category, units: 0, revenue: 0 };
    cur.units += l.units;
    cur.revenue += l.revenue;
    map.set(l.category, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export function getLowStockProducts(data: AdminData) {
  return data.stock.filter((p) => p.stock <= p.reorderLevel).sort((a, b) => a.stock - b.stock);
}

export function getRepeatCustomerRate(data: AdminData) {
  const buyers = data.customers.filter((c) => c.orders > 0);
  if (!buyers.length) return 0;
  return (buyers.filter((c) => c.orders > 1).length / buyers.length) * 100;
}
