"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { assertCan } from "@/features/auth/session";
import { CATALOG_TAG } from "@/features/catalog/cache-tags";
import { extractJson, geminiGenerate, isGeminiConfigured } from "@/lib/gemini";
import { createClient } from "@/lib/supabase/server";
import { GST_RATES, normaliseGst, type BillDraft } from "./shared";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const rupees = z.coerce.number().min(0, "Can't be negative.").max(10_000_000);
const toPaise = (r: number) => Math.round(r * 100);

const lineSchema = z.object({
  variant_id: z.union([z.literal(""), z.uuid()]).default(""),
  description: z.string().trim().min(1, "Describe the item.").max(200),
  quantity: z.coerce.number().int("Whole numbers only.").min(1, "At least 1.").max(100000),
  unit_cost: rupees,
  gst_rate: z.coerce.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "Choose a GST rate."),
});

const billSchema = z.object({
  supplier_id: z.union([z.literal(""), z.uuid()]).default(""),
  supplier_name: z.string().trim().min(1, "Enter the supplier.").max(120),
  supplier_gstin: z
    .string()
    .trim()
    .toUpperCase()
    .max(15)
    .refine((v) => !v || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "GSTIN is 15 characters, e.g. 32ABCDE1234F1Z5.")
    .default(""),
  supplier_bill_no: z.string().trim().max(60).default(""),
  bill_date: z.iso.date("Choose the bill date."),
  payment_mode: z.enum(["", "cash", "upi", "card", "bank", "credit", "other"]).default(""),
  paid: rupees.default(0),
  other_charges: z.coerce.number().min(-1_000_000).max(10_000_000).default(0),
  image_path: z.union([z.literal(""), z.string().regex(/^purchases\/[a-z0-9-]{8,80}\.(jpe?g|png|webp|pdf)$/)]).default(""),
  notes: z.string().trim().max(2000).default(""),
  save_supplier: z.boolean().default(false),
  items: z.array(lineSchema).min(1, "Add at least one item.").max(200),
});
export type PurchaseInput = z.input<typeof billSchema>;

/** Save the bill and add stock for every line linked to a product. */
export async function recordPurchaseAction(input: PurchaseInput): Promise<Result<{ id: string }> & { fieldErrors?: Record<string, string> }> {
  try {
    await assertCan("purchases", "create");
  } catch {
    return { ok: false, error: "You don't have permission to record purchases." };
  }
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const supabase = await createClient();

  // New supplier typed by hand: keep it for next time.
  let supplierId = v.supplier_id;
  if (!supplierId && v.save_supplier) {
    const { data: s } = await supabase.from("suppliers").insert({ name: v.supplier_name.slice(0, 120), gstin: v.supplier_gstin || null }).select("id").single();
    supplierId = (s?.id as string | undefined) ?? "";
  }

  const { data, error } = await supabase.rpc("record_purchase_bill", {
    p: {
      supplier_id: supplierId,
      supplier_name: v.supplier_name,
      supplier_gstin: v.supplier_gstin,
      supplier_bill_no: v.supplier_bill_no,
      bill_date: v.bill_date,
      payment_mode: v.payment_mode,
      paid_paise: toPaise(v.paid),
      other_charges_paise: toPaise(v.other_charges),
      image_path: v.image_path,
      notes: v.notes,
      items: v.items.map((i) => ({ variant_id: i.variant_id, description: i.description, quantity: i.quantity, unit_cost_paise: toPaise(i.unit_cost), gst_rate: i.gst_rate })),
    },
  });
  if (error) {
    return {
      ok: false,
      error: /not authorized/i.test(error.message)
        ? "You don't have permission to record purchases."
        : /unknown variant/i.test(error.message)
          ? "One of the products no longer exists. Pick it again."
          : "Couldn't save the purchase. Please try again.",
    };
  }
  updateTag(CATALOG_TAG); // stock changed
  return { ok: true, data: { id: data as string } };
}

const aiBill = z.object({
  supplier_name: z.string().max(120).catch(""),
  supplier_gstin: z.string().max(20).catch(""),
  bill_no: z.string().max(60).catch(""),
  bill_date: z.string().max(20).catch(""),
  other_charges: z.coerce.number().catch(0),
  total: z.coerce.number().catch(0),
  items: z
    .array(
      z.object({
        description: z.string().max(200).catch(""),
        quantity: z.coerce.number().catch(1),
        unit_cost: z.coerce.number().catch(0),
        gst_rate: z.coerce.number().catch(0),
        amount: z.coerce.number().catch(0),
      }),
    )
    .max(200)
    .catch([]),
});

/**
 * "Import bill": read a supplier bill photo (already uploaded to business-docs/purchases/)
 * with Gemini. Returns a draft for the admin to check; nothing is saved here.
 */
export async function readBillPhotoAction(path: string): Promise<Result<BillDraft>> {
  try {
    await assertCan("purchases", "create");
  } catch {
    return { ok: false, error: "You don't have permission to record purchases." };
  }
  if (!/^purchases\/[a-z0-9-]{8,80}\.(jpe?g|png|webp)$/.test(path)) return { ok: false, error: "Upload a photo (JPG, PNG or WebP) of the bill." };
  if (!isGeminiConfigured()) return { ok: false, error: "The AI isn't set up (Gemini key missing). Fill the bill by hand." };

  const supabase = await createClient();
  const { data: file, error } = await supabase.storage.from("business-docs").download(path);
  if (error || !file) return { ok: false, error: "Couldn't open the photo. Try uploading it again." };
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mimeType = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";

  const system = [
    "You read supplier purchase bills (Indian GST tax invoices) for KING DAY, a kids' ride-on and bicycle shop.",
    "Copy what is printed. Never invent a value; leave it empty (or 0) when you can't read it.",
    "items: one entry per product line. quantity = number of units. unit_cost = rate per unit BEFORE GST (taxable value ÷ quantity when only totals are printed).",
    "gst_rate = total GST % for the line (CGST + SGST, or IGST), e.g. 12 or 18. amount = taxable amount of the line before GST.",
    "Skip lines for totals, round-off, CGST/SGST summaries. Put freight/packing/round-off in other_charges (can be negative).",
    "bill_date as YYYY-MM-DD. supplier_gstin = the SELLER's 15-character GSTIN (not the buyer's).",
    "Reply with ONLY JSON: {supplier_name, supplier_gstin, bill_no, bill_date, other_charges, total, items:[{description, quantity, unit_cost, gst_rate, amount}]}",
  ].join("\n");
  const res = await geminiGenerate({ system, messages: [{ role: "user", text: "Read this purchase bill.", images: [{ mimeType, data }] }], maxTokens: 8192, temperature: 0 });
  if (!res.ok) {
    return {
      ok: false,
      error: res.error === "limit" ? "The AI's free daily limit is used up. Fill the bill by hand, or try later." : "The AI couldn't read the bill. Try a clearer photo, or fill it by hand.",
    };
  }
  const parsed = aiBill.safeParse(extractJson(res.text));
  if (!parsed.success || !parsed.data.items.length) return { ok: false, error: "No items could be read from this photo. Try a clearer, straight photo of the whole bill." };
  const b = parsed.data;
  const gstin = b.supplier_gstin.replace(/\s/g, "").toUpperCase();
  return {
    ok: true,
    data: {
      supplier_name: b.supplier_name.trim(),
      supplier_gstin: /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin) ? gstin : "",
      supplier_bill_no: b.bill_no.trim(),
      bill_date: /^\d{4}-\d{2}-\d{2}$/.test(b.bill_date) ? b.bill_date : "",
      other_charges: Number.isFinite(b.other_charges) ? b.other_charges : 0,
      total: Number.isFinite(b.total) ? b.total : 0,
      items: b.items
        .filter((i) => i.description.trim())
        .map((i) => {
          const quantity = Math.max(1, Math.round(i.quantity) || 1);
          const unit = i.unit_cost > 0 ? i.unit_cost : i.amount > 0 ? i.amount / quantity : 0;
          return { description: i.description.trim(), quantity, unit_cost: Math.round(unit * 100) / 100, gst_rate: normaliseGst(i.gst_rate || 0), amount: i.amount };
        }),
    },
  };
}
