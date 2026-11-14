import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InvoiceItem = { id: string; description: string; quantity: number; unit_price: number; line_total: number };
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
  payment_status: "unpaid" | "paid";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  items: InvoiceItem[];
};

const SELECT = "*, items:service_invoice_items(id, description, quantity, unit_price, line_total, position)";

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
