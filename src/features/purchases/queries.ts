import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VariantOption } from "./shared";

export type PurchaseBillRow = {
  id: string;
  bill_number: string;
  supplier_name: string;
  supplier_bill_no: string | null;
  bill_date: string;
  total_paise: number;
  paid_paise: number;
  tax_paise: number;
  item_count: number;
};

export async function listPurchaseBills(opts: { q?: string; month?: string } = {}): Promise<PurchaseBillRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_bills")
    .select("id, bill_number, supplier_name, supplier_bill_no, bill_date, total_paise, paid_paise, tax_paise, purchase_bill_items(count)")
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    const [y, m] = opts.month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    query = query.gte("bill_date", `${opts.month}-01`).lt("bill_date", end);
  }
  const q = opts.q?.replace(/[%_,()]/g, " ").trim();
  if (q) query = query.or(`supplier_name.ilike.%${q}%,supplier_bill_no.ilike.%${q}%,bill_number.ilike.%${q}%`);
  const { data } = await query;
  return ((data ?? []) as unknown as (Omit<PurchaseBillRow, "item_count"> & { purchase_bill_items: { count: number }[] })[]).map((b) => ({
    ...b,
    total_paise: Number(b.total_paise),
    paid_paise: Number(b.paid_paise),
    tax_paise: Number(b.tax_paise),
    item_count: b.purchase_bill_items?.[0]?.count ?? 0,
  }));
}

export async function getPurchaseBill(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_bills")
    .select("*, purchase_bill_items(id, description, quantity, unit_cost_paise, gst_rate, line_total_paise, position, variant_id, variant:product_variants(sku, product:products(id, name)))")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const imageUrl = data.image_path
    ? ((await supabase.storage.from("business-docs").createSignedUrl(data.image_path as string, 60 * 30)).data?.signedUrl ?? null)
    : null;
  return { ...data, imageUrl } as typeof data & { imageUrl: string | null };
}

/** Every active product variant, for picking which product a bill line stocks. */
export async function getVariantOptions(): Promise<VariantOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_variants")
    .select("id, sku, name, is_active, product:products!inner(name, status)")
    .neq("product.status", "archived")
    .order("sku")
    .limit(5000);
  return ((data ?? []) as unknown as { id: string; sku: string; name: string; is_active: boolean; product: { name: string } }[]).map((v) => ({
    id: v.id,
    sku: v.sku,
    product: v.product.name,
    label: v.name && v.name !== "Default" ? `${v.product.name} · ${v.name}` : v.product.name,
  }));
}

export async function getSuppliers(): Promise<{ id: string; name: string; gstin: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name, gstin").eq("is_active", true).order("name").limit(500);
  return (data ?? []) as { id: string; name: string; gstin: string | null }[];
}
