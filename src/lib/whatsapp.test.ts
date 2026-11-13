import { describe, expect, it } from "vitest";
import { buildWhatsAppOrderMessage, whatsappOrderUrl } from "./whatsapp";

const order = { name: "Royal Jeep 12V & Lights", sku: "KD-JP-01", price: 1899900, variant: "Red", quantity: 2, url: "https://www.kingday.in/products/royal-jeep?x=1&y=2" };

describe("whatsapp BUY NOW", () => {
  it("includes every required field", () => {
    const m = buildWhatsAppOrderMessage(order);
    for (const s of ["Royal Jeep 12V & Lights", "KD-JP-01", "18,999", "Variant: Red", "Quantity: 2", order.url]) expect(m).toContain(s);
  });
  it("targets the official number and encodes the text", () => {
    const u = whatsappOrderUrl("+91 94959 02904", order);
    expect(u.startsWith("https://wa.me/919495902904?text=")).toBe(true);
    const text = u.split("?text=")[1];
    expect(text).not.toMatch(/[ &\n#]/);
    expect(decodeURIComponent(text)).toBe(buildWhatsAppOrderMessage(order));
  });
  it("omits the variant line when there is none", () => {
    expect(buildWhatsAppOrderMessage({ ...order, variant: null })).not.toContain("Variant:");
  });
});
