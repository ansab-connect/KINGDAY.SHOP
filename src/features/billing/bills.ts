import "server-only";
import { createClient } from "@/lib/supabase/server";

export type BillKind = "sale" | "service";

export const BILL_PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
  { value: "mixed", label: "Split" },
] as const;

export type BillRow = {
  id: string;
  bill_number: string;
  kind: BillKind;
  status: "active" | "cancelled";
  customer_code: string | null;
  customer_name: string;
  customer_phone: string | null;
  grand_total: number;
  amount_paid: number;
  payment_method: string | null;
  payment_status: "paid" | "partial" | "unpaid";
  created_at: string;
};

export type Bill = BillRow & {
  customer_address: string | null;
  vehicle: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  cancel_reason: string | null;
  cancelled_at: string | null;
  payments: { method: string; amount: number; reference: string | null; position: number }[];
  items: { id: string; position: number; sku: string | null; description: string; quantity: number; unit_price: number; line_total: number; warranty: string | null; cycle_size: string | null }[];
};

export async function listBills(filters: { kind?: string; q?: string } = {}): Promise<BillRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bills")
    .select("id, bill_number, kind, status, customer_code, customer_name, customer_phone, grand_total, amount_paid, payment_method, payment_status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.kind === "sale" || filters.kind === "service") query = query.eq("kind", filters.kind);
  const q = filters.q?.replace(/[%_,()]/g, " ").trim().slice(0, 60);
  if (q) query = query.or(`bill_number.ilike.%${q}%,customer_code.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Loading bills: ${error.message}`);
  return (data ?? []) as BillRow[];
}

export async function getBill(id: string): Promise<Bill | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .select("*, items:bill_items(id, position, sku, description, quantity, unit_price, line_total, warranty, cycle_size), payments:bill_payments(method, amount, reference, position)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading bill: ${error.message}`);
  if (!data) return null;
  const b = data as Bill;
  return { ...b, items: [...b.items].sort((a, c) => a.position - c.position), payments: [...(b.payments ?? [])].sort((a, c) => a.position - c.position) };
}
