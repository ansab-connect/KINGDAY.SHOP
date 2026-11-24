import { describe, expect, it } from "vitest";
import { productForCategory, type StoreProduct } from "./types";

const variant = (id: string, price: number, stock = 3) => ({ id, sku: id.toUpperCase(), name: id, mrp: price + 1000, price, stock, images: [], colour: null, option1: null, option2: null, specs: [], values: {} });
const base = {
  id: "p1",
  slug: "sprint",
  name: "Sprint",
  sku: "V24",
  mrp: 11000,
  price: 10000,
  stock: 9,
  images: [{ src: "/shared.webp", alt: "" }],
  defaultVariantId: "v24",
  variants: [variant("v24", 10000), { ...variant("v26", 12000, 0), images: [{ src: "/26.webp", alt: "" }] }, variant("v275", 14000)],
  variantByCategory: { "mens-26-inch": "v26", "mens-27-5-inch": "v275" },
} as unknown as StoreProduct;
const paths: Record<string, string[]> = {
  "mens-26-inch": ["cycles", "mens", "mens-26-inch"],
  "mens-27-5-inch": ["cycles", "mens", "mens-27-5-inch"],
};
const pathOf = (s: string) => paths[s];

describe("product listed in a variant's category", () => {
  it("shows that variant's price, stock and pictures", () => {
    const p = productForCategory(base, "mens-26-inch", pathOf);
    expect([p.price, p.mrp, p.stock, p.defaultVariantId, p.listedVariantId]).toEqual([12000, 13000, 0, "v26", "v26"]);
    expect(p.images[0].src).toBe("/26.webp");
  });

  it("falls back to shared pictures when the variant has none", () => {
    expect(productForCategory(base, "mens-27-5-inch", pathOf).images[0].src).toBe("/shared.webp");
  });

  it("uses a variant of a sub-category on the parent page, else stays unchanged", () => {
    expect(productForCategory(base, "mens", pathOf).listedVariantId).toBe("v26");
    expect(productForCategory(base, "toys", pathOf)).toBe(base);
  });

  it("ignores links to variants that are not on sale", () => {
    expect(productForCategory({ ...base, variantByCategory: { toys: "gone" } }, "toys", pathOf)).toEqual({ ...base, variantByCategory: { toys: "gone" } });
  });
});
