"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { OFFICIAL_WHATSAPP_DISPLAY, storeContact } from "@/config/storefront";
import { getAllCategories, getAllProducts } from "@/features/catalog/queries";
import { geminiGenerate } from "@/lib/gemini";
import { formatPaise } from "@/lib/format";

/**
 * Customer help chat on Google Gemini. It answers ONLY from KING DAY's own data (products
 * from the database, store facts below); no web search, no made-up prices or stock. When it
 * can't answer it sends the customer to WhatsApp. Public, so inputs are capped and rate-limited.
 */

const input = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(12),
});

// Soft per-visitor limit (per server instance): 20 messages per 10 minutes.
const hits = new Map<string, number[]>();
function allowed(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

async function storeKnowledge(): Promise<string> {
  const [products, categories] = await Promise.all([getAllProducts(), getAllCategories()]);
  const lines = products.slice(0, 150).map((p) => {
    const stock = p.stock <= 0 ? "out of stock" : p.stock <= 5 ? `only ${p.stock} left` : "in stock";
    const specs = p.specs.slice(0, 6).map((s) => `${s.label}: ${s.value}`).join("; ");
    return `- ${p.name} | ${p.category.name} | ${formatPaise(p.price)}${p.mrp > p.price ? ` (MRP ${formatPaise(p.mrp)})` : ""} | ${stock}${p.ageRange ? ` | age ${p.ageRange}` : ""} | ${siteConfig.url}/products/${p.slug}${specs ? ` | ${specs}` : ""}`;
  });
  return [
    "STORE FACTS",
    `- KING DAY sells kids' electric jeeps, cars, bikes, scooters, cycles, toys and baby accessories. Website ${siteConfig.url}.`,
    `- Office: ${storeContact.address}. WhatsApp ${OFFICIAL_WHATSAPP_DISPLAY}. Email ${storeContact.email}.`,
    "- Payment: cash on delivery. After an order, the team calls to confirm the delivery date. Online payment is not available yet.",
    "- Ordering: add to cart and check out on the website, or order on WhatsApp.",
    "- BEST FIT is our service & fitting department: book at /book-service. We inspect first, then share the cost; no date needs to be picked. Customers track every step in My Services.",
    "- Policies (shipping, returns, warranty) are being finalised: for these questions, ask the customer to message WhatsApp.",
    `CATEGORIES: ${categories.map((c) => `${c.name} (${c.productCount})`).join(", ")}`,
    "PRODUCTS (name | category | price | stock | age | link | specs)",
    ...(lines.length ? lines : ["- (no products listed yet)"]),
  ].join("\n");
}

export async function customerChatAction(raw: unknown): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please type a shorter message." };
  const h = await headers();
  const who = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  if (!allowed(who)) return { ok: false, error: `Lots of questions! Please message us on WhatsApp ${OFFICIAL_WHATSAPP_DISPLAY}.` };

  const system = [
    "You are the friendly KING DAY shop assistant on the website. Keep answers short (2-5 sentences), warm and clear.",
    "Answer ONLY from the store facts and product list below. Never invent products, prices, stock, discounts, delivery times, warranty terms or policies.",
    "Whenever you mention a product, also say its stock status exactly as listed (in stock / only N left / out of stock). Never call an out-of-stock product available.",
    `If the answer isn't in the data, or the customer wants a human, say so and suggest WhatsApp ${OFFICIAL_WHATSAPP_DISPLAY}.`,
    "When you mention a product, write its full link as plain text. Plain text only: no markdown, no asterisks, no [text](link).",
    "Reply in the customer's language (English or Malayalam).",
    "Never ask for passwords, OTPs, card or bank details.",
    "",
    await storeKnowledge(),
  ].join("\n");

  // Room for the model's own thinking plus a short answer.
  const res = await geminiGenerate({ system, messages: parsed.data.messages, maxTokens: 2048, temperature: 0.3 });
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.error === "limit"
          ? `Our assistant is busy right now. Please message us on WhatsApp ${OFFICIAL_WHATSAPP_DISPLAY}.`
          : `Sorry, I couldn't answer that. Please message us on WhatsApp ${OFFICIAL_WHATSAPP_DISPLAY}.`,
    };
  }
  return { ok: true, text: res.text.slice(0, 2000) };
}
