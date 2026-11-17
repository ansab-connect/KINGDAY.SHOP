import { describe, expect, it } from "vitest";
import { smartFill } from "./smart-fill";

const cats = [
  { id: "c-jeep", name: "Electric Jeeps & Cars" },
  { id: "c-scoot", name: "Scooters" },
  { id: "c-tri", name: "Tricycles" },
  { id: "c-toys", name: "Toys" },
];
const brands = [{ id: "b-royal", name: "Royal Rides" }];

const SAMPLE = `Thunder 12V Ride-on Jeep
The Thunder is a powerful ride-on jeep for little adventurers. It has soft-start motors and a parental remote. Built for smooth outdoor rides. Parents love the safety features. Kids love the lights and music.
• 2.4G parental remote control
• LED headlights and MP3 music
• Seat belt and suspension
Battery: 12V 7Ah
Motor: 2 x 35W
Max load: 30 kg
Recommended for 3-8 years
Brand: Royal Rides
Colours: Red, Black & White
MRP: ₹28,999
Offer price: Rs. 23,499/-`;

describe("smartFill", () => {
  const r = smartFill(SAMPLE, cats, brands);

  it("reads the name, category, brand and age", () => {
    expect(r.name).toBe("Thunder 12V Ride-on Jeep");
    expect(r.category_id).toBe("c-jeep");
    expect(r.brand_id).toBe("b-royal");
    expect(r.age_range).toBe("3–8 years");
  });

  it("splits specifications and highlights", () => {
    expect(r.specifications.slice(0, 3)).toEqual([
      { name: "Battery", value: "12V 7Ah" },
      { name: "Motor", value: "2 x 35W" },
      { name: "Max Load", value: "30 kg" },
    ]);
    // Key specs found in the rest of the text are added after the listed ones.
    expect(r.specifications.slice(3).map((s) => s.name)).toEqual(["Remote control"]);
    expect(r.highlights).toEqual(["2.4G parental remote control", "LED headlights and MP3 music", "Seat belt and suspension"]);
  });

  it("creates one variant per colour with MRP and selling price", () => {
    expect(r.variants.map((v) => v.colour)).toEqual(["Red", "Black", "White"]);
    expect(r.variants[0]).toMatchObject({ mrp: 28999, price: 23499 });
  });

  it("builds descriptions and SEO text within limits", () => {
    expect(r.description).toContain("powerful ride-on jeep");
    expect(r.short_description.length).toBeLessThanOrEqual(280);
    expect(r.seo_title.length).toBeLessThanOrEqual(60);
    expect(r.seo_description.length).toBeLessThanOrEqual(155);
  });

  it("handles plain text with bare rupee amounts", () => {
    const p = smartFill("Kids Glide Scooter\nFoldable 3 wheel scooter with light-up wheels. Was ₹3,499 now ₹2,799.", cats, brands);
    expect(p.category_id).toBe("c-scoot");
    expect(p.variants).toEqual([{ name: "", colour: "", mrp: 3499, price: 2799 }]);
  });

  it("never invents prices or brands", () => {
    const p = smartFill("Plush lion soft toy\nA cuddly companion for bedtime.", cats, brands);
    expect(p.variants).toEqual([]);
    expect(p.brand_id).toBe("");
    expect(p.category_id).toBe("c-toys");
  });
});

describe("smartFill key specs (Update 01 phase 14)", () => {
  it("reads key specs from free text and lists the ones it couldn't find", () => {
    const d = smartFill(
      "Royal Thunder Jeep\nThis jeep runs on a 12V 7Ah battery with dual 35W motors. Max load 30 kg, size 120 x 70 x 60 cm. Comes with a 2.4G parental remote control.",
      [],
      [],
    );
    const spec = (n: string) => d.specifications.find((s) => s.name === n)?.value;
    expect(spec("Battery")).toMatch(/12V 7Ah/i);
    expect(spec("Motor")).toMatch(/dual|35W/i);
    expect(spec("Weight capacity")).toBe("30 kg");
    expect(spec("Dimensions")).toMatch(/120 x 70 x 60 cm/);
    expect(spec("Remote control")).toMatch(/remote/i);
    expect(d.missing).toEqual(expect.arrayContaining(["Charging time", "Max speed", "Age group"]));
    expect(d.missing).not.toContain("Battery");
  });
  it("never invents a spec that isn't in the text", () => {
    const d = smartFill("Mini Tricycle\nA sturdy tricycle with a basket.", [], []);
    expect(d.specifications).toEqual([]);
    expect(d.missing).toEqual(expect.arrayContaining(["Battery", "Motor", "Weight capacity"]));
  });
});
