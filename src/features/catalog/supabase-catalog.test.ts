import { beforeAll, describe, expect, it, vi } from "vitest";

// Fake Supabase responses, keyed by table, shaped like PostgREST embeds.
const tables: Record<string, unknown[]> = {
  products: [
    {
      id: "p1", name: "Thunder Jeep", slug: "thunder-jeep", short_description: "Fast", description: "Para one.\n\nPara two.",
      highlights: ["Remote"], age_range: "3–8 years", video_path: null, is_featured: true, seo_title: null, seo_description: null,
      published_at: "2026-11-10T00:00:00Z", created_at: "2026-11-01T00:00:00Z",
      category: { slug: "ride-on-jeeps", name: "Ride-on Jeeps", parent: { slug: "electric-jeeps-cars" } },
      brand: { slug: "royal-rides", name: "Royal Rides" },
      product_variants: [
        { id: "v2", sku: "KD-THU-BLU", name: "Blue", options: { colour: "Blue" }, mrp: 3000000, price: 2500000, is_default: true, is_active: true, position: 1, inventory: { on_hand: 4, reserved: 1 } },
        { id: "v1", sku: "KD-THU-RED", name: "Red", options: { colour: "Red" }, mrp: 3000000, price: 2600000, is_default: false, is_active: true, position: 0, inventory: { on_hand: 2, reserved: 0 } },
        { id: "v3", sku: "KD-THU-OLD", name: "Old", options: {}, mrp: 100, price: 100, is_default: false, is_active: false, position: 2, inventory: { on_hand: 50, reserved: 0 } },
      ],
      product_images: [
        { storage_path: "products/p1/b.webp", alt: "", position: 1 },
        { storage_path: "products/p1/a.webp", alt: "Front", position: 0 },
      ],
      product_attributes: [{ name: "Battery", value: "12V", position: 0 }],
    },
    {
      id: "p2", name: "No Variants", slug: "no-variants", short_description: null, description: null, highlights: null, age_range: null,
      video_path: null, is_featured: false, seo_title: null, seo_description: null, published_at: null, created_at: "2026-11-01T00:00:00Z",
      category: { slug: "toys", name: "Toys", parent: null }, brand: null,
      product_variants: [{ id: "v9", sku: "KD-X-9", name: "Default", options: {}, mrp: 100, price: 100, is_default: true, is_active: false, position: 0, inventory: null }],
      product_images: [], product_attributes: [],
    },
  ],
  categories: [
    { slug: "electric-jeeps-cars", name: "Electric Jeeps & Cars", description: null, image_path: null, seo_title: null, seo_description: null, parent: null },
    { slug: "ride-on-jeeps", name: "Ride-on Jeeps", description: "Jeeps", image_path: "categories/abcdefgh.webp", seo_title: null, seo_description: null, parent: { slug: "electric-jeeps-cars" } },
  ],
  brands: [{ slug: "royal-rides", name: "Royal Rides", description: null, logo_path: null }],
  reviews: [
    { id: "r1", rating: 5, title: "Great", body: "Love it", author_name: "Asha", created_at: "2026-11-05T00:00:00Z", product: { slug: "thunder-jeep" } },
    { id: "r2", rating: 4, title: "Good", body: "Nice", author_name: null, created_at: "2026-11-04T00:00:00Z", product: { slug: "thunder-jeep" } },
  ],
};

function builder(table: string) {
  const result = { data: tables[table], error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
  b.then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return b;
}

vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ from: builder }) }));

let load: typeof import("./supabase-catalog").loadSupabaseCatalog;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-tests-0000000000");
  ({ loadSupabaseCatalog: load } = await import("./supabase-catalog"));
});

describe("loadSupabaseCatalog", () => {
  it("maps products with active variants, default pricing and available stock", async () => {
    const snap = await load();
    expect(snap.source).toBe("supabase");
    expect(snap.products.map((p) => p.slug)).toEqual(["thunder-jeep"]); // product without active variants is hidden
    const p = snap.products[0];
    expect(p.variants.map((v) => v.sku)).toEqual(["KD-THU-RED", "KD-THU-BLU"]); // ordered by position, inactive dropped
    expect(p.defaultVariantId).toBe("v2");
    expect(p).toMatchObject({ sku: "KD-THU-BLU", price: 2500000, mrp: 3000000, stock: 5 }); // 2 + (4 − 1 reserved)
    expect(p.variants.find((v) => v.id === "v2")?.colour).toBe("Blue");
  });

  it("orders images, splits description paragraphs and builds specs", async () => {
    const p = (await load()).products[0];
    expect(p.images[0]).toEqual({ src: "https://demo.supabase.co/storage/v1/object/public/product-images/products/p1/a.webp", alt: "Front" });
    expect(p.images[1].alt).toBe("Thunder Jeep"); // falls back to product name
    expect(p.description).toEqual(["Para one.", "Para two."]);
    expect(p.specs).toEqual([{ label: "Recommended age", value: "3–8 years" }, { label: "Battery", value: "12V" }]);
  });

  it("aggregates approved review ratings", async () => {
    const snap = await load();
    expect(snap.products[0]).toMatchObject({ rating: 4.5, reviewCount: 2 });
    expect(snap.reviews.find((r) => r.id === "r2")?.author).toBe("Verified customer");
  });

  it("counts products in parent categories through their subcategories", async () => {
    const snap = await load();
    const parent = snap.categories.find((c) => c.slug === "electric-jeeps-cars");
    const child = snap.categories.find((c) => c.slug === "ride-on-jeeps");
    expect(parent?.productCount).toBe(1);
    expect(child).toMatchObject({ parentSlug: "electric-jeeps-cars", productCount: 1 });
    expect(child?.imageUrl).toContain("/category-images/categories/abcdefgh.webp");
    expect(snap.brands[0]).toMatchObject({ slug: "royal-rides", productCount: 1 });
  });
});
