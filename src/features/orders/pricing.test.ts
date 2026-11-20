import { describe, expect, it } from "vitest";
import { estimateTotals } from "./pricing";

const s = { flatShipping: 9900, freeShippingAbove: null, freeShippingPrepaid: true };

describe("estimateTotals", () => {
  it("prepaid: % off and free delivery", () => {
    expect(estimateTotals(1999900, 2, 3, true, s)).toEqual({ subtotal: 3999800, discount: 119994, shipping: 0, total: 3879806 });
  });
  it("COD: its own % and normal delivery", () => {
    expect(estimateTotals(1999900, 1, 0, false, s)).toEqual({ subtotal: 1999900, discount: 0, shipping: 9900, total: 2009800 });
  });
  it("free-delivery threshold still applies to COD", () => {
    expect(estimateTotals(500000, 1, 0, false, { ...s, freeShippingAbove: 400000 }).shipping).toBe(0);
  });
});
