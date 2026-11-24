/** path: slugs from the top-level category down to this one (Cycles › Electric › Women). */
export type CategoryRef = { slug: string; name: string; parentSlug: string | null; path?: string[] };
export type BrandRef = { slug: string; name: string };

export type ProductImage = { src: string; alt: string };

/** One sellable unit: its own SKU, price and stock. Amounts in paise. */
export type StoreVariant = {
  id: string;
  name: string;
  sku: string;
  mrp: number;
  price: number;
  stock: number;
  colour: string | null;
  /** Main variant value (e.g. "12V") when the product has a main variant type. */
  option1: string | null;
  /** Sub variant value (e.g. "Volt Blue") when the product has a sub variant type. */
  option2: string | null;
  /** This combination's own gallery. Empty = use the product's shared images. */
  images: ProductImage[];
  /** Specifications for this combination (override product specs with the same label). */
  specs: { label: string; value: string }[];
  /** Value for each of the product's variant types, by type name. */
  values: Record<string, string>;
};

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  /** SKU of the default variant. */
  sku: string;
  category: CategoryRef;
  /** Extra categories it also shows in, each with the ones above it (slugs). */
  alsoIn?: string[];
  brand: BrandRef | null;
  /** Price of the default variant (paise). */
  mrp: number;
  price: number;
  /** Total available stock across active variants. */
  stock: number;
  variants: StoreVariant[];
  defaultVariantId: string;
  /** Main variant type, e.g. "Size". Null = simple variant list. */
  option1Name: string | null;
  /** Sub variant type under each main value, e.g. "Colour". */
  option2Name: string | null;
  /** Ordered variant types (first = main), e.g. ["Wheel Size", "Colour", "Speed Type"]. Empty = simple list. */
  variantTypes: string[];
  /** % off when paid online (Razorpay) and for cash on delivery. Applied by the database at checkout. */
  prepaidDiscountPct: number;
  codDiscountPct: number;
  /** Images not tied to a variant (used when a variant has none of its own). */
  sharedImages: ProductImage[];
  rating: number;
  reviewCount: number;
  ageRange: string | null;
  shortDescription: string;
  description: string[];
  highlights: string[];
  specs: { label: string; value: string }[];
  /** Listing images: shared images, or the default variant's gallery when there are none. */
  images: ProductImage[];
  video: string | null;
  /** Instagram reel / YouTube link shown in the gallery. */
  videoLink?: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  isNew: boolean;
  isBestseller: boolean;
  isFeatured: boolean;
  /** Sort key for "newest". Higher = newer. */
  addedRank: number;
};

export type StoreCategory = {
  slug: string;
  name: string;
  parentSlug: string | null;
  /** Slugs from the top-level category down to this one. */
  path: string[];
  /** 0 = top level. */
  depth: number;
  description: string;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
};

export type StoreBrand = BrandRef & { description: string; logoUrl: string | null; productCount: number };

export type ProductReview = {
  id: string;
  productSlug: string;
  author: string;
  city: string | null;
  rating: number;
  title: string;
  body: string;
  date: Date;
};

export type CatalogSnapshot = {
  products: StoreProduct[];
  categories: StoreCategory[];
  brands: StoreBrand[];
  reviews: ProductReview[];
  source: "preview" | "supabase";
};

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "discount", label: "Biggest discount" },
  { value: "rating", label: "Top rated" },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export type ProductFilters = {
  q?: string;
  category?: string;
  brands?: string[];
  minPrice?: number; // rupees
  maxPrice?: number; // rupees
  inStock?: boolean;
  onOffer?: boolean;
  sort?: SortOption;
  page?: number;
};

/** Every category a product shows in: its main category's path plus any extra categories. */
export function productCategorySlugs(p: Pick<StoreProduct, "category" | "alsoIn">): string[] {
  const main = p.category.path ?? [p.category.slug, ...(p.category.parentSlug ? [p.category.parentSlug] : [])];
  return p.alsoIn?.length ? [...new Set([...main, ...p.alsoIn])] : main;
}
