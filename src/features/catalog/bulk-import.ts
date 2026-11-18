/**
 * Bulk product import: template columns, row parsing, validation and grouping.
 * Pure functions (no DOM, no Supabase) so they run in the browser and in tests.
 * Every product is still validated again on the server by saveProduct().
 */
import { rupeesToPaise, SKU_RE } from "./schemas";

export const IMPORT_COLUMNS = [
  { key: "name", header: "Product Name *", width: 34, note: "Rows with the same name and category become one product with several colours/variants." },
  { key: "sku", header: "SKU *", width: 20, note: "3–40 capital letters, numbers or hyphens. Must be unique." },
  { key: "category", header: "Category *", width: 24, note: "Pick from the list (existing categories)." },
  { key: "brand", header: "Brand", width: 18, note: "Optional. Pick from the list." },
  { key: "colour", header: "Variant / Colour", width: 16, note: "e.g. Red. Leave empty for a single-variant product." },
  { key: "short", header: "Short Description", width: 40, note: "1–2 lines shown near the price (max 300 characters)." },
  { key: "description", header: "Description", width: 50, note: "Full description." },
  { key: "mrp", header: "MRP (₹) *", width: 12, note: "Number only, e.g. 28999" },
  { key: "price", header: "Selling Price (₹) *", width: 16, note: "Can't be higher than MRP." },
  { key: "stock", header: "Stock", width: 10, note: "Opening stock (whole number). Empty = 0." },
  { key: "specs", header: "Specifications", width: 44, note: "Name: value; separated by semicolons. e.g. Battery: 12V 7Ah; Motor: 2 x 35W" },
  { key: "age", header: "Age Range", width: 14, note: "e.g. 3–8 years" },
  { key: "images", header: "Image File Names", width: 34, note: "Comma separated, matching files in your ZIP/folder. Empty = files named after the SKU (SKU.jpg, SKU-2.jpg)." },
  { key: "status", header: "Status", width: 12, note: "draft (default) or active" },
] as const;

export type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type Option = { id: string; name: string };

export type ImportImage = { name: string; file: File; url: string };

export type ImportRow = {
  key: string;
  rowNumber: number;
  name: string;
  sku: string;
  categoryId: string;
  categoryText: string;
  brandId: string;
  brandText: string;
  colour: string;
  short: string;
  description: string;
  mrp: string;
  price: string;
  stock: string;
  specs: string;
  age: string;
  status: "draft" | "active";
  imageNames: string[];
  images: ImportImage[];
};

export type RowCheck = { errors: string[]; warnings: string[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function matchOption(text: string, options: Option[]): string {
  const t = norm(text);
  if (!t) return "";
  return options.find((o) => norm(o.name) === t)?.id ?? options.find((o) => norm(o.name).replace(/[^a-z0-9]/g, "") === t.replace(/[^a-z0-9]/g, ""))?.id ?? "";
}

/** Cell value from ExcelJS (string, number, rich text, hyperlink, formula result) → plain text. */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
  }
  return String(v).trim();
}

/** Maps a header row to column keys (tolerant of missing "*", case and spacing). */
export function mapHeaders(headers: string[]): Partial<Record<ColumnKey, number>> {
  const out: Partial<Record<ColumnKey, number>> = {};
  const clean = (h: string) => h.toLowerCase().replace(/[*()₹]/g, "").replace(/\s+/g, " ").trim();
  headers.forEach((h, i) => {
    const c = clean(h);
    const col = IMPORT_COLUMNS.find((x) => clean(x.header) === c);
    if (col && out[col.key] === undefined) out[col.key] = i;
  });
  return out;
}

export function parseSpecs(text: string): { name: string; value: string }[] {
  return text
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(":");
      return i > 0 ? { name: p.slice(0, i).trim().slice(0, 60), value: p.slice(i + 1).trim().slice(0, 200) } : { name: "", value: "" };
    })
    .filter((a) => a.name && a.value);
}

/** Builds rows from sheet values (array of row arrays, first = headers). Sample rows are skipped. */
export function rowsFromSheet(values: unknown[][], categories: Option[], brands: Option[]): { rows: ImportRow[]; missingColumns: string[] } {
  const [headerRow = [], ...body] = values;
  const map = mapHeaders(headerRow.map(cellText));
  const required: ColumnKey[] = ["name", "sku", "category", "mrp", "price"];
  const missingColumns = required.filter((k) => map[k] === undefined).map((k) => IMPORT_COLUMNS.find((c) => c.key === k)!.header);
  const get = (r: unknown[], k: ColumnKey) => (map[k] === undefined ? "" : cellText(r[map[k]!]));
  const rows: ImportRow[] = [];
  body.forEach((r, i) => {
    if (!r || r.every((c) => cellText(c) === "")) return;
    const name = get(r, "name");
    if (/^sample\b/i.test(name)) return; // template examples
    const categoryText = get(r, "category");
    const brandText = get(r, "brand");
    rows.push({
      key: `r${i + 2}-${Math.random().toString(36).slice(2, 7)}`,
      rowNumber: i + 2,
      name,
      sku: get(r, "sku").toUpperCase().replace(/\s+/g, ""),
      categoryId: matchOption(categoryText, categories),
      categoryText,
      brandId: matchOption(brandText, brands),
      brandText,
      colour: get(r, "colour"),
      short: get(r, "short"),
      description: get(r, "description"),
      mrp: get(r, "mrp").replace(/[,₹\s]/g, ""),
      price: get(r, "price").replace(/[,₹\s]/g, ""),
      stock: get(r, "stock").replace(/[,\s]/g, ""),
      specs: get(r, "specs"),
      age: get(r, "age"),
      status: /^active$/i.test(get(r, "status")) ? "active" : "draft",
      imageNames: get(r, "images").split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      images: [],
    });
  });
  return { rows, missingColumns };
}

/** Image lookup key: file name without folders, lower case. */
export const imageKey = (name: string) => name.split(/[\\/]/).pop()!.trim().toLowerCase();
const stem = (name: string) => imageKey(name).replace(/\.[a-z0-9]+$/, "");

/** Attaches uploaded images to rows: by listed file names, else by SKU (SKU.jpg, SKU-2.jpg, SKU_2.jpg). */
export function attachImages(rows: ImportRow[], files: Map<string, ImportImage>): ImportRow[] {
  const byStem = new Map<string, ImportImage[]>();
  for (const img of files.values()) {
    const s = stem(img.name);
    byStem.set(s, [...(byStem.get(s) ?? []), img]);
  }
  return rows.map((row) => {
    let images: ImportImage[] = [];
    if (row.imageNames.length) {
      images = row.imageNames.map((n) => files.get(imageKey(n)) ?? byStem.get(stem(n))?.[0]).filter((x): x is ImportImage => Boolean(x));
    } else if (row.sku) {
      const s = row.sku.toLowerCase();
      images = [...files.values()]
        .filter((img) => {
          const st = stem(img.name);
          return st === s || new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-_ ]\\d{1,2}$`).test(st);
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    return { ...row, images: images.slice(0, 12) };
  });
}

/** Errors block the row from importing; warnings are shown but don't. */
export function checkRows(rows: ImportRow[], existingSkus: Set<string>): Map<string, RowCheck> {
  const counts = new Map<string, number>();
  rows.forEach((r) => r.sku && counts.set(r.sku, (counts.get(r.sku) ?? 0) + 1));
  const out = new Map<string, RowCheck>();
  for (const r of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (r.name.trim().length < 2) errors.push("Product name is missing.");
    if (r.name.length > 160) errors.push("Product name is too long (max 160).");
    if (!r.sku) errors.push("SKU is missing.");
    else if (!SKU_RE.test(r.sku)) errors.push("SKU: use 3–40 capital letters, numbers or hyphens.");
    else if ((counts.get(r.sku) ?? 0) > 1) errors.push("Same SKU appears more than once in this file.");
    else if (existingSkus.has(r.sku)) errors.push("This SKU already exists in your store.");
    if (!r.categoryId) errors.push(r.categoryText ? `Category "${r.categoryText}" doesn't exist.` : "Category is missing.");
    const mrp = rupeesToPaise(r.mrp);
    const price = rupeesToPaise(r.price);
    if (!r.mrp || !Number.isFinite(mrp) || mrp <= 0) errors.push("MRP is missing or not a number.");
    if (!r.price || !Number.isFinite(price) || price <= 0) errors.push("Selling price is missing or not a number.");
    if (Number.isFinite(mrp) && Number.isFinite(price) && price > mrp) errors.push("Selling price is higher than MRP.");
    if (r.stock && (!/^\d+$/.test(r.stock) || Number(r.stock) > 100000)) errors.push("Stock must be a whole number (0–100000).");
    if (r.short.length > 300) errors.push("Short description is too long (max 300).");
    if (r.description.length > 10000) errors.push("Description is too long.");
    if (r.brandText && !r.brandId) warnings.push(`Brand "${r.brandText}" not found: it will be left empty.`);
    if (r.imageNames.length && r.images.length < r.imageNames.length) warnings.push(`${r.imageNames.length - r.images.length} image file(s) not found in the upload.`);
    if (!r.images.length) warnings.push("No images.");
    if (r.specs && !parseSpecs(r.specs).length) warnings.push('Specifications not understood. Use "Name: value; Name: value".');
    out.set(r.key, { errors, warnings });
  }
  return out;
}

/** Rows with the same name + category become one product with one variant per row. */
export function groupRows(rows: ImportRow[]): ImportRow[][] {
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const k = `${norm(r.name)}|${r.categoryId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()];
}

/** Input for the existing saveProduct() server action (validated there again). */
export function toProductInput(group: ImportRow[], slug?: string) {
  const first = group[0];
  const attributes = parseSpecs(group.map((r) => r.specs).find(Boolean) ?? "");
  const seen = new Set<string>();
  return {
    name: first.name.trim(),
    slug: slug ?? "",
    category_id: first.categoryId,
    brand_id: first.brandId || null,
    short_description: first.short || undefined,
    description: group.map((r) => r.description).find(Boolean) || undefined,
    highlights: [],
    age_range: first.age || undefined,
    status: group.some((r) => r.status === "active") ? "active" : "draft",
    is_featured: false,
    variants: group.map((r, i) => ({
      sku: r.sku,
      name: r.colour || (group.length > 1 ? r.sku : "Default"),
      colour: r.colour || undefined,
      mrp: r.mrp,
      price: r.price,
      opening_stock: r.stock ? Number(r.stock) : 0,
      is_active: true,
      is_default: i === 0,
    })),
    attributes: attributes.filter((a) => {
      const k = a.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  };
}
