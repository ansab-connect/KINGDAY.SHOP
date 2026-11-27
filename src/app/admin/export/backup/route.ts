import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { getCurrentUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Full backup: one ZIP with a CSV (opens in Excel) for every business table — sales,
 * orders, invoices, service, customers, purchases, expenses, stock and settings.
 * Super Admin only; read with the Super Admin's own database session.
 */
const TABLES = [
  "profiles", "addresses", "orders", "order_items", "order_status_history", "shipments", "payments",
  "products", "product_variants", "product_attributes", "product_categories", "categories", "brands", "inventory", "stock_movements",
  "coupons", "warranties", "warranty_categories", "warranty_brands",
  "bills", "bill_items", "purchases", "purchase_items", "suppliers", "expenses",
  "service_bookings", "service_job_events", "service_inspections", "service_invoices", "service_replaced_items", "spare_parts",
  "inspection_pre_invoices", "service_payments", "work_orders", "route_plans", "service_centres", "inspection_slabs",
  "commission_rules", "commission_rule_shares", "commission_allocations", "technician_invoices", "staff_wallet_ledger", "service_reclaims",
  "staff_profiles", "staff_tasks", "user_roles", "store_settings",
];

const cell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new NextResponse("Sign in", { status: 401 });
  if (!me.roles.includes("super_admin")) return new NextResponse("Super Admin only", { status: 403 });
  const supabase = await createClient();
  const files: Record<string, Uint8Array> = {};
  const summary: string[] = [`KING DAY backup ${new Date().toISOString()}`, ""];
  for (const table of TABLES) {
    const rows: Record<string, unknown>[] = [];
    let failed = false;
    for (let from = 0; from < 200000; from += 1000) {
      const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
      if (error) { failed = true; break; }
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < 1000) break;
    }
    if (failed) { summary.push(`${table}: skipped (not available)`); continue; }
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    // BOM so Excel reads Malayalam / ₹ correctly.
    files[`${table}.csv`] = strToU8("﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n"));
    summary.push(`${table}: ${rows.length} rows`);
  }
  files["README.txt"] = strToU8(summary.join("\r\n"));
  const zip = zipSync(files, { level: 6 });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(zip), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="kingday-backup-${day}.zip"`, "cache-control": "no-store" },
  });
}
