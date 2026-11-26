import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * CSV exports for Service / BEST FIT / Accounts reports. Uses the signed-in user's
 * database session, so row-level security decides what each person may export.
 */
const REPORTS: Record<string, { table: string; select: string; date: string }> = {
  bookings: { table: "service_bookings", select: "booking_code, created_at, customer_name, mobile, category_label, service_type_label, service_mode, town, status, estimated_distance_km, verified_distance_km", date: "created_at" },
  "work-orders": { table: "work_orders", select: "work_order_number, created_at, status, scheduled_date, scheduled_slot, technician_id, group_id, booking_id", date: "created_at" },
  "pre-invoices": { table: "inspection_pre_invoices", select: "invoice_number, created_at, customer_name, distance_km, slab_code, rate_paise, charge_paise, tax_paise, total_paise, amount_paid, payment_status, status", date: "created_at" },
  invoices: { table: "service_invoices", select: "invoice_number, created_at, customer_name, basic_charge, labour_charge, additional_total, spare_parts_total, discount, tax_amount, grand_total, amount_paid, payment_status, approval_status", date: "created_at" },
  payments: { table: "service_payments", select: "payment_number, received_at, amount_paise, method, reference, booking_id, pre_invoice_id, service_invoice_id", date: "received_at" },
  allocations: { table: "commission_allocations", select: "created_at, section, beneficiary, user_id, base_paise, percent, amount_paise, status, service_invoice_id, booking_id", date: "created_at" },
  earnings: { table: "technician_invoices", select: "invoice_number, created_at, user_id, inspection_paise, service_paise, parts_paise, travel_paise, total_paise, status, claim_reference, claimed_at", date: "created_at" },
  wallet: { table: "staff_wallet_ledger", select: "created_at, user_id, entry_type, amount_paise, claim_reference, payout_method, payout_reference, note", date: "created_at" },
  reclaims: { table: "service_reclaims", select: "reclaim_number, expense_date, claimant_id, category, amount_paise, approved_paise, status, description, payment_method, payment_reference, paid_at", date: "created_at" },
};

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request, ctx: { params: Promise<{ report: string }> }) {
  const { report } = await ctx.params;
  const r = REPORTS[report];
  if (!r) return new NextResponse("Unknown report", { status: 404 });
  if (!(await getCurrentUser())) return new NextResponse("Sign in", { status: 401 });
  const url = new URL(req.url);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : "2000-01-01";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : "2999-12-31";
  const supabase = await createClient();
  const { data, error } = await supabase.from(r.table).select(r.select).gte(r.date, from).lte(r.date, `${to}T23:59:59.999`).order(r.date).limit(20000);
  if (error) return new NextResponse("Not allowed", { status: 403 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const cols = r.select.split(",").map((c) => c.trim());
  const csv = [cols.join(","), ...rows.map((row) => cols.map((c) => cell(row[c])).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${report}-${from}-${to}.csv"`, "cache-control": "no-store" } });
}
