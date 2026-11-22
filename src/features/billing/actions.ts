"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { can, getCurrentUser, hasRole } from "@/features/auth/session";
import { formatMobile, mobileLoginEmail, normalizeMobile } from "@/features/customer/mobile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const paise = z.number().int().min(0).max(10_000_000);

const METHOD = z.enum(["cash", "upi", "card", "bank_transfer", "other"]);

const billSchema = z.object({
  kind: z.enum(["sale", "service"]),
  customer_id: z.uuid().nullable(),
  customer_name: z.string().trim().min(1, "Enter the customer's name.").max(120),
  customer_phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => !v || /^\+?[0-9 ]{7,20}$/.test(v), "Enter a valid phone number."),
  customer_address: z.string().trim().max(500),
  vehicle: z.string().trim().max(200),
  note: z.string().trim().max(1000),
  discount: paise,
  /** Split payment: e.g. ₹500 cash + ₹1,000 UPI. */
  payments: z.array(z.object({ method: METHOD, amount: paise, reference: z.string().trim().max(80) })).max(6),
  items: z
    .array(
      z.object({
        variant_id: z.uuid().nullable(),
        description: z.string().trim().max(200),
        quantity: z.number().int().min(1, "Quantity must be at least 1.").max(999),
        unit_price: paise,
      }),
    )
    .min(1, "Add at least one item.")
    .max(60),
});

export type BillInput = z.input<typeof billSchema>;
export type CreateBillResult = { ok: true; id: string; number: string } | { ok: false; error: string };

function mayBill(user: Awaited<ReturnType<typeof getCurrentUser>>, kind: "sale" | "service") {
  if (!user || !hasRole(user, "staff")) return false;
  return kind === "sale"
    ? can(user, "orders", "create") || can(user, "orders", "edit")
    : can(user, "billing", "create") || can(user, "service", "edit");
}

/** Creates a Sale or Service bill. Totals and stock are handled by the database. */
export async function createBillAction(input: BillInput): Promise<CreateBillResult> {
  const me = await getCurrentUser();
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the bill." };
  const p = parsed.data;
  if (!mayBill(me, p.kind)) return { ok: false, error: "You don't have permission to make this bill." };
  if (p.items.some((i) => !i.variant_id && !i.description)) return { ok: false, error: "Describe each item." };
  if (p.kind === "service" && p.items.some((i) => i.variant_id)) return { ok: false, error: "Products can only go on a sale bill." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_bill", { p });
  if (error) {
    const m = error.message;
    return {
      ok: false,
      error: /not authorized/i.test(m)
        ? "You don't have permission to make this bill."
        : /not enough stock/i.test(m)
          ? m.replace(/^.*?not enough stock/i, "Not enough stock").replace(/: (\d+) available/, " — only $1 available.")
          : /discount/i.test(m)
            ? "The discount is larger than the total."
            : /amount paid/i.test(m)
              ? "Amount paid is more than the total."
              : /how the customer paid/i.test(m)
                ? "Choose how the customer paid."
                : /unknown customer/i.test(m)
                  ? "That customer ID wasn't found."
                  : "Couldn't save the bill. Please try again.",
    };
  }
  const r = data as { id: string; number: string };
  return { ok: true, id: r.id, number: r.number };
}

export async function cancelBillAction(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me || !hasRole(me, "staff")) return { ok: false, error: "Please sign in again." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Invalid bill." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_bill", { p_id: id, p_reason: reason.slice(0, 300) });
  if (error) return { ok: false, error: /not authorized/i.test(error.message) ? "You don't have permission to cancel this bill." : "Couldn't cancel the bill." };
  return { ok: true };
}

export type BillProductHit = { variantId: string; name: string; sku: string; price: number; available: number; image: string | null };

/** Product search for the sale bill (name or SKU). */
export async function searchBillProductsAction(q: string): Promise<BillProductHit[]> {
  const me = await getCurrentUser();
  if (!mayBill(me, "sale")) return [];
  const term = q.replace(/[%_,()]/g, " ").trim().slice(0, 60);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const [byName, bySku] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, sku, name, price, is_active, inventory(on_hand, reserved), product:products!inner(name, status)")
      .ilike("product.name", `%${term}%`)
      .eq("is_active", true)
      .neq("product.status", "archived")
      .limit(20),
    supabase
      .from("product_variants")
      .select("id, sku, name, price, is_active, inventory(on_hand, reserved), product:products!inner(name, status)")
      .ilike("sku", `%${term}%`)
      .eq("is_active", true)
      .limit(10),
  ]);
  type Raw = { id: string; sku: string; name: string; price: number; inventory: { on_hand: number; reserved: number } | null; product: { name: string; status: string } };
  const seen = new Set<string>();
  return ([...(byName.data ?? []), ...(bySku.data ?? [])] as unknown as Raw[])
    .filter((v) => !seen.has(v.id) && seen.add(v.id))
    .slice(0, 20)
    .map((v) => ({
      variantId: v.id,
      name: v.name && v.name !== "Default" ? `${v.product.name} (${v.name})` : v.product.name,
      sku: v.sku,
      price: v.price,
      available: Math.max(0, (v.inventory?.on_hand ?? 0) - (v.inventory?.reserved ?? 0)),
      image: null,
    }));
}


/** addresses: known addresses for this customer, most useful first (last bill, then saved ones). */
export type BillCustomerHit = { id: string; code: string; name: string; phone: string; addresses: string[] };

type AddressRow = { user_id: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; postal_code: string };
const addressText = (a: AddressRow) =>
  [a.line1, a.line2, a.landmark ? `Near ${a.landmark}` : null, `${a.city}, ${a.state} ${a.postal_code}`].filter(Boolean).join(", ");

/** Parses what was typed: a Customer ID (1–6 digits, "KD-CUS-000012") or a mobile number (7+ digits). */
function parseCustomerQuery(q: string): { code: string } | { mobile: string } | null {
  const t = q.replace(/\s/g, "").toUpperCase();
  const id = t.match(/^(?:KD-?)?(?:CUS-?)?(\d{1,6})$/);
  if (id) return { code: `KD-CUS-${id[1].padStart(6, "0")}` };
  const digits = t.replace(/^\+/, "");
  if (/^\d{7,15}$/.test(digits)) return { mobile: digits.length > 10 ? digits.slice(-10) : digits };
  return null;
}

/** Addresses used on this customer's earlier bills (newest first), then their saved account addresses. */
async function knownAddresses(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, string[]>> {
  const [{ data: bills }, { data: addrs }] = await Promise.all([
    supabase.from("bills").select("customer_id, customer_address").in("customer_id", ids).not("customer_address", "is", null).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("addresses")
      .select("user_id, line1, line2, landmark, city, state, postal_code")
      .in("user_id", ids)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const out = new Map<string, string[]>();
  const add = (id: string, text: string | null) => {
    const t = text?.trim();
    if (!t) return;
    const list = out.get(id) ?? [];
    if (!list.some((x) => x.toLowerCase() === t.toLowerCase()) && list.length < 5) out.set(id, [...list, t]);
  };
  for (const b of (bills ?? []) as { customer_id: string; customer_address: string | null }[]) add(b.customer_id, b.customer_address);
  for (const a of (addrs ?? []) as AddressRow[]) add(a.user_id, addressText(a));
  return out;
}

/** Find a customer by Customer ID or mobile number (both unique), with the addresses we know. */
export async function searchBillCustomersAction(q: string): Promise<BillCustomerHit[]> {
  const me = await getCurrentUser();
  if (!mayBill(me, "sale") && !mayBill(me, "service")) return [];
  const parsed = parseCustomerQuery(q.slice(0, 30));
  if (!parsed) return [];
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, phone, customer_code").not("customer_code", "is", null);
  // Full 10-digit mobile = exact match; fewer digits = numbers that end with them.
  query =
    "code" in parsed
      ? query.eq("customer_code", parsed.code)
      : parsed.mobile.length === 10
        ? query.eq("mobile_e164", `+91${parsed.mobile}`)
        : query.like("mobile_e164", `%${parsed.mobile}`);
  const { data } = await query.order("customer_code").limit(10);
  type P = { id: string; full_name: string | null; phone: string | null; customer_code: string };
  const people = (data ?? []) as P[];
  if (!people.length) return [];
  const known = await knownAddresses(supabase, people.map((p) => p.id));
  return people.map((p) => ({ id: p.id, code: p.customer_code, name: p.full_name ?? "", phone: p.phone ?? "", addresses: known.get(p.id) ?? [] }));
}

/** The Customer ID a new customer will get next (e.g. KD-CUS-000012). */
export async function nextCustomerCodeAction(): Promise<string | null> {
  const me = await getCurrentUser();
  if (!mayBill(me, "sale") && !mayBill(me, "service")) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_customer_code");
  return (data as string | null) ?? null;
}

const newCustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(120),
  mobile: z.string().trim().max(20),
  /** Optional: just the town is fine. It goes on the bill and comes back next time. */
  address: z.string().trim().max(500),
});

/**
 * Creates a customer account from the billing counter (one account per mobile, like
 * registering on the website). If the mobile already has an account, that customer is
 * returned instead. The customer can set a password later.
 */
export async function createBillCustomerAction(input: {
  name: string;
  mobile: string;
  address: string;
}): Promise<{ ok: true; customer: BillCustomerHit; existed: boolean } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!mayBill(me, "sale") && !mayBill(me, "service")) return { ok: false, error: "You don't have permission to add customers." };
  const parsed = newCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const mobile = normalizeMobile(parsed.data.mobile);
  if (!mobile) return { ok: false, error: "Enter a valid mobile number for the new customer." };
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Adding customers isn't available right now." };
  }

  const typed = parsed.data.address;
  const found = async (): Promise<BillCustomerHit | null> => {
    const { data } = await admin.from("profiles").select("id, full_name, phone, customer_code").eq("mobile_e164", mobile).maybeSingle();
    const p = data as { id: string; full_name: string | null; phone: string | null; customer_code: string | null } | null;
    if (!p?.customer_code) return null;
    const known = (await knownAddresses(admin as unknown as Awaited<ReturnType<typeof createClient>>, [p.id])).get(p.id) ?? [];
    // The address typed now comes first, so it's the one on this bill.
    const addresses = typed ? [typed, ...known.filter((a) => a.toLowerCase() !== typed.toLowerCase())] : known;
    return { id: p.id, code: p.customer_code, name: p.full_name ?? "", phone: p.phone ?? "", addresses };
  };
  const existing = await found();
  if (existing) return { ok: true, customer: existing, existed: true };

  const { data: created, error } = await admin.auth.admin.createUser({
    email: mobileLoginEmail(mobile),
    password: `${randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.name, created_by: "billing" },
  });
  if (error || !created.user) {
    const again = await found();
    return again ? { ok: true, customer: again, existed: true } : { ok: false, error: "Couldn't add the customer. Please try again." };
  }
  await admin.from("profiles").update({ full_name: parsed.data.name, phone: formatMobile(mobile) }).eq("id", created.user.id);
  const made = await found();
  if (!made) return { ok: false, error: "Customer added, but the ID couldn't be read. Search again." };
  return { ok: true, customer: { ...made, name: parsed.data.name }, existed: false };
}
