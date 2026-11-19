import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  PREVIEW_TODAY,
  previewCustomers,
  previewOrders,
  previewProducts,
  previewStockMovements,
  type PreviewCustomer,
  type PreviewOrder,
  type PreviewProduct,
  type PreviewStockMovement,
  type StockMovementType,
} from "@/features/preview/data";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/features/orders/types";

/**
 * Single data source for the admin panel. With Supabase configured, every read
 * goes through the signed-in staff member's client, so RLS decides what is
 * visible. Without Supabase (local design preview only) it returns preview data.
 * Callers must already be inside <StaffOnly>.
 */

export type AdminOrder = PreviewOrder & { email: string | null; phone: string | null };
export type StockRow = PreviewProduct & { variantId: string };
export type SoldLine = { productId: string; name: string; category: string; units: number; revenue: number; placedAt: Date; status: OrderStatus };

export type AdminData = {
  live: boolean;
  today: Date;
  orders: AdminOrder[];
  customers: PreviewCustomer[];
  stock: StockRow[];
  movements: PreviewStockMovement[];
  sold: SoldLine[];
  productCounts: { active: number; total: number };
};

const ORDER_LIMIT = 2000;

type OrderRow = {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: { city?: string } | null;
  status: OrderStatus;
  payment_status: string;
  payment_method: PaymentMethod;
  grand_total: number;
  discount_total: number;
  placed_at: string;
  order_items: { quantity: number; line_total: number; product_id: string | null; product_name: string }[];
};

function toPaymentStatus(s: string): PaymentStatus {
  return s === "paid" || s === "failed" || s === "refunded" || s === "authorized" ? s : "pending";
}

function previewData(): AdminData {
  return {
    live: false,
    today: PREVIEW_TODAY,
    orders: previewOrders.map((o) => ({ ...o, email: null, phone: null })),
    customers: previewCustomers,
    stock: previewProducts.map((p) => ({ ...p, variantId: p.id })),
    movements: previewStockMovements,
    sold: previewProducts.map((p) => ({ productId: p.id, name: p.name, category: p.category, units: p.unitsSold30d, revenue: p.unitsSold30d * p.price, placedAt: PREVIEW_TODAY, status: "delivered" as const })),
    productCounts: { active: previewProducts.filter((p) => p.status === "active").length, total: previewProducts.length },
  };
}

export const getAdminData = cache(async function getAdminData(): Promise<AdminData> {
  if (!isSupabaseConfigured) return previewData();
  await connection();
  const supabase = await createClient();

  const [ordersRes, profilesRes, variantsRes, movesRes, productsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, user_id, customer_name, customer_email, customer_phone, shipping_address, status, payment_status, payment_method, grand_total, discount_total, placed_at, order_items(quantity, line_total, product_id, product_name)")
      .order("placed_at", { ascending: false })
      .limit(ORDER_LIMIT),
    supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at", { ascending: false }).limit(2000),
    supabase
      .from("product_variants")
      .select("id, sku, name, price, mrp, product:products!inner(id, name, status, is_featured, category:categories(name), brand:brands(name)), inventory(on_hand, reorder_level)")
      .order("sku"),
    supabase
      .from("stock_movements")
      .select("id, type, quantity, balance_after, reason, created_at, variant:product_variants(sku, product:products(name))")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("products").select("status"),
  ]);

  const firstError = [ordersRes, profilesRes, variantsRes, movesRes, productsRes].find((r) => r.error)?.error;
  if (firstError) throw new Error(`Could not load admin data: ${firstError.message}`);

  const orderRows = (ordersRes.data ?? []) as unknown as OrderRow[];
  const orders: AdminOrder[] = orderRows.map((o) => ({
    id: o.id,
    number: o.order_number,
    customerId: o.user_id ?? "",
    customerName: o.customer_name,
    city: o.shipping_address?.city ?? "—",
    items: o.order_items.reduce((s, i) => s + i.quantity, 0),
    total: o.grand_total,
    discount: o.discount_total,
    status: o.status,
    paymentStatus: toPaymentStatus(o.payment_status),
    paymentMethod: o.payment_method,
    placedAt: new Date(o.placed_at),
    email: o.customer_email,
    phone: o.customer_phone,
  }));

  type Variant = {
    id: string; sku: string; name: string; price: number; mrp: number;
    product: { id: string; name: string; status: PreviewProduct["status"]; is_featured: boolean; category: { name: string } | null; brand: { name: string } | null };
    inventory: { on_hand: number; reorder_level: number } | { on_hand: number; reorder_level: number }[] | null;
  };
  const variants = (variantsRes.data ?? []) as unknown as Variant[];
  const categoryOf = new Map<string, string>();
  const stock: StockRow[] = variants.map((v) => {
    const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
    categoryOf.set(v.product.id, v.product.category?.name ?? "—");
    return {
      id: v.id,
      variantId: v.id,
      name: v.name === "Default" ? v.product.name : `${v.product.name} · ${v.name}`,
      sku: v.sku,
      category: v.product.category?.name ?? "—",
      brand: v.product.brand?.name ?? "—",
      mrp: v.mrp,
      price: v.price,
      stock: inv?.on_hand ?? 0,
      reorderLevel: inv?.reorder_level ?? 5,
      variants: 1,
      status: v.product.status,
      featured: v.product.is_featured,
      unitsSold30d: 0,
    } as StockRow;
  });

  type Move = { id: number; type: StockMovementType; quantity: number; balance_after: number; reason: string | null; created_at: string; variant: { sku: string; product: { name: string } | null } | null };
  const movements: PreviewStockMovement[] = ((movesRes.data ?? []) as unknown as Move[]).map((m) => ({
    id: String(m.id),
    sku: m.variant?.sku ?? "—",
    product: m.variant?.product?.name ?? "—",
    type: m.type,
    quantity: m.quantity,
    balance: m.balance_after,
    reason: m.reason ?? "",
    by: "Staff",
    at: new Date(m.created_at),
  }));

  const sold: SoldLine[] = orderRows.flatMap((o) =>
    o.order_items.map((i) => ({
      productId: i.product_id ?? i.product_name,
      name: i.product_name,
      category: (i.product_id && categoryOf.get(i.product_id)) || "—",
      units: i.quantity,
      revenue: i.line_total,
      placedAt: new Date(o.placed_at),
      status: o.status,
    })),
  );

  type Profile = { id: string; full_name: string | null; phone: string | null; created_at: string };
  const byUser = new Map<string, AdminOrder[]>();
  for (const o of orders) if (o.customerId) byUser.set(o.customerId, [...(byUser.get(o.customerId) ?? []), o]);
  const customers: PreviewCustomer[] = ((profilesRes.data ?? []) as Profile[]).map((p) => {
    const own = byUser.get(p.id) ?? [];
    const valid = own.filter((o) => !["cancelled", "refunded", "returned"].includes(o.status));
    return {
      id: p.id,
      name: p.full_name || own[0]?.customerName || "Unnamed customer",
      email: own[0]?.email ?? "",
      phone: p.phone ?? own[0]?.phone ?? "",
      city: own[0]?.city ?? "—",
      orders: own.length,
      totalSpent: valid.reduce((s, o) => s + o.total, 0),
      joinedAt: new Date(p.created_at),
      lastOrderAt: own[0]?.placedAt ?? null,
    };
  });

  const statuses = (productsRes.data ?? []) as { status: string }[];
  return {
    live: true,
    today: new Date(),
    orders,
    customers,
    stock,
    movements,
    sold,
    productCounts: { active: statuses.filter((p) => p.status === "active").length, total: statuses.length },
  };
});
