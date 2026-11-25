/**
 * Purchases (supplier bills). Shared by the form (browser) and the server.
 * Costs are entered BEFORE GST; GST is added per line; the database recomputes totals.
 */

export const GST_RATES = [0, 5, 12, 18, 28, 3, 0.25] as const;
export const PURCHASE_PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "credit", label: "On credit (pay later)" },
  { value: "other", label: "Other" },
] as const;

/** A product variant that a bill line can add stock to. */
export type VariantOption = { id: string; label: string; sku: string; product: string };

/** What the AI (or the admin) reads from a bill. Money in rupees. */
export type BillDraft = {
  supplier_name: string;
  supplier_gstin: string;
  supplier_bill_no: string;
  bill_date: string;
  other_charges: number;
  total: number;
  items: { description: string; quantity: number; unit_cost: number; gst_rate: number; amount: number }[];
};

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !["the", "for", "and", "with", "kids", "pcs", "nos", "qty"].includes(w));

/**
 * Best product variant for a bill line: an SKU written on the line wins; otherwise the
 * variant whose product name and variant words overlap most (at least half of the
 * product name). Returns null when nothing is a confident match (the admin picks).
 */
export function matchVariant(description: string, options: VariantOption[]): VariantOption | null {
  const text = description.toLowerCase();
  const bySku = options.find((o) => o.sku.length >= 4 && text.includes(o.sku.toLowerCase()));
  if (bySku) return bySku;
  const line = new Set(words(description));
  let best: { o: VariantOption; score: number } | null = null;
  for (const o of options) {
    const productWords = words(o.product);
    if (!productWords.length) continue;
    const hitProduct = productWords.filter((w) => line.has(w)).length / productWords.length;
    if (hitProduct < 0.5) continue;
    const variantWords = words(o.label).filter((w) => !productWords.includes(w));
    const hitVariant = variantWords.length ? variantWords.filter((w) => line.has(w)).length / variantWords.length : 0;
    const score = hitProduct * 2 + hitVariant;
    if (!best || score > best.score) best = { o, score };
  }
  return best?.o ?? null;
}

/** Nearest allowed GST rate (bills sometimes print 12.00 or 0.12). */
export function normaliseGst(rate: number): number {
  const r = rate > 0 && rate < 1 ? rate * 100 : rate;
  return [...GST_RATES].sort((a, b) => Math.abs(a - r) - Math.abs(b - r))[0];
}
