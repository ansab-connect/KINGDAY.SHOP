export type CategoryRef = { slug: string; name: string; parentSlug: string | null };
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
};

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  /** SKU of the default variant. */
  sku: string;
  category: CategoryRef;
  brand: BrandRef | null;
  /** Price of the default variant (paise). */
  mrp: number;
  price: number;
  /** Total available stock across active variants. */
  stock: number;
  variants: StoreVariant[];
  defaultVariantId: string;
  rating: number;
  reviewCount: number;
  ageRange: string | null;
  shortDescription: string;
  description: string[];
  highlights: string[];
  specs: { label: string; value: string }[];
  images: ProductImage[];
  video: string | null;
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
