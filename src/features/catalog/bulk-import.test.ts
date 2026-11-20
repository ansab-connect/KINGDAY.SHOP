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
    const letter = (key: string) => String.fromCharCode(65 + IMPORT_COLUMNS.findIndex((c) => c.key === key));
    ws.getCell(`${letter("mrp")}4`).value = { formula: "1000+999", result: 1999 };
    ws.getCell(`${letter("price")}4`).value = 1500;
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

describe("fallback readers", () => {
  it("reads raw xlsx XML (shared strings, inline strings, numbers, gaps, hidden sheets)", async () => {
    const { readXlsxPackage, readCsv } = await import("./bulk-import");
    const files = {
      "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="Lists" sheetId="1" state="hidden" r:id="rId1"/><sheet name="Products" sheetId="2" r:id="rId2"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      "xl/sharedStrings.xml": '<sst><si><t>Product Name *</t></si><si><t>SKU *</t></si><si><r><t>Glide </t></r><r><t>Scooter &amp; Co</t></r></si><si><t>Category *</t></si><si><t>Scooters</t></si></sst>',
      "xl/worksheets/sheet2.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c><c r="H1" t="inlineStr"><is><t>MRP (₹) *</t></is></c><c r="I1" t="inlineStr"><is><t>Selling Price (₹) *</t></is></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="str"><v>GLIDE-9</v></c><c r="C3" t="s"><v>4</v></c><c r="H3"><v>3499</v></c><c r="I3"><v>2799</v></c></row></sheetData></worksheet>',
    };
    const values = readXlsxPackage(files);
    const { rows, missingColumns } = rowsFromSheet(values, cats, brands);
    expect(missingColumns).toEqual([]);
    expect(rows.map((r) => [r.name, r.sku, r.categoryId, r.mrp, r.price, r.rowNumber])).toEqual([["Glide Scooter & Co", "GLIDE-9", cats[1].id, "3499", "2799", 3]]);

    const csv = readCsv('﻿Product Name *;SKU *;Category *;Brand;Variant / Colour;Short Description;Description;MRP (₹) *;Selling Price (₹) *\n"Jeep; ""Pro""";JEEP-1;Scooters;;;;;"1,999";1499\r\n');
    const parsed = rowsFromSheet(csv, cats, brands);
    expect(parsed.rows.map((r) => [r.name, r.sku, r.mrp, r.price])).toEqual([['Jeep; "Pro"', "JEEP-1", "1999", "1499"]]);
  });

  it("reads a real .xlsx through the fallback path too", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { unzipSync, strFromU8 } = await import("fflate");
    const { readXlsxPackage } = await import("./bulk-import");
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Lists", { state: "hidden" }).getCell("A1").value = "Scooters";
    const ws = wb.addWorksheet("Products");
    ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key }));
    ws.addRow({ name: "Glide Scooter", sku: "GLIDE-3", category: "Scooters", mrp: 3499, price: 2799, stock: 4 });
    const zip = unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()), { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
    const values = readXlsxPackage(Object.fromEntries(Object.entries(zip).map(([k, v]) => [k, strFromU8(v)])));
    const { rows } = rowsFromSheet(values, cats, brands);
    expect(rows.map((r) => [r.sku, r.mrp, r.price, r.stock])).toEqual([["GLIDE-3", "3499", "2799", "4"]]);
  });
});

describe("multi-level variants", () => {
  const base = { category: "Scooters", mrp: 3000, price: 2500 };
  const sheet = (rows: Record<string, unknown>[]) => {
    const headers = IMPORT_COLUMNS.map((c) => c.header);
    return [headers, ...rows.map((r) => IMPORT_COLUMNS.map((c) => (r[c.key] ?? "") as unknown))];
  };
  it("groups size → colour rows into one product with per-variant specs", () => {
    const { rows } = rowsFromSheet(
      sheet([
        { ...base, name: "Volt Rider", sku: "VR-S-BLU", option1Name: "Size", option1: "Small", option2Name: "Colour", option2: "Volt Blue", specs: "Wheel: 6 inch" },
        { ...base, name: "Volt Rider", sku: "VR-S-GRN", option1: "Small", option2: "Dynamic Green" },
        { ...base, name: "Volt Rider", sku: "VR-L-BLU", option1: "Large", option2: "Volt Blue", specs: "Wheel: 8 inch" },
      ]),
      cats,
      brands,
    );
    const checks = checkRows(rows, new Set());
    expect(rows.every((r) => checks.get(r.key)!.errors.length === 0)).toBe(true);
    const input = toProductInput(groupRows(rows)[0]);
    expect(input.option1_name).toBe("Size");
    expect(input.option2_name).toBe("Colour");
    expect(input.variants.map((v) => [v.option1, v.option2, v.colour])).toEqual([
      ["Small", "Volt Blue", "Volt Blue"],
      ["Small", "Dynamic Green", "Dynamic Green"],
      ["Large", "Volt Blue", "Volt Blue"],
    ]);
    expect(input.variants[2].specs).toEqual([{ name: "Wheel", value: "8 inch" }]);
    expect(input.variants[0].specs).toEqual([]);
  });
  it("flags duplicate combinations and missing values", () => {
    const { rows } = rowsFromSheet(
      sheet([
        { ...base, name: "Volt Rider", sku: "VR-1", option1Name: "Size", option1: "Small", option2Name: "Colour", option2: "Red" },
        { ...base, name: "Volt Rider", sku: "VR-2", option1: "small", option2: "red" },
        { ...base, name: "Volt Rider", sku: "VR-3", option1: "Large" },
      ]),
      cats,
      brands,
    );
    const checks = checkRows(rows, new Set());
    expect(checks.get(rows[1].key)!.errors.join(" ")).toMatch(/Same variant combination/);
    // A main value may have no sub-variants (Large is sold as one variant).
    expect(checks.get(rows[2].key)!.errors).toEqual([]);
  });
  it("imports any number of sub-variant types per main value", () => {
    const { rows } = rowsFromSheet(
      sheet([
        { ...base, name: "Volt Cycle", sku: "VC-24-BLU-SS", option1Name: "Wheel Size", option1: "24\"", option2Name: "Colour", option2: "Volt Blue", more: "Speed Type: Single Speed" },
        { ...base, name: "Volt Cycle", sku: "VC-24-BLU-MS", option1: "24\"", option2: "Volt Blue", more: "Speed Type: Multi Speed" },
        { ...base, name: "Volt Cycle", sku: "VC-29-RED-DB", option1: "29\"", option2: "Red", more: "Brake Type: Disc Brake" },
        { ...base, name: "Volt Cycle", sku: "VC-29-RED-VB", option1: "29\"", option2: "Red", more: "Brake Type: V-Brake" },
      ]),
      cats,
      brands,
    );
    const checks = checkRows(rows, new Set());
    rows.forEach((r) => expect(checks.get(r.key)!.errors).toEqual([]));
    const input = toProductInput(rows);
    expect(input.variant_types).toEqual(["Wheel Size", "Colour", "Speed Type", "Brake Type"]);
    expect(input.variants[0].values).toEqual({ "Wheel Size": "24\"", Colour: "Volt Blue", "Speed Type": "Single Speed" });
    expect(input.variants[3].values).toEqual({ "Wheel Size": "29\"", Colour: "Red", "Brake Type": "V-Brake" });
  });
  it("flags mixed sub-variant types under one main value and bad cells", () => {
    const { rows } = rowsFromSheet(
      sheet([
        { ...base, name: "Volt Cycle", sku: "VC-1", option1Name: "Wheel Size", option1: "24\"", more: "Speed Type: Single Speed" },
        { ...base, name: "Volt Cycle", sku: "VC-2", option1: "24\"", more: "Brake Type: Disc" },
        { ...base, name: "Volt Cycle", sku: "VC-3", option1: "26\"", more: "Single Speed" },
      ]),
      cats,
      brands,
    );
    const checks = checkRows(rows, new Set());
    expect(checks.get(rows[1].key)!.errors.join(" ")).toMatch(/same sub-variant types as row 2/);
    expect(checks.get(rows[2].key)!.errors.join(" ")).toMatch(/Type: value/);
  });
});
