import { normaliseSocialVideoUrl } from "@/lib/social-video";
import { z } from "zod";
import { comboKey } from "./variant-types";

/**
 * Validation for catalogue management. These schemas run on the SERVER for every
 * save (the client may pre-check with them too, but is never trusted). The
 * database enforces the same rules again with constraints.
 */

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKU_RE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/["'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Rupees (number or numeric string, up to 2 decimals) → integer paise. */
export function rupeesToPaise(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,\s₹]/g, ""));
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

const uuid = z.uuid("Choose a valid option.");
const optionalUuid = z
  .union([uuid, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .optional()
  .transform((v) => v ?? "");

function withSlug<T extends { name: string; slug: string }>(v: T, ctx: z.RefinementCtx): T {
  const slug = v.slug || slugify(v.name);
  if (!SLUG_RE.test(slug)) {
    ctx.addIssue({ code: "custom", path: ["slug"], message: "Use lowercase letters, numbers and hyphens only." });
  }
  return { ...v, slug };
}

// ---------------------------------------------------------------- Category
export const categoryInputSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(2, "Enter a name.").max(80),
    slug: slugField,
    parent_id: optionalUuid,
    description: optionalText(500),
    image_path: optionalText(300),
    sort_order: z.coerce.number().int().min(0).max(10000).default(0),
    is_active: z.boolean().default(true),
    seo_title: optionalText(70),
    seo_description: optionalText(170),
  })
  .transform(withSlug)
  .refine((v) => !v.id || v.id !== v.parent_id, { path: ["parent_id"], message: "A category can't be its own parent." });

export type CategoryInput = z.input<typeof categoryInputSchema>;
export type CategoryData = z.output<typeof categoryInputSchema>;

// ---------------------------------------------------------------- Brand
export const brandInputSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(1, "Enter a name.").max(80),
    slug: slugField,
    description: optionalText(1000),
    logo_path: optionalText(300),
    is_active: z.boolean().default(true),
  })
  .transform(withSlug);

export type BrandInput = z.input<typeof brandInputSchema>;
export type BrandData = z.output<typeof brandInputSchema>;

// ---------------------------------------------------------------- Product
const money = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => rupeesToPaise(v))
    .pipe(
      z
        .number({ message: `Enter the ${label}.` })
        .int()
        .positive(`${label[0].toUpperCase()}${label.slice(1)} must be more than ₹0.`)
        .max(1_000_000_000, `${label} is too large.`),
    );

const attributeSpec = z.object({ name: z.string().trim().max(60), value: z.string().trim().max(200) });

export const variantInputSchema = z
  .object({
    id: optionalUuid,
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(SKU_RE, "SKU: 3–40 capital letters, numbers or hyphens."),
    name: z.string().trim().max(120).default("Default"),
    colour: optionalText(40),
    /** Main variant value, e.g. "12V" (when the product has a main variant type). */
    option1: optionalText(60),
    /** Sub variant value, e.g. "Volt Blue" (when the product has a sub variant type). */
    option2: optionalText(60),
    /** Values by variant type name, e.g. {"Wheel Size": "24″", "Colour": "Volt Blue"}. */
    values: z.record(z.string(), z.string().trim().max(60, "Use at most 60 characters.")).optional(),
    /** Category this variant is listed in with its own price (e.g. the 24″ category). Empty = none. */
    category_id: optionalUuid,
    /** Specifications that apply only to this combination. */
    specs: z
      .array(attributeSpec)
      .max(30)
      .default([])
      .transform((list) => list.filter((a) => a.name && a.value)),
    mrp: money("MRP"),
    price: money("selling price"),
    opening_stock: z.coerce.number().int().min(0, "Stock can't be negative.").max(100000).default(0),
    /** Saved variants: the stock count the editor wants. The difference is recorded as an adjustment. */
    stock_target: z.number().int("Whole numbers only.").min(0, "Stock can't be negative.").max(100000).optional(),
    weight_grams: z
      .union([z.coerce.number().int().positive().max(500000), z.literal(""), z.null()])
      .optional()
      .transform((v) => (typeof v === "number" ? v : null)),
    is_active: z.boolean().default(true),
    is_default: z.boolean().default(false),
  })
  .refine((v) => v.price <= v.mrp, { path: ["price"], message: "Selling price can't be higher than MRP." });

export const attributeInputSchema = z.object({
  name: z.string().trim().max(60),
  value: z.string().trim().max(200),
});

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;

export const productInputSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(2, "Enter the product name.").max(160),
    slug: slugField,
    category_id: uuid,
    /** Other categories the product also shows in (e.g. 24″, 26″ and 27.5″ for one bicycle model). */
    extra_category_ids: z.array(uuid).max(30, "Choose at most 30 extra categories.").default([]),
    brand_id: optionalUuid,
    short_description: optionalText(300),
    description: optionalText(10000),
    highlights: z
      .array(z.string().trim().max(120))
      .max(12, "Use at most 12 highlights.")
      .default([])
      .transform((list) => list.filter(Boolean)),
    age_range: optionalText(40),
    video_path: optionalText(300),
    /** Instagram reel or YouTube link, shown in the product gallery. */
    video_link: optionalText(300).refine((v) => !v || normaliseSocialVideoUrl(v) !== null, "Paste an Instagram reel or YouTube video link.").transform((v) => normaliseSocialVideoUrl(v)),
    status: z.enum(PRODUCT_STATUSES).default("draft"),
    is_featured: z.boolean().default(false),
    /** % off when paid online / cash on delivery (0–50). Applied by the database at checkout. */
    prepaid_discount_pct: z.coerce.number().min(0, "Use 0–50%.").max(50, "Use 0–50%.").multipleOf(0.01).default(0),
    cod_discount_pct: z.coerce.number().min(0, "Use 0–50%.").max(50, "Use 0–50%.").multipleOf(0.01).default(0),
    seo_title: optionalText(70),
    seo_description: optionalText(170),
    /** Main variant type, e.g. "Size". Empty = simple variants. */
    option1_name: optionalText(30),
    /** Sub variant type under each main value, e.g. "Colour". */
    option2_name: optionalText(30),
    /** Ordered variant types (first = main). Replaces option1_name/option2_name when given. */
    variant_types: z
      .array(z.string().trim().min(1, "Name the variant type.").max(30, "Use at most 30 characters."))
      .max(8, "Use at most 8 variant types.")
      .optional(),
    variants: z.array(variantInputSchema).min(1, "Add at least one variant.").max(100),
    attributes: z
      .array(attributeInputSchema)
      .max(40)
      .default([])
      .transform((list) => list.filter((a) => a.name && a.value)),
  })
  .transform(withSlug)
  .superRefine((v, ctx) => {
    const seen = new Map<string, number>();
    v.variants.forEach((variant, i) => {
      const prev = seen.get(variant.sku);
      if (prev !== undefined) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: `Same SKU as variant ${prev + 1}.` });
      }
      seen.set(variant.sku, i);
    });
    const byCategory = new Map<string, number>();
    v.variants.forEach((variant, i) => {
      if (!variant.category_id) return;
      const prev = byCategory.get(variant.category_id);
      if (prev !== undefined) ctx.addIssue({ code: "custom", path: ["variants", i, "category_id"], message: `Variant ${prev + 1} already uses this category. Choose another one.` });
      byCategory.set(variant.category_id, i);
    });
    if (!v.variant_types && v.option2_name && !v.option1_name) {
      ctx.addIssue({ code: "custom", path: ["option1_name"], message: "Choose the main variant type first." });
    }
    const types = variantTypesOf(v);
    const typeKeys = new Set<string>();
    types.forEach((t, i) => {
      if (typeKeys.has(t.toLowerCase())) ctx.addIssue({ code: "custom", path: v.variant_types ? ["variant_types", i] : ["option2_name"], message: "Variant types must be different." });
      typeKeys.add(t.toLowerCase());
    });
    const combos = new Map<string, number>();
    // Sub-variant types depend on the main value, but are the same for all its combinations.
    const subTypesOf = new Map<string, { sig: string; index: number }>();
    v.variants.forEach((variant, i) => {
      if (!variant.is_active || !types.length) return;
      const values = variantValuesOf(types, variant);
      if (!values[types[0]]) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "values"], message: `Enter the ${types[0]}.` });
        return;
      }
      const mainKey = values[types[0]].toLowerCase();
      const sig = types.slice(1).filter((t) => values[t]).join("|");
      const first = subTypesOf.get(mainKey);
      if (first && first.sig !== sig) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "values"], message: `All ${values[types[0]]} combinations need the same options (${first.sig.replace(/\|/g, ", ") || "none"}).` });
        return;
      }
      if (!first) subTypesOf.set(mainKey, { sig, index: i });
      const key = comboKey(types, values);
      const prev = combos.get(key);
      if (prev !== undefined) ctx.addIssue({ code: "custom", path: ["variants", i, "values"], message: `Same combination as variant ${prev + 1}.` });
      combos.set(key, i);
    });
    const names = new Set<string>();
    v.attributes.forEach((a, i) => {
      const key = a.name.toLowerCase();
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["attributes", i, "name"], message: "Duplicate specification." });
      names.add(key);
    });
    if (v.status === "active" && !v.variants.some((x) => x.is_active)) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "An active product needs at least one active variant." });
    }
  });

export type ProductInput = z.input<typeof productInputSchema>;
export type ProductData = z.output<typeof productInputSchema>;

type TypeSource = { variant_types?: string[]; option1_name?: string | null; option2_name?: string | null };
type ValueSource = { values?: Record<string, string>; option1?: string | null; option2?: string | null };

/** The product's ordered variant types (new list, or the older two-level fields). */
export function variantTypesOf(p: TypeSource): string[] {
  if (p.variant_types) return p.variant_types.map((t) => t.trim()).filter(Boolean);
  return [p.option1_name, p.option1_name ? p.option2_name : null].filter((t): t is string => Boolean(t));
}

/** A variant's value for each type (from "values", else option1/option2). */
export function variantValuesOf(types: string[], v: ValueSource): Record<string, string> {
  const out: Record<string, string> = {};
  types.forEach((t, i) => {
    const fromValues = v.values ? Object.entries(v.values).find(([k]) => k.toLowerCase() === t.toLowerCase())?.[1] : undefined;
    const value = (fromValues ?? (i === 0 ? v.option1 : i === 1 ? v.option2 : undefined) ?? "").trim();
    if (value) out[t] = value;
  });
  return out;
}

/** Shape sent to the save_product() database function. */
export function toSaveProductPayload(p: ProductData) {
  const types = variantTypesOf(p);
  return {
    ...p,
    variant_types: types,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      // Empty name → the database builds it from the values ("24″ · Volt Blue · Single Speed").
      name: v.name && v.name !== "Default" ? v.name : types.length ? "" : "Default",
      options: v.colour ? { colour: v.colour } : {},
      values: types.length ? variantValuesOf(types, v) : {},
      specs: v.specs,
      mrp: v.mrp,
      price: v.price,
      weight_grams: v.weight_grams,
      opening_stock: v.id ? 0 : v.opening_stock, // opening stock only for new variants
      is_active: v.is_active,
      is_default: v.is_default,
    })),
  };
}

// ---------------------------------------------------------------- Images
export const productImagePathSchema = (productId: string) =>
  z
    .string()
    .regex(
      new RegExp(`^products/${productId}/[a-z0-9-]{8,64}\\.(webp|jpg|jpeg|png|avif)$`),
      "Invalid image path.",
    );

/** Flattens zod issues into "path.to.field" → message for form display. */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}
