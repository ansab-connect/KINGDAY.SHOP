import { describe, expect, it } from "vitest";
import { applySizes, removeSizes, sizeLabel, type SizeRow } from "./size-pricing";

let n = 0;
const row = (values: Record<string, string>, over: Partial<SizeRow> = {}): SizeRow => ({ key: `k${++n}`, values, category_id: "", is_active: true, mrp: "100", price: "90", ...over });
const make = (p: Partial<SizeRow>) => row(p.values ?? {}, p);
const sizes = [
  { id: "c24", label: "24 Inch" },
  { id: "c26", label: "26 Inch" },
];

describe("size-based pricing", () => {
  it("labels sizes from category names", () => {
    expect(sizeLabel("24 Inch | 18+ Years")).toBe("24 Inch");
    expect(sizeLabel("27.5 Inch")).toBe("27.5 Inch");
  });

  it("turns one plain variant into one variant per size, each linked to its category", () => {
    const r = applySizes([row({})], [], sizes, make);
    expect(r.types).toEqual(["Size"]);
    expect(r.rows.map((x) => [x.values.Size, x.category_id, x.price])).toEqual([
      ["24 Inch", "c24", "90"],
      ["26 Inch", "c26", "90"],
    ]);
  });

  it("crosses sizes with other variant types and links only the first row of each size", () => {
    const rows = [row({ "Speed Type": "Single" }), row({ "Speed Type": "Multi" }, { price: "120" })];
    const r = applySizes(rows, ["Speed Type"], sizes, make);
    expect(r.types).toEqual(["Size", "Speed Type"]);
    expect(r.rows.map((x) => `${x.values.Size}/${x.values["Speed Type"]}/${x.category_id}`)).toEqual([
      "24 Inch/Single/c24",
      "24 Inch/Multi/",
      "26 Inch/Single/c26",
      "26 Inch/Multi/",
    ]);
  });

  it("drops sizes that are no longer chosen and keeps each size's own price", () => {
    const first = applySizes([row({})], [], sizes, make).rows.map((x) => (x.values.Size === "26 Inch" ? { ...x, price: "150" } : x));
    const r = applySizes(first, ["Size"], [sizes[1]], make);
    expect(r.rows.map((x) => [x.values.Size, x.price, x.category_id])).toEqual([["26 Inch", "150", "c26"]]);
    expect(r.dropped.map((x) => x.values.Size)).toEqual(["24 Inch"]);
  });

  it("turns size variation off, one variant per remaining combination", () => {
    const on = applySizes([row({})], [], sizes, make);
    const off = removeSizes(on.rows, on.types, ["c24", "c26"]);
    expect(off.types).toEqual([]);
    expect(off.rows).toHaveLength(1);
    expect(off.rows[0].category_id).toBe("");
    expect(off.dropped).toHaveLength(1);
  });
});
