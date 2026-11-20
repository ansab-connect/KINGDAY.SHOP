import { describe, expect, it } from "vitest";
import { charactersFromMetadata, DEFAULT_HERO_THEMES, heroThemesValue, KING, resolveHeroTheme, todayInIndia } from "./hero-theme-config";

const pickOn = (day: string) => resolveHeroTheme(DEFAULT_HERO_THEMES, day).id;

describe("hero themes", () => {
  it("built-in themes are valid", () => {
    expect(heroThemesValue.safeParse(DEFAULT_HERO_THEMES).success).toBe(true);
  });
  it("festival beats season, season beats default, default returns after", () => {
    expect(pickOn("2027-04-10")).toBe("summer"); // yearly season
    expect(pickOn("2028-04-10")).toBe("summer"); // repeats next year
    expect(pickOn("2026-12-20")).toBe("christmas");
    expect(pickOn("2027-01-02")).toBe("new-year"); // wraps over 31 Dec
    expect(pickOn("2027-02-20")).toBe("royal");
  });
  it("disabled and one-off campaigns only run when active and in range", () => {
    expect(pickOn("2027-09-05")).toBe("royal"); // Onam is off by default
    const onamOn = { ...DEFAULT_HERO_THEMES, themes: DEFAULT_HERO_THEMES.themes.map((t) => (t.id === "onam" ? { ...t, enabled: true } : t)) };
    expect(resolveHeroTheme(onamOn, "2027-09-05").id).toBe("onam");
    expect(resolveHeroTheme(onamOn, "2028-09-05").id).toBe("royal"); // not yearly
  });
  it("uses India's date", () => {
    expect(todayInIndia(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
  });
  it("reads at most 3 valid characters from account metadata", () => {
    expect(charactersFromMetadata({ characters: [KING] })).toHaveLength(1);
    expect(charactersFromMetadata({ characters: [KING, KING, KING, KING] })).toEqual([]);
    expect(charactersFromMetadata(null)).toEqual([]);
  });
});
