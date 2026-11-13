import "server-only";
import { OPEN_ORDER_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/features/orders/types";
import {
  PREVIEW_TODAY,
  previewCustomers,
  previewOrders,
  previewProducts,
} from "@/features/preview/data";

/**
 * Dashboard metrics. Currently computed from preview data. In Phase 10 this
 * module switches to Supabase SQL aggregates; the returned shape stays the same.
 */

const REVENUE_EXCLUDED: readonly OrderStatus[] = ["cancelled", "refunded", "returned"];
const DAY = 86_400_000;

/** Calendar-day age in IST (0 = today), so buckets match the store's local days. */
const istDay = (d: Date) => Date.parse(d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
const ageInDays = (d: Date) => Math.round((istDay(PREVIEW_TODAY) - istDay(d)) / DAY);

const counted = previewOrders.filter((o) => !REVENUE_EXCLUDED.includes(o.status));
const inWindow = (from: number, to: number) =>
  counted.filter((o) => {
    const age = ageInDays(o.placedAt);
    return age >= from && age < to;
  });

function changePct(current: number, previous: number) {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function getDashboardSummary() {
  const last30 = inWindow(0, 30);
  const prev30 = inWindow(30, 60);
  const revenue30 = last30.reduce((s, o) => s + o.total, 0);
  const revenuePrev = prev30.reduce((s, o) => s + o.total, 0);

  const ordersLast30 = previewOrders.filter((o) => ageInDays(o.placedAt) < 30);
  const ordersPrev30 = previewOrders.filter((o) => {
    const age = ageInDays(o.placedAt);
    return age >= 30 && age < 60;
  });

  return {
    revenue: { value: revenue30, change: changePct(revenue30, revenuePrev) },
    orders: { value: ordersLast30.length, change: changePct(ordersLast30.length, ordersPrev30.length) },
    customers: { value: previewCustomers.length, newThisMonth: 3 },
    products: {
      value: previewProducts.filter((p) => p.status === "active").length,
      total: previewProducts.length,
    },
    pendingOrders: previewOrders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status)).length,
    completedOrders: previewOrders.filter((o) => o.status === "delivered").length,
    lowStock: previewProducts.filter((p) => p.stock <= p.reorderLevel).length,
    averageOrderValue: last30.length ? Math.round(revenue30 / last30.length) : 0,
  };
}

export type DailyRevenue = { date: string; label: string; revenue: number; orders: number };

export function getDailyRevenue(days = 30): DailyRevenue[] {
  return Array.from({ length: days }, (_, i) => {
    const age = days - 1 - i;
    const day = new Date(PREVIEW_TODAY.getTime() - age * DAY);
    const rows = inWindow(age, age + 1);
    return {
      date: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
      revenue: rows.reduce((s, o) => s + o.total, 0),
      orders: rows.length,
    };
  });
}

export function getOrderStatusBreakdown() {
  const last30 = previewOrders.filter((o) => ageInDays(o.placedAt) < 30);
  return ORDER_STATUSES.map((status) => ({
    status,
    count: last30.filter((o) => o.status === status).length,
  })).filter((s) => s.count > 0);
}

export function getRecentOrders(limit = 6) {
  return previewOrders.slice(0, limit);
}

export function getTopProducts(limit = 5) {
  return [...previewProducts]
    .sort((a, b) => b.unitsSold30d * b.price - a.unitsSold30d * a.price)
    .slice(0, limit)
    .map((p) => ({ ...p, revenue30d: p.unitsSold30d * p.price }));
}

export function getLowStockProducts() {
  return previewProducts
    .filter((p) => p.stock <= p.reorderLevel)
    .sort((a, b) => a.stock - b.stock);
}
