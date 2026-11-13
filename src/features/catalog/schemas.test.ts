import { describe, expect, it } from "vitest";
import {
  brandInputSchema,
  categoryInputSchema,
  issuesToFieldErrors,
  paiseToRupees,
  productImagePathSchema,
  productInputSchema,
  rupeesToPaise,
  slugify,
  toSaveProductPayload,
} from "./schemas";

const CAT = "7f0c3c3e-1d1b-4b8e-9a51-6f2c1f6a2b10";
const PID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

const product = (over: Record<string, unknown> = {}) => ({
  name: "Thunder 12V Ride-on Jeep",
  category_id: CAT,
  variants: [{ sku: "kd-thu-red", name: "Red", colour: "Red", mrp: "28,999", price: 23499, opening_stock: "5" }],
  ...over,
});

describe("slugify", () => {
  it("creates URL-safe slugs", () => {
    expect(slugify("Electric Jeeps & Cars")).toBe("electric-jeeps-and-cars");
    expect(slugify("  Prince 20\" Gear Cycle!! ")).toBe("prince-20-gear-cycle");
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });
});

describe("money", () => {
  it("converts rupees to integer paise", () => {
    expect(rupeesToPaise("28,999")).toBe(2899900);
    expect(rupeesToPaise("₹ 1,099.50")).toBe(109950);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(Number.isNaN(rupeesToPaise("abc"))).toBe(true);
    expect(paiseToRupees(2899900)).toBe("28999");
    expect(paiseToRupees(109950)).toBe("1099.50");
  });
});

describe("productInputSchema", () => {
  it("normalises a valid product", () => {
    const r = productInputSchema.parse(product({ highlights: ["Remote", " ", "Lights"] }));
    expect(r.slug).toBe("thunder-12v-ride-on-jeep");
    expect(r.variants[0]).toMatchObject({ sku: "KD-THU-RED", mrp: 2899900, price: 2349900, opening_stock: 5 });
    expect(r.highlights).toEqual(["Remote", "Lights"]);
    expect(r.status).toBe("draft");
    expect(r.brand_id).toBeNull();
  });

  it("rejects a selling price above MRP", () => {
    const r = productInputSchema.safeParse(product({ variants: [{ sku: "KD-X-1", mrp: 100, price: 200 }] }));
    expect(r.success).toBe(false);
    expect(issuesToFieldErrors(r.error!)["variants.0.price"]).toMatch(/higher than MRP/);
  });

  it("rejects duplicate SKUs within a product", () => {
    const r = productInputSchema.safeParse(
      product({ variants: [{ sku: "KD-X-1", mrp: 100, price: 90 }, { sku: "kd-x-1", mrp: 100, price: 90 }] }),
    );
    expect(r.success).toBe(false);
    expect(issuesToFieldErrors(r.error!)["variants.1.sku"]).toMatch(/Same SKU/);
  });

  it("rejects bad SKUs, zero prices and negative stock", () => {
    const r = productInputSchema.safeParse(product({ variants: [{ sku: "a b", mrp: 0, price: 0, opening_stock: -1 }] }));
    expect(r.success).toBe(false);
    const f = issuesToFieldErrors(r.error!);
    expect(Object.keys(f)).toEqual(expect.arrayContaining(["variants.0.sku", "variants.0.mrp", "variants.0.opening_stock"]));
  });

  it("requires a variant and a valid category", () => {
    const r = productInputSchema.safeParse(product({ variants: [], category_id: "nope" }));
    expect(r.success).toBe(false);
    const f = issuesToFieldErrors(r.error!);
    expect(f.variants).toBeDefined();
    expect(f.category_id).toBeDefined();
  });

  it("blocks publishing with no active variant", () => {
    const r = productInputSchema.safeParse(
      product({ status: "active", variants: [{ sku: "KD-X-1", mrp: 100, price: 90, is_active: false }] }),
    );
    expect(r.success).toBe(false);
  });

  it("drops empty and rejects duplicate specifications", () => {
    const ok = productInputSchema.parse(product({ attributes: [{ name: "Battery", value: "12V" }, { name: "", value: "" }] }));
    expect(ok.attributes).toHaveLength(1);
    const bad = productInputSchema.safeParse(
      product({ attributes: [{ name: "Battery", value: "12V" }, { name: "battery", value: "6V" }] }),
    );
    expect(bad.success).toBe(false);
  });

  it("builds the save_product payload; opening stock only for new variants", () => {
    const parsed = productInputSchema.parse(
      product({
        variants: [
          { id: PID, sku: "KD-OLD-1", mrp: 100, price: 90, opening_stock: 9 },
          { sku: "KD-NEW-1", colour: "Blue", mrp: 100, price: 90, opening_stock: 4 },
        ],
      }),
    );
    const payload = toSaveProductPayload(parsed);
    expect(payload.variants[0].opening_stock).toBe(0);
    expect(payload.variants[1]).toMatchObject({ opening_stock: 4, options: { colour: "Blue" } });
  });
});

describe("category and brand schemas", () => {
  it("derives slugs and blocks self-parenting", () => {
    expect(categoryInputSchema.parse({ name: "Ride-on Jeeps" }).slug).toBe("ride-on-jeeps");
    const self = categoryInputSchema.safeParse({ id: CAT, name: "Loop", parent_id: CAT });
    expect(self.success).toBe(false);
    expect(brandInputSchema.parse({ name: "Royal Rides", slug: "" }).slug).toBe("royal-rides");
    expect(brandInputSchema.safeParse({ name: "X", slug: "Bad Slug!" }).success).toBe(false);
  });
});

describe("image paths", () => {
  it("only accepts files inside the product's own folder", () => {
    const schema = productImagePathSchema(PID);
    expect(schema.safeParse(`products/${PID}/3f2a9c1e-77aa.webp`).success).toBe(true);
    expect(schema.safeParse(`products/${CAT}/3f2a9c1e-77aa.webp`).success).toBe(false);
    expect(schema.safeParse(`products/${PID}/../../secret.webp`).success).toBe(false);
    expect(schema.safeParse(`products/${PID}/x.svg`).success).toBe(false);
  });
});
