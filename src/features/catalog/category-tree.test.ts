import { describe, expect, it } from "vitest";
import { descendantIds, pathIds, pathLabel, treeOrder } from "./category-tree";

const cats = [
  { id: "cycles", parentId: null, name: "Cycles" },
  { id: "toys", parentId: null, name: "Toys" },
  { id: "kids", parentId: "cycles", name: "Kids" },
  { id: "electric", parentId: "cycles", name: "Electric Cycles" },
  { id: "e-women", parentId: "electric", name: "Women" },
  { id: "e-kids", parentId: "electric", name: "Kids" },
  { id: "jcb", parentId: "toys", name: "Jcb" },
];

describe("category tree", () => {
  it("orders parents before children at any depth", () => {
    expect(treeOrder(cats).map((c) => `${c.depth}:${c.id}`)).toEqual(["0:cycles", "1:kids", "1:electric", "2:e-women", "2:e-kids", "0:toys", "1:jcb"]);
  });
  it("finds the full path and label", () => {
    expect(pathIds(cats, "e-women")).toEqual(["cycles", "electric", "e-women"]);
    expect(pathLabel(cats, "e-women")).toBe("Cycles › Electric Cycles › Women");
  });
  it("finds every level below", () => {
    expect([...descendantIds(cats, "cycles")].sort()).toEqual(["e-kids", "e-women", "electric", "kids"]);
    expect(descendantIds(cats, "jcb").size).toBe(0);
  });
  it("never loops on bad data", () => {
    const loop = [
      { id: "a", parentId: "b", name: "A" },
      { id: "b", parentId: "a", name: "B" },
    ];
    expect(pathIds(loop, "a")).toEqual(["b", "a"]);
    expect(treeOrder(loop)).toHaveLength(2);
    expect(descendantIds(loop, "a")).toEqual(new Set(["b"]));
  });
});
