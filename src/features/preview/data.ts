/**
 * DEVELOPMENT PREVIEW DATA — NOT PRODUCTION DATA.
 *
 * Deterministic, clearly fictional records used to design the admin panel before
 * Supabase is connected (Phase 4). Every screen that renders this data shows a
 * "Preview data" notice. Nothing here is ever written to a database.
 */
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/features/orders/types";

export const PREVIEW_TODAY = new Date("2026-11-13T10:00:00+05:30");

// Small seeded PRNG so preview data is stable across renders and builds.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261113);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const daysAgo = (n: number, hour = 11) => {
  const d = new Date(PREVIEW_TODAY);
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(rand() * 60));
  return d;
};

// ---------------------------------------------------------------- Catalogue

export type PreviewCategory = {
  id: string;
  name: string;
  slug: string;
  parent: string | null;
  productCount: number;
  active: boolean;
};

export const previewCategories: PreviewCategory[] = [
  { id: "c1", name: "Electric Jeeps & Cars", slug: "electric-jeeps-cars", parent: null, productCount: 18, active: true },
  { id: "c1a", name: "Ride-on Jeeps", slug: "ride-on-jeeps", parent: "Electric Jeeps & Cars", productCount: 9, active: true },
  { id: "c1b", name: "Licensed Cars", slug: "licensed-cars", parent: "Electric Jeeps & Cars", productCount: 9, active: true },
  { id: "c2", name: "Bikes", slug: "bikes", parent: null, productCount: 11, active: true },
  { id: "c3", name: "Scooters", slug: "scooters", parent: null, productCount: 8, active: true },
  { id: "c4", name: "Tricycles", slug: "tricycles", parent: null, productCount: 7, active: true },
  { id: "c5", name: "Cycles", slug: "cycles", parent: null, productCount: 12, active: true },
  { id: "c6", name: "Toys", slug: "toys", parent: null, productCount: 24, active: true },
  { id: "c7", name: "Baby Accessories", slug: "baby-accessories", parent: null, productCount: 15, active: false },
];

export type PreviewBrand = { id: string; name: string; slug: string; productCount: number; active: boolean };

export const previewBrands: PreviewBrand[] = [
  { id: "b1", name: "KING DAY Originals", slug: "kingday-originals", productCount: 21, active: true },
  { id: "b2", name: "Royal Rides", slug: "royal-rides", productCount: 14, active: true },
  { id: "b3", name: "Little Voyager", slug: "little-voyager", productCount: 12, active: true },
  { id: "b4", name: "Tiny Trail", slug: "tiny-trail", productCount: 9, active: true },
  { id: "b5", name: "Cuddle Crown", slug: "cuddle-crown", productCount: 7, active: false },
];

export type PreviewProductStatus = "active" | "draft" | "archived";

export type PreviewProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  mrp: number; // paise
  price: number; // paise
  stock: number;
  reorderLevel: number;
  variants: number;
  status: PreviewProductStatus;
  featured: boolean;
  unitsSold30d: number;
};

const productSeeds: Array<[string, string, string, number, number]> = [
  ["Thunder 12V Ride-on Jeep", "Electric Jeeps & Cars", "Royal Rides", 2899900, 2349900],
  ["Majesty 4x4 Electric Jeep", "Electric Jeeps & Cars", "KING DAY Originals", 4499900, 3899900],
  ["Roadster Mini Electric Car", "Electric Jeeps & Cars", "Royal Rides", 2199900, 1849900],
  ["Crown Cruiser Electric Car", "Electric Jeeps & Cars", "KING DAY Originals", 3299900, 2799900],
  ["Bolt Kids Electric Bike", "Bikes", "Little Voyager", 1899900, 1599900],
  ["Rally Balance Bike", "Bikes", "Tiny Trail", 449900, 379900],
  ["Glide 3-Wheel Scooter", "Scooters", "Little Voyager", 349900, 279900],
  ["Comet Electric Scooter", "Scooters", "KING DAY Originals", 1299900, 1099900],
  ["Royal Push Tricycle", "Tricycles", "KING DAY Originals", 649900, 549900],
  ["Explorer Parent-Handle Trike", "Tricycles", "Tiny Trail", 799900, 699900],
  ["Trail 16\" Kids Cycle", "Cycles", "Little Voyager", 899900, 749900],
  ["Prince 20\" Gear Cycle", "Cycles", "Royal Rides", 1349900, 1149900],
  ["Castle Building Blocks Set", "Toys", "KING DAY Originals", 249900, 199900],
  ["Remote Racer Car", "Toys", "Royal Rides", 329900, 269900],
  ["Plush Lion Cub", "Toys", "Cuddle Crown", 129900, 99900],
  ["Soft-Grip Baby Walker", "Baby Accessories", "Cuddle Crown", 499900, 429900],
  ["Comfort Car Seat", "Baby Accessories", "Cuddle Crown", 1199900, 999900],
  ["Royal Safety Helmet", "Bikes", "KING DAY Originals", 199900, 159900],
];

export const previewProducts: PreviewProduct[] = productSeeds.map(([name, category, brand, mrp, price], i) => {
  const stock = i % 6 === 2 ? Math.floor(rand() * 4) : 5 + Math.floor(rand() * 40);
  return {
    id: `p${i + 1}`,
    name,
    sku: `KD-${category.slice(0, 3).toUpperCase()}-${String(1001 + i)}`,
    category,
    brand,
    mrp,
    price,
    stock,
    reorderLevel: 5,
    variants: 1 + Math.floor(rand() * 4),
    status: i === 16 ? "draft" : i === 14 ? "archived" : "active",
    featured: i % 4 === 0,
    unitsSold30d: Math.floor(rand() * 40) + (price > 2000000 ? 4 : 10),
  };
});

// ---------------------------------------------------------------- Customers

const firstNames = ["Aarav", "Diya", "Vihaan", "Anaya", "Reyansh", "Ishaan", "Myra", "Kabir", "Saanvi", "Arjun", "Zara", "Advik"];
const lastNames = ["Menon", "Sharma", "Nair", "Iyer", "Khan", "Patel", "Reddy", "Thomas", "Kapoor", "Das"];
const cities = ["Kochi", "Bengaluru", "Chennai", "Mumbai", "Hyderabad", "Kozhikode", "Pune", "Delhi", "Thrissur"];

export type PreviewCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  orders: number;
  totalSpent: number; // paise
  joinedAt: Date;
  lastOrderAt: Date | null;
  /** Customer ID shown to staff and customers, e.g. KD-CUS-000011. */
  code?: string | null;
};

export const previewCustomers: PreviewCustomer[] = Array.from({ length: 14 }, (_, i) => {
  const first = firstNames[i % firstNames.length];
  const last = pick(lastNames);
  return {
    id: `u${i + 1}`,
    code: `KD-CUS-${String(i + 1).padStart(6, "0")}`,
    name: `${first} ${last} (Preview)`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    phone: `+91 90000 0${String(1000 + i).slice(-4)}`,
    city: pick(cities),
    orders: 0,
    totalSpent: 0,
    joinedAt: daysAgo(30 + Math.floor(rand() * 200)),
    lastOrderAt: null,
  };
});

// ---------------------------------------------------------------- Orders

export type PreviewOrder = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  city: string;
  items: number;
  total: number; // paise
  discount: number; // paise
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  placedAt: Date;
};

function statusForAge(age: number): OrderStatus {
  if (age === 0) return pick(["new", "new", "pending", "confirmed"] as const);
  if (age <= 2) return pick(["confirmed", "processing", "packed", "pending"] as const);
  if (age <= 5) return pick(["shipped", "packed", "shipped", "delivered"] as const);
  return pick(["delivered", "delivered", "delivered", "delivered", "cancelled", "returned", "refunded"] as const);
}

export const previewOrders: PreviewOrder[] = (() => {
  const orders: PreviewOrder[] = [];
  let seq = 1240;
  for (let age = 59; age >= 0; age--) {
    const count = 1 + Math.floor(rand() * (age < 30 ? 5 : 4));
    for (let k = 0; k < count; k++) {
      const customer = pick(previewCustomers);
      const product = pick(previewProducts);
      const qty = rand() > 0.8 ? 2 : 1;
      const discount = rand() > 0.75 ? Math.round(product.price * qty * 0.05) : 0;
      const status = statusForAge(age);
      const method: PaymentMethod = rand() > 0.3 ? "razorpay" : "cod";
      const paymentStatus: PaymentStatus =
        status === "refunded"
          ? "refunded"
          : status === "cancelled"
            ? "failed"
            : method === "cod" && status !== "delivered"
              ? "pending"
              : "paid";
      orders.push({
        id: `o${seq}`,
        number: `KD-${seq++}`,
        customerId: customer.id,
        customerName: customer.name,
        city: customer.city,
        items: qty,
        total: product.price * qty - discount,
        discount,
        status,
        paymentStatus,
        paymentMethod: method,
        placedAt: daysAgo(age, 9 + Math.floor(rand() * 11)),
      });
    }
  }
  return orders.reverse(); // newest first
})();

// Back-fill customer aggregates from orders.
for (const c of previewCustomers) {
  const own = previewOrders.filter((o) => o.customerId === c.id);
  c.orders = own.length;
  c.totalSpent = own
    .filter((o) => !["cancelled", "refunded", "returned"].includes(o.status))
    .reduce((s, o) => s + o.total, 0);
  c.lastOrderAt = own[0]?.placedAt ?? null;
}

// ---------------------------------------------------------------- Inventory

export type StockMovementType = "opening" | "stock_in" | "stock_out" | "adjustment" | "sale" | "sale_reversal" | "return" | "purchase";

export type PreviewStockMovement = {
  id: string;
  sku: string;
  product: string;
  type: StockMovementType;
  quantity: number;
  balance: number;
  reason: string;
  by: string;
  at: Date;
};

export const previewStockMovements: PreviewStockMovement[] = previewProducts.slice(0, 10).flatMap((p, i) => {
  const rows: PreviewStockMovement[] = [
    { id: `m${i}a`, sku: p.sku, product: p.name, type: "stock_in", quantity: 12, balance: p.stock + 6, reason: "Supplier delivery", by: "Staff (Preview)", at: daysAgo(6 + i) },
    { id: `m${i}b`, sku: p.sku, product: p.name, type: "sale", quantity: -6, balance: p.stock, reason: "Online orders", by: "System", at: daysAgo(i % 4) },
  ];
  if (i % 3 === 0) {
    rows.push({ id: `m${i}c`, sku: p.sku, product: p.name, type: "adjustment", quantity: -1, balance: p.stock, reason: "Damaged in transit", by: "Admin (Preview)", at: daysAgo(i % 5, 16) });
  }
  return rows;
}).sort((a, b) => b.at.getTime() - a.at.getTime());

// ---------------------------------------------------------------- Coupons

export type PreviewCoupon = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number; // percent or paise
  minOrder: number; // paise
  used: number;
  limit: number | null;
  expiresAt: Date;
  active: boolean;
};

export const previewCoupons: PreviewCoupon[] = [
  { id: "cp1", code: "ROYAL10", type: "percentage", value: 10, minOrder: 500000, used: 42, limit: 200, expiresAt: daysAgo(-30), active: true },
  { id: "cp2", code: "FIRSTRIDE", type: "fixed", value: 100000, minOrder: 1000000, used: 18, limit: null, expiresAt: daysAgo(-90), active: true },
  { id: "cp3", code: "DIWALI26", type: "percentage", value: 15, minOrder: 1500000, used: 120, limit: 120, expiresAt: daysAgo(3), active: false },
  { id: "cp4", code: "TRIKE500", type: "fixed", value: 50000, minOrder: 400000, used: 7, limit: 50, expiresAt: daysAgo(-14), active: true },
];
