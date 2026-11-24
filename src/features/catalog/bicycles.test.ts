import { describe, expect, it } from "vitest";
import { ageText, buildBicycleTree, findBicycles, heightText, inchLabel, parseFinder, type FitRow } from "./bicycles";
import type { StoreCategory, StoreProduct } from "./types";

const cat = (slug: string, parentSlug: string | null, path: string[]): StoreCategory => ({
  slug, name: slug, parentSlug, path, depth: path.length - 1, description: "", imageUrl: null, seoTitle: null, seoDescription: null, productCount: 1,
});
const categories = [
  cat("cycles", null, ["cycles"]),
  cat("kids-bicycles", "cycles", ["cycles", "kids-bicycles"]),
  cat("kids-bicycles-12-inch", "kids-bicycles", ["cycles", "kids-bicycles", "kids-bicycles-12-inch"]),
  cat("kids-bicycles-16-inch", "kids-bicycles", ["cycles", "kids-bicycles", "kids-bicycles-16-inch"]),
  cat("mens-bicycles", "cycles", ["cycles", "mens-bicycles"]),
  cat("mens-bicycles-29-inch", "mens-bicycles", ["cycles", "mens-bicycles", "mens-bicycles-29-inch"]),
  cat("electric-cycles", "cycles", ["cycles", "electric-cycles"]),
  cat("electric-bicycles-20-inch", "electric-cycles", ["cycles", "electric-cycles", "electric-bicycles-20-inch"]),
];
const row = (slug: string, kind: FitRow["kind"], over: Partial<FitRow> = {}): FitRow & { slug: string } => ({
  slug, category_id: slug, kind, wheel_size_inch: null, age_min: null, age_max: null, height_min_cm: null, height_max_cm: null, age_label: null, model_based: false, audience: "any", ...over,
});
const rows = [
  row("cycles", "root"),
  row("kids-bicycles", "type", { audience: "kids" }),
  row("kids-bicycles-12-inch", "size", { wheel_size_inch: 12, age_min: 2, age_max: 3, height_min_cm: 85, height_max_cm: 100 }),
  row("kids-bicycles-16-inch", "size", { wheel_size_inch: "16.0", age_min: 4, age_max: 6, height_min_cm: 105, height_max_cm: 120 }),
  row("mens-bicycles", "type", { audience: "men" }),
  row("mens-bicycles-29-inch", "size", { wheel_size_inch: 29, age_min: 18 }),
  row("electric-cycles", "type"),
  row("electric-bicycles-20-inch", "size", { wheel_size_inch: 20, model_based: true }),
  row("missing-inactive", "size", { wheel_size_inch: 14 }),
];
const product = (id: string, slug: string): StoreProduct =>
  ({ id, slug: id, name: id, price: 100, mrp: 100, stock: 1, images: [], category: { slug, name: slug, parentSlug: null, path: categories.find((c) => c.slug === slug)!.path } }) as unknown as StoreProduct;
const products = [
  product("tiny", "kids-bicycles-12-inch"),
  product("small", "kids-bicycles-16-inch"),
  product("mtb", "mens-bicycles-29-inch"),
  product("ebike-a", "electric-bicycles-20-inch"),
  product("ebike-b", "electric-bicycles-20-inch"),
];
const tree = buildBicycleTree(rows, categories);

describe("bicycle finder", () => {
  it("builds types with their sizes, dropping inactive categories", () => {
    expect(tree.root?.slug).toBe("cycles");
    expect(tree.types.map((t) => t.slug)).toEqual(["kids-bicycles", "mens-bicycles", "electric-cycles"]);
    expect(tree.types[0].sizes.map((s) => s.inch)).toEqual([12, 16]);
  });

  it("matches by age, and by height when given", () => {
    expect(findBicycles(tree, products, new Map(), { type: "kids-bicycles", age: 5, height: null, gender: null }).exact.map((r) => r.product.id)).toEqual(["small"]);
    const tall = findBicycles(tree, products, new Map(), { type: "kids-bicycles", age: 5, height: 140, gender: "girl" });
    expect(tall.exact).toHaveLength(0);
    expect(tall.nearby[0].product.id).toBe("small");
  });

  it("suggests nearby sizes and other types when nothing fits", () => {
    const r = findBicycles(tree, products, new Map(), { type: "kids-bicycles", age: 30, height: null, gender: null });
    expect(r.exact).toHaveLength(0);
    expect(r.nearby.map((x) => x.product.id)).toEqual(["small", "tiny"]);
    expect(r.otherTypes.map((t) => t.slug)).toEqual(["mens-bicycles"]);
  });

  it("uses model-specific ranges for electric bicycles", () => {
    const fits = new Map([["ebike-a", { ageMin: 14, ageMax: null, heightMin: 150, heightMax: null, note: "Throttle model" }]]);
    const r = findBicycles(tree, products, fits, { type: "electric-cycles", age: 16, height: 160, gender: null });
    expect(r.exact.map((x) => x.product.id)).toEqual(["ebike-a"]);
    expect(r.exact[0].modelSpecific).toBe(true);
    const young = findBicycles(tree, products, fits, { type: "electric-cycles", age: 8, height: null, gender: null });
    expect(young.exact).toHaveLength(0);
    expect(young.unrated.map((x) => x.product.id)).toEqual(["ebike-b"]);
  });

  it("reads and validates the query", () => {
    expect(parseFinder({ type: "kids-bicycles", age: "5", height: "300", gender: "x" }, tree)).toEqual({ type: "kids-bicycles", age: 5, height: null, gender: null });
    expect(parseFinder({ type: "nope", age: "5" }, tree)).toBeNull();
    expect(parseFinder({ type: "kids-bicycles" }, tree)).toBeNull();
  });

  it("formats labels", () => {
    expect(inchLabel(27.5)).toBe("27.5 Inch");
    expect(inchLabel(12)).toBe("12 Inch");
    expect(ageText({ ageMin: 18, ageMax: null, heightMin: null, heightMax: null })).toBe("18+ years");
    expect(heightText({ ageMin: null, ageMax: null, heightMin: 85, heightMax: 100 })).toBe("85–100 cm");
  });
});
