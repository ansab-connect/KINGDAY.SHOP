import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AccountsSummary = Record<
  | "product_sales" | "inspection_revenue" | "service_revenue" | "parts_sales" | "other_revenue" | "taxes_collected" | "total_revenue"
  | "company_share" | "technician_commission" | "technician_travel" | "paid_earnings" | "reclaims" | "spare_parts_cost" | "operational_expenses"
  | "total_expenses" | "net_operating_result" | "payments_received" | "outstanding_customer" | "outstanding_technician",
  number
>;

export async function getAccountsSummary(from: string, to: string): Promise<{ data: AccountsSummary | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accounts_summary", { p_from: from, p_to: to });
  if (error) return { data: null, error: error.message };
  const raw = data as Record<string, number | string>;
  return { data: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)])) as AccountsSummary, error: null };
}
