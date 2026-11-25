import { describe, expect, it } from "vitest";
import { matchVariant, normaliseGst, type VariantOption } from "./shared";

const opts: VariantOption[] = [
  { id: "a", product: "Hero Sprint MTB", label: "Hero Sprint MTB · 26 Inch · Single Speed", sku: "KD-HSP-26S" },
  { id: "b", product: "Hero Sprint MTB", label: "Hero Sprint MTB · 26 Inch · Multi Speed", sku: "KD-HSP-26M" },
  { id: "c", product: "Thunder 12V Ride-on Jeep", label: "Thunder 12V Ride-on Jeep · Red", sku: "KD-THU-RED" },
];

describe("purchase line matching", () => {
  it("uses an SKU printed on the line", () => {
    expect(matchVariant("KD-HSP-26M Hero sprint", opts)?.id).toBe("b");
  });
  it("matches by product and variant words", () => {
    expect(matchVariant("HERO SPRINT MTB 26\" MULTI SPEED", opts)?.id).toBe("b");
    expect(matchVariant("Thunder jeep 12v red", opts)?.id).toBe("c");
  });
  it("returns nothing when unsure", () => {
    expect(matchVariant("Packing material", opts)).toBeNull();
  });
  it("normalises GST rates", () => {
    expect(normaliseGst(12)).toBe(12);
    expect(normaliseGst(0.18)).toBe(18);
    expect(normaliseGst(17.9)).toBe(18);
  });
});
