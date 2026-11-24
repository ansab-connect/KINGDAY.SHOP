import { describe, expect, it } from "vitest";
import { planGallery, poolPaths, unusedPoolPaths } from "./image-pool";

const P = "11111111-1111-4111-8111-111111111111";
const path = (n: string) => `products/${P}/${n}`;

describe("temporary image pool", () => {
  it("lists only image files of the product folder", () => {
    expect(poolPaths(P, ["abcdefgh12.webp", ".emptyFolderPlaceholder", "sub", "ABC.webp", "abcdefgh34.jpg"])).toEqual([path("abcdefgh12.webp"), path("abcdefgh34.jpg")]);
  });

  it("never treats an assigned image as unused", () => {
    const all = [path("aaaaaaaa.webp"), path("bbbbbbbb.webp"), path("cccccccc.webp")];
    expect(unusedPoolPaths(all, [path("bbbbbbbb.webp")])).toEqual([path("aaaaaaaa.webp"), path("cccccccc.webp")]);
    expect(unusedPoolPaths(all, all)).toEqual([]);
  });

  it("plans a variant gallery: keep, add, drop, order", () => {
    const current = [
      { id: "r1", storage_path: path("aaaaaaaa.webp") },
      { id: "r2", storage_path: path("bbbbbbbb.webp") },
      { id: "r3", storage_path: path("aaaaaaaa.webp") }, // duplicate row of the same file
    ];
    const plan = planGallery(current, [path("cccccccc.webp"), path("aaaaaaaa.webp"), path("cccccccc.webp")]);
    expect(plan.wanted).toEqual([path("cccccccc.webp"), path("aaaaaaaa.webp")]);
    expect(plan.add).toEqual([path("cccccccc.webp")]);
    expect(plan.remove).toEqual(["r2", "r3"]);
    expect(plan.existingIdFor(path("aaaaaaaa.webp"))).toBe("r1");
  });

  it("caps a gallery at 12 images", () => {
    const many = Array.from({ length: 15 }, (_, i) => path(`img${String(i).padStart(5, "0")}.webp`));
    expect(planGallery([], many).add).toHaveLength(12);
  });
});
