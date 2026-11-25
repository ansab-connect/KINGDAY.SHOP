"use server";

import { z } from "zod";
import { assertCan } from "@/features/auth/session";
import { extractJson, geminiGenerate, type GeminiSource } from "@/lib/gemini";

/**
 * AI Product Assistant (Update 01, section 22) on Google Gemini with Google Search.
 * Returns structured details for the admin to REVIEW; nothing is saved or published here.
 * Rules given to the model and enforced below: never invent specs ("Not verified"),
 * never take prices, stock or SKUs from the web, show the pages it used.
 */

const reply = z.object({
  name: z.string().max(160).catch(""),
  category: z.string().max(120).catch(""),
  brand: z.string().max(120).catch(""),
  short_description: z.string().max(300).catch(""),
  description: z.string().max(5000).catch(""),
  key_features: z.array(z.string().max(120)).max(12).catch([]),
  specifications: z.array(z.object({ name: z.string().max(60), value: z.string().max(200) })).max(40).catch([]),
  age_group: z.string().max(40).catch(""),
  seo_title: z.string().max(70).catch(""),
  seo_description: z.string().max(170).catch(""),
  keywords: z.array(z.string().max(40)).max(15).catch([]),
  /** Other size categories (exact names from the list) the product is also sold in. */
  extra_categories: z.array(z.string().max(120)).max(20).catch([]),
  /** Price per size, ONLY when written in the owner's text. */
  size_prices: z
    .array(z.object({ category: z.string().max(120), mrp: z.coerce.number().min(0).max(10000000).catch(0), price: z.coerce.number().min(0).max(10000000).catch(0), stock: z.coerce.number().int().min(0).max(100000).nullable().catch(null) }))
    .max(20)
    .catch([]),
  /** Variant types and values written in the owner's text, e.g. Speed Type: Single Speed, Multi Speed. */
  variant_types: z.array(z.object({ name: z.string().max(30), values: z.array(z.string().max(40)).max(12) })).max(4).catch([]),
  /** Only when written in the owner's text. */
  gst_rate: z.coerce.number().nullable().catch(null),
  hsn_code: z.string().max(10).catch(""),
  not_verified: z.array(z.string().max(80)).max(20).catch([]),
  conflicts: z.array(z.string().max(200)).max(10).catch([]),
});
export type AiProductDraft = z.infer<typeof reply> & { sources: GeminiSource[] };

export type AiAssistResult = { ok: true; draft: AiProductDraft } | { ok: false; error: string };

const UNKNOWN = /^(not (provided|verified|available|specified)|unknown|n\/?a|-)$/i;

export async function aiProductAssistAction(input: { text: string; categories: string[]; brands: string[] }): Promise<AiAssistResult> {
  try {
    await assertCan("products", "create");
  } catch {
    return { ok: false, error: "You don't have permission to add products." };
  }
  const parsed = z
    .object({ text: z.string().trim().min(3, "Type the product name or paste its description.").max(8000), categories: z.array(z.string().max(120)).max(60), brands: z.array(z.string().max(120)).max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the text." };
  const { text, categories, brands } = parsed.data;

  const system = [
    "You help KING DAY, a kids' ride-on and toy shop in Kerala, India, prepare product listings.",
    "Use Google Search to check the product on the manufacturer's site, official catalogues or reliable product pages.",
    "Rules:",
    "- Never invent a specification. If you cannot confirm it, leave it out and list its name in not_verified.",
    "- If sources disagree, say so in conflicts (e.g. 'Battery: 12V 7Ah on maker site, 12V 4.5Ah on seller page').",
    "- Never take prices, MRP, stock, SKU or purchase cost from the web. Only size_prices may hold prices and stock, and ONLY when they are written in the shop owner's text.",
    "- Sizes: if the text lists several wheel sizes (e.g. 24\", 26\", 27.5\"), put the main one in category and the rest in extra_categories, using exact category names from the list.",
    "- variant_types: only real customer choices written in the text (e.g. Speed Type: Single Speed, Multi Speed; Colour: Red, Blue). Never put sizes here when they are categories.",
    "- No repetition between fields: short_description must not repeat the product name or any heading; description must not repeat the short description or the name; key_features must not repeat sentences from short_description; drop labels such as 'Short description:', 'Key features:'.",
    "- Write for Indian parents, simple English, no exaggeration, no competitor names.",
    `- category must be exactly one of: ${categories.join(" | ") || "(none)"} (or empty).`,
    `- brand must be exactly one of: ${brands.slice(0, 80).join(" | ") || "(none)"} (or empty).`,
    "- Prefer these specification names when relevant: Battery, Motor, Weight capacity, Dimensions, Charging time, Max speed, Remote control, Material, Age group.",
    "Reply with ONLY a JSON object with keys: name, category, brand, short_description (max 280 chars), description (2-4 short paragraphs),",
    "key_features (string[]), specifications ({name,value}[]), age_group, seo_title (max 60), seo_description (max 155), keywords (string[]),",
    "not_verified (string[]), conflicts (string[]), extra_categories (string[]), size_prices ({category,mrp,price,stock}[]), variant_types ({name,values}[]), gst_rate (number or null), hsn_code (string).",
    "- gst_rate and hsn_code: ONLY when written in the owner's text; otherwise null and \"\".",
  ].join("\n");

  const ask = `Product information from the shop owner:\n\n${text}`;
  let res = await geminiGenerate({ system, messages: [{ role: "user", text: ask }], search: true, maxTokens: 8192 });
  // Google Search isn't part of every free plan: fall back to the owner's text only (no sources).
  if (!res.ok && res.error === "limit") {
    res = await geminiGenerate({
      system: `${system}\nYou CANNOT search the web right now. Use ONLY the shop owner's text; put every specification you cannot read from it in not_verified.`,
      messages: [{ role: "user", text: ask }],
      maxTokens: 8192,
    });
  }
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.error === "not_configured"
          ? "The AI assistant isn't set up yet (Gemini key missing). Use Smart fill for now."
          : res.error === "limit"
            ? "The AI's free daily limit is used up. Try again later, or use Smart fill."
            : "The AI didn't answer. Try again, or use Smart fill.",
    };
  }
  const data = reply.safeParse(extractJson(res.text));
  if (!data.success) return { ok: false, error: "The AI's answer couldn't be read. Try again, or use Smart fill." };
  const d = data.data;

  // Defensive clean-up: drop "unknown" placeholders and anything that looks like a price, stock or SKU.
  const pricey = /\b(price|mrp|₹|rs\.?|inr|stock|sku|cost)\b/i;
  const specifications = d.specifications.filter((s) => s.name.trim() && s.value.trim() && !UNKNOWN.test(s.value.trim()) && !pricey.test(s.name));
  return {
    ok: true,
    draft: {
      ...d,
      category: categories.includes(d.category) ? d.category : "",
      extra_categories: d.extra_categories.filter((c) => categories.includes(c) && c !== d.category),
      // Prices only when the owner's text has them (a model can't invent a number that isn't there).
      size_prices: d.size_prices.filter((sp) => categories.includes(sp.category) && sp.price > 0 && text.replace(/[,\s]/g, "").includes(String(Math.round(sp.price)))),
      gst_rate: d.gst_rate !== null && [0, 0.25, 3, 5, 12, 18, 28].includes(d.gst_rate) && /gst|tax/i.test(text) ? d.gst_rate : null,
      hsn_code: /^[0-9]{4,8}$/.test(d.hsn_code.trim()) && text.includes(d.hsn_code.trim()) ? d.hsn_code.trim() : "",
      variant_types: d.variant_types.filter((vt) => vt.name.trim() && vt.values.filter((v) => v.trim()).length >= 2),
      brand: brands.includes(d.brand) ? d.brand : "",
      age_group: UNKNOWN.test(d.age_group.trim()) ? "" : d.age_group,
      key_features: d.key_features.filter((f) => f.trim() && !pricey.test(f)),
      specifications,
      sources: res.sources.slice(0, 8),
    },
  };
}
