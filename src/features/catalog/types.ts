export type CategoryRef = { slug: string; name: string };
export type BrandRef = { slug: string; name: string };

export type ProductImage = { src: string; alt: string };

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  category: CategoryRef;
  brand: BrandRef;
  /** Amounts in paise. */
  mrp: number;
  price: number;
  stock: number;
  rating: number;
  reviewCount: number;
  ageRange: string;
  shortDescription: string;
  description: string[];
  highlights: string[];
  specs: { label: string; value: string }[];
  colours: { name: string; hex: string }[];
  images: ProductImage[];
  video: string | null;
  isNew: boolean;
  isBestseller: boolean;
  isFeatured: boolean;
  /** Sort key for "newest". Higher = newer. */
  addedRank: number;
};

export type StoreCategory = CategoryRef & {
  description: string;
  productCount: number;
};

export type StoreBrand = BrandRef & { description: string; productCount: number };

export type ProductReview = {
  id: string;
  productSlug: string;
  author: string;
  city: string;
  rating: number;
  title: string;
  body: string;
  date: Date;
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
