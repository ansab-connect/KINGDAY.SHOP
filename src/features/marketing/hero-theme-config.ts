import { z } from "zod";

/**
 * Homepage hero themes (Default, seasons, festivals, campaigns), kept in the public
 * store setting "marketing.hero_themes". Nothing about a festival is hard-coded in the hero:
 * it draws whatever theme resolveHeroTheme() picks for today.
 */

export const HERO_THEMES_SETTING = "marketing.hero_themes";
export const HERO_THEMES_TAG = "hero-themes";

export const EFFECTS = ["sparkles", "snow", "sun", "confetti", "lights", "petals", "stars"] as const;
export const COSTUMES = ["none", "santa", "beanie", "party", "sunglasses", "flowers"] as const;
export const SCENES = ["castle", "park", "road", "beach", "night"] as const;
export const KINDS = ["default", "season", "festival"] as const;

export type Effect = (typeof EFFECTS)[number];
export type Costume = (typeof COSTUMES)[number];
export type SceneKey = (typeof SCENES)[number];

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a colour like #4B0082.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export const heroScene = z.object({
  preset: z.enum(SCENES),
  /** Optional uploaded banner image (bucket category-images, folder hero/). */
  image_path: z
    .string()
    .regex(/^hero\/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|avif)$/)
    .nullable(),
});

export const heroTheme = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{2,40}$/),
    name: z.string().trim().min(2, "Name the theme.").max(40),
    kind: z.enum(KINDS),
    enabled: z.boolean(),
    starts_on: day.nullable(),
    ends_on: day.nullable(),
    /** Repeat every year on the same dates (month and day only). */
    yearly: z.boolean(),
    sky: z.tuple([hex, hex]),
    accent: hex,
    effect: z.enum(EFFECTS),
    costume: z.enum(COSTUMES),
    scenes: z.array(heroScene).min(1, "Add at least one scene.").max(4, "Use at most 4 scenes."),
  })
  .superRefine((t, ctx) => {
    if (t.kind === "default") return;
    if (!t.starts_on || !t.ends_on) ctx.addIssue({ code: "custom", path: ["starts_on"], message: `${t.name}: set a start and end date.` });
    else if (!t.yearly && t.ends_on < t.starts_on) ctx.addIssue({ code: "custom", path: ["ends_on"], message: `${t.name}: the end date is before the start date.` });
  });

export const heroThemesValue = z.object({
  default_id: z.string(),
  themes: z.array(heroTheme).min(1).max(30, "Use at most 30 themes."),
});

export type HeroScene = z.infer<typeof heroScene>;
export type HeroTheme = z.infer<typeof heroTheme>;
export type HeroThemesValue = z.infer<typeof heroThemesValue>;

const scenes = (...keys: SceneKey[]): HeroScene[] => keys.map((preset) => ({ preset, image_path: null }));

/** Built-in themes used until the admin saves their own. */
export const DEFAULT_HERO_THEMES: HeroThemesValue = {
  default_id: "royal",
  themes: [
    { id: "royal", name: "KING DAY Royal", kind: "default", enabled: true, starts_on: null, ends_on: null, yearly: false, sky: ["#1a0f2e", "#4b0082"], accent: "#d4af37", effect: "sparkles", costume: "none", scenes: scenes("castle", "park", "road", "night") },
    { id: "summer", name: "Summer", kind: "season", enabled: true, starts_on: "2027-03-15", ends_on: "2027-05-31", yearly: true, sky: ["#ffb347", "#ffd56b"], accent: "#ff7a00", effect: "sun", costume: "sunglasses", scenes: scenes("beach", "park", "road") },
    { id: "winter", name: "Winter", kind: "season", enabled: false, starts_on: "2026-12-01", ends_on: "2027-01-31", yearly: true, sky: ["#5b7db8", "#c9dcf5"], accent: "#ffffff", effect: "snow", costume: "beanie", scenes: scenes("park", "night", "castle") },
    { id: "christmas", name: "Christmas", kind: "festival", enabled: true, starts_on: "2026-12-15", ends_on: "2026-12-27", yearly: true, sky: ["#0f3d2e", "#7a1020"], accent: "#ffd166", effect: "snow", costume: "santa", scenes: scenes("night", "castle", "park") },
    { id: "new-year", name: "New Year", kind: "festival", enabled: true, starts_on: "2026-12-28", ends_on: "2027-01-03", yearly: true, sky: ["#0b0b2b", "#3a1b6b"], accent: "#ffd700", effect: "confetti", costume: "party", scenes: scenes("night", "castle", "road") },
    { id: "onam", name: "Onam", kind: "festival", enabled: false, starts_on: "2027-09-01", ends_on: "2027-09-14", yearly: false, sky: ["#fff3c4", "#ffb627"], accent: "#e85d04", effect: "petals", costume: "flowers", scenes: scenes("park", "road", "castle") },
  ],
};

/** Month-day of a YYYY-MM-DD date. */
const md = (d: string) => d.slice(5);

export function isThemeLive(t: HeroTheme, today: string): boolean {
  if (!t.enabled || t.kind === "default" || !t.starts_on || !t.ends_on) return false;
  if (!t.yearly) return t.starts_on <= today && today <= t.ends_on;
  const [s, e, n] = [md(t.starts_on), md(t.ends_on), md(today)];
  return s <= e ? s <= n && n <= e : n >= s || n <= e; // wraps over New Year
}

/** Festival campaigns beat seasons, seasons beat the default theme. */
export function resolveHeroTheme(value: HeroThemesValue, today: string): HeroTheme {
  const live = value.themes.filter((t) => isThemeLive(t, today));
  return (
    live.find((t) => t.kind === "festival") ??
    live.find((t) => t.kind === "season") ??
    value.themes.find((t) => t.id === value.default_id && t.kind === "default") ??
    value.themes.find((t) => t.kind === "default") ??
    DEFAULT_HERO_THEMES.themes[0]
  );
}

/** Today in India (YYYY-MM-DD). */
export const todayInIndia = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- Characters

export const RELATIONSHIPS = ["Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Other"] as const;
export const HAIR_STYLES = ["curly", "short", "long", "bun", "pigtails", "bald"] as const;
export const OUTFITS = ["hoodie", "dress", "shirt"] as const;
export const ACCESSORIES = ["none", "crown-cap", "bow", "glasses", "crown"] as const;
export const SKIN_TONES = ["#f6d3b3", "#e8b98f", "#c98e62", "#a86b45", "#7a4a2c"] as const;
export const HAIR_COLOURS = ["#2b1b12", "#5a3825", "#8a5a2b", "#c58b3c", "#1a1a1a"] as const;

export const characterLook = z.object({
  skin: hex,
  hair: z.enum(HAIR_STYLES),
  hair_colour: hex,
  outfit: z.enum(OUTFITS),
  outfit_colour: hex,
  accessory: z.enum(ACCESSORIES),
});

export const customerCharacter = z.object({
  id: z.string().regex(/^[a-z0-9]{6,20}$/),
  name: z.string().trim().min(1, "Enter a name.").max(20, "Use at most 20 characters."),
  relationship: z.enum(RELATIONSHIPS),
  look: characterLook,
});

export const MAX_CHARACTERS = 3;
export const customerCharacters = z.array(customerCharacter).max(MAX_CHARACTERS, `You can create up to ${MAX_CHARACTERS} characters.`);

export type CharacterLook = z.infer<typeof characterLook>;
export type CustomerCharacter = z.infer<typeof customerCharacter>;

/** Official mascots: drawn from the same fixed looks everywhere, so they always look the same. */
export const KING: CustomerCharacter = {
  id: "kingofficial",
  name: "King",
  relationship: "Son",
  look: { skin: "#f1c9a5", hair: "curly", hair_colour: "#5a3825", outfit: "hoodie", outfit_colour: "#4b0082", accessory: "crown-cap" },
};
export const MIA: CustomerCharacter = {
  id: "miaofficial",
  name: "Mia",
  relationship: "Daughter",
  look: { skin: "#f1c9a5", hair: "curly", hair_colour: "#5a3825", outfit: "dress", outfit_colour: "#7b3fb5", accessory: "bow" },
};

/** Size of a character by relationship: parents are taller, Mia-style little ones smaller. */
export function characterSize(c: CustomerCharacter): "adult" | "kid" | "toddler" {
  if (c.id === MIA.id) return "toddler";
  return c.relationship === "Father" || c.relationship === "Mother" ? "adult" : "kid";
}

/** Reads characters saved in the user's account metadata (ignores anything invalid). */
export function charactersFromMetadata(meta: unknown): CustomerCharacter[] {
  const raw = (meta as { characters?: unknown } | null)?.characters;
  const parsed = customerCharacters.safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}
