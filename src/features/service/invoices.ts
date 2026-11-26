import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InvoiceItem = { id: string; description: string; quantity: number; unit_price: number; line_total: number; kind: "additional" | "spare_part" };
export type ServiceInvoice = {
  id: string;
  invoice_number: string;
  booking_id: string;
  customer_name: string;
  customer_mobile: string;
  customer_address: string;
  product: string;
  service_description: string | null;
  basic_charge: number;
  labour_charge: number;
  items_total: number;
  subtotal: number;
  discount: number;
  tax_percent: number;
  tax_amount: number;
  grand_total: number;
  payment_method: string | null;
  payment_status: "unpaid" | "partial" | "paid";
  spare_parts_total: number;
  additional_total: number;
  amount_paid: number;
  balance: number;
  approval_status: "draft" | "approved";
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  items: InvoiceItem[];
};

const SELECT = "*, items:service_invoice_items(id, description, quantity, unit_price, line_total, position, kind)";

function normalise(row: unknown): ServiceInvoice | null {
  if (!row) return null;
  const r = row as ServiceInvoice & { items: (InvoiceItem & { position: number })[] };
  return { ...r, tax_percent: Number(r.tax_percent), items: [...(r.items ?? [])].sort((a, b) => a.position - b.position) };
}

export async function getInvoiceForBooking(bookingId: string): Promise<ServiceInvoice | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_invoices").select(SELECT).eq("booking_id", bookingId).maybeSingle();
  return normalise(data);
}

export async function getInvoice(id: string): Promise<ServiceInvoice | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_invoices").select(SELECT).eq("id", id).maybeSingle();
  return normalise(data);
}

/** Default basic charge in paise (Admin → Settings). */
export async function getDefaultBasicCharge(): Promise<number> {
  const supabase = await createClient();
  // BEST FIT → Service Charge Settings (active for today) wins over the old single setting.
  const today = new Date().toISOString().slice(0, 10);
  const { data: sc } = await supabase
    .from("service_charge_settings")
    .select("amount_paise, effective_to")
    .eq("is_active", true)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(5);
  const current = ((sc ?? []) as { amount_paise: number; effective_to: string | null }[]).find((s) => !s.effective_to || s.effective_to >= today);
  if (current) return current.amount_paise;
  const { data } = await supabase.from("store_settings").select("value").eq("key", "service.basic_charge").maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return typeof v === "number" ? v : 0;
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;

export type ReplacedRow = {
  id: string;
  part_id: string | null;
  custom_name: string | null;
  quantity: number;
  unit_price_paise: number;
  approval_status: "pending" | "approved" | "rejected";
  master_request: "none" | "requested" | "added" | "declined";
  added_at: string;
  spare_parts: { name: string; sku: string } | null;
};

/** Parts replaced on a booking (RLS: same people who can see the booking). */
export async function getReplacedItems(bookingId: string): Promise<ReplacedRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_replaced_items")
    .select("id, part_id, custom_name, quantity, unit_price_paise, approval_status, master_request, added_at, spare_parts(name, sku)")
    .eq("booking_id", bookingId)
    .order("added_at");
  return (data ?? []) as unknown as ReplacedRow[];
}

export const replacedName = (r: ReplacedRow) => r.spare_parts?.name ?? r.custom_name ?? "Item";
