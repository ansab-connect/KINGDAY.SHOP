/**
 * DEVELOPMENT PREVIEW CATALOGUE — fictional storefront data built on top of the
 * admin preview products (src/features/preview/data.ts). Replaced by Supabase
 * queries in Phase 5. Specs, ratings and reviews here are illustrative only.
 */
import { productCategories } from "@/config/site";
import { PREVIEW_TODAY, previewBrands, previewProducts } from "@/features/preview/data";
import type { CatalogSnapshot, ProductReview, StoreBrand, StoreCategory, StoreProduct, StoreVariant } from "./types";

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/["']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const categoryBySlugName = new Map<string, { slug: string; name: string; parentSlug: null }>(
  productCategories.map((c) => [c.name, { slug: c.slug, name: c.name, parentSlug: null }]),
);

export const categoryDescriptions: Record<string, string> = {
  "electric-jeeps-cars": "Ride-on jeeps and cars with parental remotes, soft-start motors and real-feel details.",
  bikes: "Balance bikes, kids' electric bikes and safety gear for confident first rides.",
  scooters: "Kick and electric scooters with light frames, wide decks and smooth wheels.",
  tricycles: "Push tricycles with parent handles that grow with your toddler.",
  cycles: "Kids' bicycles from 12\" to 20\" with training wheels and gears.",
  toys: "Building sets, remote racers and plush companions for play at home.",
  "baby-accessories": "Walkers, car seats and everyday essentials for little royals.",
};

const brandDescriptions: Record<string, string> = {
  "kingday-originals": "Our in-house range, designed around safety, comfort and a royal finish.",
  "royal-rides": "Licensed-style ride-ons and performance cycles for young adventurers.",
  "little-voyager": "Lightweight bikes and scooters built for everyday exploring.",
  "tiny-trail": "First rides for toddlers: balance bikes and parent-handle trikes.",
  "cuddle-crown": "Soft, gentle baby accessories and plush companions.",
};

type SpecTemplate = {
  age: string;
  specs: [string, string][];
  highlights: string[];
};

const specTemplates: Record<string, SpecTemplate> = {
  "electric-jeeps-cars": {
    age: "3–8 years",
    specs: [
      ["Battery", "12V 7Ah rechargeable"],
      ["Motors", "Dual 35W"],
      ["Top speed", "3–6 km/h (2 speeds)"],
      ["Run time", "Approx. 60–90 min"],
      ["Max load", "30 kg"],
      ["Remote", "2.4 GHz parental remote"],
    ],
    highlights: ["Parental remote control", "Soft-start motor", "Seat belt & suspension", "LED lights and music"],
  },
  bikes: {
    age: "3–10 years",
    specs: [["Frame", "Steel / alloy"], ["Wheels", "12\"–16\" EVA"], ["Brakes", "Hand brake"], ["Max load", "35 kg"]],
    highlights: ["Adjustable seat height", "Puncture-free wheels", "Lightweight frame"],
  },
  scooters: {
    age: "3–12 years",
    specs: [["Deck", "Anti-slip, reinforced"], ["Wheels", "PU light-up"], ["Handlebar", "4-level adjustable"], ["Max load", "50 kg"]],
    highlights: ["Lean-to-steer control", "Foldable for storage", "Light-up wheels"],
  },
  tricycles: {
    age: "1–5 years",
    specs: [["Frame", "Powder-coated steel"], ["Parent handle", "Removable, steerable"], ["Canopy", "UV-protective"], ["Max load", "25 kg"]],
    highlights: ["Parent push handle", "Safety harness", "Storage basket"],
  },
  cycles: {
    age: "5–12 years",
    specs: [["Frame", "High-tensile steel"], ["Wheel size", "16\"–20\""], ["Gears", "Single / 6-speed"], ["Brakes", "Front & rear V-brakes"]],
    highlights: ["Training wheels included (16\")", "Mudguards & chain cover", "Reflectors fitted"],
  },
  toys: {
    age: "3+ years",
    specs: [["Material", "Non-toxic ABS / plush"], ["Battery", "As applicable"], ["Pieces", "Varies by set"]],
    highlights: ["Child-safe materials", "Builds motor skills", "Gift-ready packaging"],
  },
  "baby-accessories": {
    age: "0–3 years",
    specs: [["Material", "BPA-free plastics, soft fabric"], ["Certification", "As per standard"], ["Max load", "Varies by product"]],
    highlights: ["Gentle on skin", "Easy to clean", "Thoughtful safety design"],
  },
};

const colourSets = [
  [{ name: "Royal Purple", hex: "#4B0082" }, { name: "Pearl White", hex: "#F4F2F7" }, { name: "Midnight Black", hex: "#1F1B24" }],
  [{ name: "Racing Red", hex: "#B3261E" }, { name: "Pearl White", hex: "#F4F2F7" }],
  [{ name: "Ocean Blue", hex: "#2958C7" }, { name: "Sunshine Yellow", hex: "#E3B341" }],
  [{ name: "Blush Pink", hex: "#E7A5B8" }, { name: "Mint", hex: "#9CD3BE" }],
];

export const previewCatalog: StoreProduct[] = previewProducts
  .filter((p) => p.status === "active")
  .map((p, i) => {
    const category = categoryBySlugName.get(p.category) ?? { slug: slugify(p.category), name: p.category, parentSlug: null };
    const brandSlug = previewBrands.find((b) => b.name === p.brand)?.slug ?? slugify(p.brand);
    const tpl = specTemplates[category.slug] ?? specTemplates.toys;
    const rating = Math.round((4.2 + ((i * 37) % 8) / 10) * 10) / 10;
    const colours = colourSets[i % colourSets.length];
    const variants: StoreVariant[] = colours.map((c, k) => ({
      id: `${p.id}-v${k}`,
      name: c.name,
      sku: k === 0 ? p.sku : `${p.sku}-${c.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()}`,
      mrp: p.mrp,
      price: p.price,
      stock: k === 0 ? p.stock : Math.max(0, p.stock - 2 * k),
      colour: c.name,
      option1: c.name,
      option2: null,
      images: [],
      specs: [],
    }));
    return {
      id: p.id,
      slug: slugify(p.name),
      name: p.name,
      sku: p.sku,
      category,
      brand: { slug: brandSlug, name: p.brand },
      mrp: p.mrp,
      price: p.price,
      stock: variants.reduce((sum, v) => sum + v.stock, 0),
      variants,
      defaultVariantId: variants[0].id,
      option1Name: "Colour",
      option2Name: null,
      rating: Math.min(rating, 4.9),
      reviewCount: 6 + ((i * 13) % 40),
      ageRange: tpl.age,
      shortDescription: `${tpl.highlights[0]}, ${tpl.highlights[1].toLowerCase()} and a finish worthy of a little royal.`,
      description: [
        `The ${p.name} brings the KING DAY standard of safety and comfort to every ride. Built for ages ${tpl.age}, it balances real-feel fun with the reassurance parents look for.`,
        `Every unit is inspected before dispatch and delivered with clear assembly guidance. Our team is on WhatsApp if you need help choosing the right model or size.`,
      ],
      highlights: tpl.highlights,
      specs: [{ label: "Recommended age", value: tpl.age }, ...tpl.specs.map(([label, value]) => ({ label, value }))],
      images: [],
      sharedImages: [],
      video: null,
      seoTitle: null,
      seoDescription: null,
      isNew: i >= previewProducts.length - 8,
      isBestseller: p.unitsSold30d >= 20,
      isFeatured: p.featured,
      addedRank: i,
    } satisfies StoreProduct;
  });

export const previewStoreCategories: StoreCategory[] = productCategories.map((c) => ({
  slug: c.slug,
  name: c.name,
  parentSlug: null,
  imageUrl: null,
  seoTitle: null,
  seoDescription: null,
  description: categoryDescriptions[c.slug] ?? "",
  productCount: previewCatalog.filter((p) => p.category.slug === c.slug).length,
}));

export const previewStoreBrands: StoreBrand[] = previewBrands
  .filter((b) => b.active)
  .map((b) => ({
    slug: b.slug,
    name: b.name,
    description: brandDescriptions[b.slug] ?? "",
    logoUrl: null,
    productCount: previewCatalog.filter((p) => p.brand?.slug === b.slug).length,
  }));

const reviewers = [
  ["Ananya R.", "Kochi"], ["Rahul M.", "Bengaluru"], ["Fathima S.", "Kozhikode"], ["Vikram P.", "Pune"],
  ["Sneha K.", "Chennai"], ["Arjun N.", "Thrissur"], ["Meera J.", "Hyderabad"], ["Imran A.", "Mumbai"],
] as const;

const reviewCopy = [
  ["Worth every rupee", "Sturdy build and my son hasn't stopped smiling since it arrived. Assembly took about 20 minutes."],
  ["Beautiful finish", "Looks even better in person. The parental remote gives us real peace of mind."],
  ["Great gift", "Bought it for our daughter's birthday. Packaging was premium and delivery was on time."],
  ["Very happy", "Good quality and the team answered all my questions on WhatsApp before I ordered."],
  ["Solid and safe", "Feels well made, no sharp edges. The seat belt and soft start are thoughtful touches."],
] as const;

export const previewReviews: ProductReview[] = previewCatalog.flatMap((p, i) =>
  Array.from({ length: 3 }, (_, k) => {
    const [author, city] = reviewers[(i + k * 3) % reviewers.length];
    const [title, body] = reviewCopy[(i * 2 + k) % reviewCopy.length];
    const date = new Date(PREVIEW_TODAY);
    date.setDate(date.getDate() - (k * 11 + i * 3 + 2));
    return {
      id: `${p.id}-r${k}`,
      productSlug: p.slug,
      author,
      city,
      rating: k === 2 ? 4 : 5,
      title,
      body,
      date,
    };
  }),
);

export const previewSnapshot: CatalogSnapshot = {
  products: previewCatalog,
  categories: previewStoreCategories,
  brands: previewStoreBrands,
  reviews: previewReviews,
  source: "preview",
};
