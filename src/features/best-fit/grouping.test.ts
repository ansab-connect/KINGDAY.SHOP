import { describe, expect, it } from "vitest";
import { crowFliesKm, suggestGroups, type GBooking, type GTech } from "./grouping";

const b = (id: string, lat: number, lng: number, extra: Partial<GBooking> = {}): GBooking => ({ id, code: id, lat, lng, town: null, category: "jeep", priority: "normal", createdAt: `2026-11-0${id.length}`, label: id, ...extra });
const t = (id: string, extra: Partial<GTech> = {}): GTech => ({ id, name: id, areas: [], skills: [], capacity: 6, available: true, open: 0, base: null, ...extra });

describe("suggestGroups", () => {
  it("puts nearby bookings together and far ones apart", () => {
    const near = [b("a", 11.25, 75.78), b("bb", 11.26, 75.79)];
    const far = b("ccc", 12.3, 76.6);
    const out = suggestGroups([...near, far], [t("x")]);
    expect(out).toHaveLength(2);
    expect(out[0].bookings.map((x) => x.id).sort()).toEqual(["a", "bb"]);
  });
  it("respects daily capacity and never uses unavailable technicians", () => {
    const many = Array.from({ length: 5 }, (_, i) => b(`k${"x".repeat(i)}`, 11.25 + i * 0.001, 75.78));
    const out = suggestGroups(many, [t("busy", { capacity: 2 }), t("off", { available: false })]);
    expect(out[0].bookings).toHaveLength(2);
    expect(out[0].techId).toBe("busy");
    expect(out.some((s) => s.techId === "off")).toBe(false);
    expect(out.slice(1).every((s) => s.techId === null)).toBe(true);
  });
  it("prefers the technician who covers the area", () => {
    const out = suggestGroups([b("a", 11.25, 75.78, { town: "Feroke" })], [t("x"), t("y", { areas: ["feroke"] })]);
    expect(out[0].techId).toBe("y");
  });
  it("ignores bookings without a map pin", () => {
    expect(suggestGroups([b("a", 0, 0, { lat: null, lng: null })], [t("x")])).toHaveLength(0);
  });
  it("haversine is about right (Kozhikode → Feroke ≈ 10 km)", () => {
    expect(crowFliesKm({ lat: 11.2588, lng: 75.7804 }, { lat: 11.1789, lng: 75.8417 })).toBeGreaterThan(9);
  });
});
