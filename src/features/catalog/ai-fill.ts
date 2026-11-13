"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { assertStaff } from "@/features/auth/session";

/**
 * AI product fill: turns a pasted bulk description into editor fields.
 * Runs only on the server (ANTHROPIC_API_KEY is never sent to the browser) and only
 * for staff. Nothing is saved: the editor shows the result for review.
 */

const AiProduct = z.object({
  name: z.string().describe("Product name as a customer would see it. Empty if not stated."),
  short_description: z.string().describe("One or two sentences, max 280 characters."),
  description: z.string().describe("Full description in clear paragraphs separated by blank lines. Rewrite into good English; keep facts only from the input."),
  highlights: z.array(z.string()).describe("3-8 short selling points, each under 100 characters."),
  age_range: z.string().describe("Recommended age, e.g. '3-8 years'. Empty if not stated."),
  category_id: z.string().describe("The id of the best matching category from the list, or empty."),
  brand_id: z.string().describe("The id of the matching brand from the list, or empty if none is mentioned."),
  specifications: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .describe("Technical specs as short name/value pairs, e.g. Battery / 12V 7Ah."),
  variants: z
    .array(
      z.object({
        name: z.string().describe("Variant label, e.g. 'Red' or 'Red / 12V'."),
        colour: z.string().describe("Colour name if this variant is a colour, else empty."),
        mrp: z.number().describe("MRP in rupees, or 0 if not stated."),
        price: z.number().describe("Selling price in rupees, or 0 if not stated."),
      }),
    )
    .describe("One entry per colour/model option. Empty array if no options are listed."),
  seo_title: z.string().describe("Search title, max 60 characters."),
  seo_description: z.string().describe("Search description, max 155 characters."),
});

export type AiProductFill = z.infer<typeof AiProduct>;
export type AiFillResult = { ok: true; data: AiProductFill } | { ok: false; error: string };

const SYSTEM = `You prepare product listings for KING DAY, an Indian store for premium kids' ride-ons, bikes, scooters, tricycles, cycles, toys and baby accessories.
Extract the product details from the seller's text into the given fields.
Use only facts present in the text. Never invent prices, specifications, certifications or claims; leave a field empty (or 0 for prices) when the text doesn't say.
Prices are in Indian rupees. If only one price is given, treat it as the selling price.
Write in clear, warm, professional English suitable for parents.`;

export async function aiFillProduct(input: {
  text: string;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}): Promise<AiFillResult> {
  try {
    await assertStaff("staff");
  } catch {
    return { ok: false, error: "You don't have permission to use AI fill." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI fill isn't set up yet: add ANTHROPIC_API_KEY to the server environment." };
  }

  const text = String(input.text ?? "").trim();
  if (text.length < 20) return { ok: false, error: "Paste a longer product description (at least a sentence or two)." };
  if (text.length > 12000) return { ok: false, error: "That's too long. Paste at most 12,000 characters." };

  const categories = input.categories.slice(0, 200).map((c) => `${c.id} = ${c.name}`).join("\n");
  const brands = input.brands.slice(0, 200).map((b) => `${b.id} = ${b.name}`).join("\n");

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(AiProduct) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Categories (id = name):\n${categories || "(none)"}\n\nBrands (id = name):\n${brands || "(none)"}\n\nProduct text:\n<product_text>\n${text}\n</product_text>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return { ok: false, error: "The AI couldn't process this text. Please edit it and try again." };
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { ok: false, error: "The AI response was incomplete. Try a shorter description." };
    }

    const out = response.parsed_output;
    // Only accept ids we offered (the model can't attach the product to unknown records).
    const catIds = new Set(input.categories.map((c) => c.id));
    const brandIds = new Set(input.brands.map((b) => b.id));
    return {
      ok: true,
      data: {
        ...out,
        category_id: catIds.has(out.category_id) ? out.category_id : "",
        brand_id: brandIds.has(out.brand_id) ? out.brand_id : "",
        highlights: out.highlights.slice(0, 12),
        specifications: out.specifications.filter((s) => s.name && s.value).slice(0, 40),
        variants: out.variants.slice(0, 20).map((v) => ({ ...v, mrp: Math.max(0, v.mrp), price: Math.max(0, v.price) })),
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The AI key is invalid. Check ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "AI is busy right now. Please try again in a minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `AI service error (${e.status ?? "network"}). Please try again.` };
    return { ok: false, error: "Couldn't reach the AI service. Please try again." };
  }
}
