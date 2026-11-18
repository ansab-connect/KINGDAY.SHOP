import { describe, expect, it } from "vitest";
import { productInputSchema } from "./schemas";
import { attachImages, checkRows, groupRows, mapHeaders, parseSpecs, rowsFromSheet, toProductInput, IMPORT_COLUMNS, type ImportImage } from "./bulk-import";

const cats = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Electric Jeeps & Cars" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Scooters" },
];
const brands = [{ id: "33333333-3333-4333-8333-333333333333", name: "Royal Rides" }];
const headers = IMPORT_COLUMNS.map((c) => c.header);
const row = (o: Record<string, unknown>) => IMPORT_COLUMNS.map((c) => o[c.key] ?? "");

describe("bulk import", () => {
  const values = [
    headers,
    row({ name: "SAMPLE Thunder Jeep", sku: "SAMPLE-1", category: "Electric Jeeps & Cars", mrp: 100, price: 90 }),
    row({ name: "Thunder Jeep", sku: "thunder-red", category: "electric jeeps & cars", brand: "Royal Rides", colour: "Red", mrp: "28,999", price: 23499, stock: 5, specs: "Battery: 12V 7Ah; Motor: 2 x 35W" }),
    row({ name: "Thunder Jeep", sku: "THUNDER-BLK", category: "Electric Jeeps & Cars", colour: "Black", mrp: 28999, price: 23499, stock: 2 }),
    row({ name: "Glide Scooter", sku: "GLIDE-1", category: "Scooters", brand: "Unknown Co", mrp: 2000, price: 2500, images: "glide.jpg" }),
    row({ name: "", sku: "", category: "" }),
  ];
  const { rows, missingColumns } = rowsFromSheet(values, cats, brands);

  it("reads rows, skips samples and empty lines, matches category/brand loosely", () => {
    expect(missingColumns).toEqual([]);
    expect(rows.map((r) => r.sku)).toEqual(["THUNDER-RED", "THUNDER-BLK", "GLIDE-1"]);
    expect(rows[0]).toMatchObject({ categoryId: cats[0].id, brandId: brands[0].id, mrp: "28999", rowNumber: 3 });
    expect(rows[2].brandId).toBe("");
  });

  it("reports missing required columns", () => {
    expect(rowsFromSheet([["Product Name", "SKU"]], cats, brands).missingColumns).toEqual(["Category *", "MRP (₹) *", "Selling Price (₹) *"]);
    expect(mapHeaders(["product name", "SKU *", " Selling Price (₹) "])).toMatchObject({ name: 0, sku: 1, price: 2 });
  });

  it("flags errors (price > MRP, duplicate/existing SKU) and warnings (unknown brand, images)", () => {
    const checks = checkRows([...rows, { ...rows[1], key: "dup" }], new Set(["GLIDE-1"]));
    expect(checks.get(rows[0].key)!.errors).toEqual([]);
    expect(checks.get(rows[1].key)!.errors).toContain("Same SKU appears more than once in this file.");
    const glide = checks.get(rows[2].key)!;
    expect(glide.errors).toEqual(expect.arrayContaining(["Selling price is higher than MRP.", "This SKU already exists in your store."]));
    expect(glide.warnings).toEqual(expect.arrayContaining(['Brand "Unknown Co" not found: it will be left empty.']));
  });

  it("matches images by listed name or by SKU", () => {
    const img = (name: string): ImportImage => ({ name, file: new File([""], name), url: "" });
    const files = new Map([["glide.jpg", img("glide.jpg")], ["thunder-red.png", img("THUNDER-RED.png")], ["thunder-red-2.jpg", img("THUNDER-RED-2.jpg")]]);
    const withImages = attachImages(rows, files);
    expect(withImages[0].images.map((i) => i.name)).toEqual(["THUNDER-RED-2.jpg", "THUNDER-RED.png"].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    expect(withImages[2].images.map((i) => i.name)).toEqual(["glide.jpg"]);
    expect(withImages[1].images).toEqual([]);
  });

  it("groups colours into one product that passes the real product schema", () => {
    const groups = groupRows(rows);
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
    const parsed = productInputSchema.safeParse(toProductInput(groups[0]));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.variants.map((v) => [v.sku, v.colour, v.mrp, v.price, v.opening_stock])).toEqual([
        ["THUNDER-RED", "Red", 2899900, 2349900, 5],
        ["THUNDER-BLK", "Black", 2899900, 2349900, 2],
      ]);
      expect(parsed.data.attributes).toEqual(parseSpecs("Battery: 12V 7Ah; Motor: 2 x 35W"));
      expect(parsed.data.status).toBe("draft");
    }
  });
});

describe("excel round trip", () => {
  it("reads a real .xlsx written with the template columns", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products");
    ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key }));
    ws.addRow({ name: "SAMPLE row", sku: "SAMPLE-1", category: "Scooters", mrp: 10, price: 9 });
    ws.addRow({ name: "Glide Scooter", sku: "glide-2", category: "Scooters", brand: "Royal Rides", mrp: 3499, price: 2799, stock: 4, specs: "Wheels: 3; Foldable: Yes", status: "Active" });
    ws.getCell("A4").value = { richText: [{ text: "Rich " }, { text: "Name" }] };
    ws.getCell("B4").value = "RICH-1";
    ws.getCell("C4").value = "Scooters";
    ws.getCell("H4").value = { formula: "1000+999", result: 1999 };
    ws.getCell("I4").value = 1500;
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await wb.xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("Products")!;
    const values: unknown[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) values.push((sheet.getRow(r).values as unknown[]).slice(1));
    const { rows } = rowsFromSheet(values, cats, brands);
    expect(rows.map((r) => [r.name, r.sku, r.mrp, r.price, r.status, r.rowNumber])).toEqual([
      ["Glide Scooter", "GLIDE-2", "3499", "2799", "active", 3],
      ["Rich Name", "RICH-1", "1999", "1500", "draft", 4],
    ]);
    expect(checkRows(rows, new Set()).get(rows[0].key)!.errors).toEqual([]);
  });
});
