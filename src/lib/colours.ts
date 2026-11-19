/** Swatch colours for common variant colour names. Unknown names render as text chips. */
const SWATCHES: Record<string, string> = {
  black: "#1F1B24", "midnight black": "#1F1B24",
  white: "#F4F2F7", "pearl white": "#F4F2F7",
  red: "#B3261E", "racing red": "#B3261E",
  blue: "#2958C7", "ocean blue": "#2958C7", navy: "#1E2A5A",
  yellow: "#E3B341", "sunshine yellow": "#E3B341",
  green: "#2E7D4F", mint: "#9CD3BE",
  pink: "#E7A5B8", "blush pink": "#E7A5B8",
  purple: "#4B0082", "royal purple": "#4B0082",
  orange: "#E07A2E", grey: "#8A8794", gray: "#8A8794", silver: "#C9C7D0", gold: "#D4AF37",
};

const WORDS = Object.keys(SWATCHES).filter((k) => !k.includes(" "));

/** Exact name first, then a known colour word inside a marketing name ("Volt Blue" → blue). */
export function swatchFor(colour: string | null | undefined): string | null {
  if (!colour) return null;
  const name = colour.trim().toLowerCase();
  if (SWATCHES[name]) return SWATCHES[name];
  const word = name.split(/[^a-z]+/).reverse().find((w) => WORDS.includes(w));
  return word ? SWATCHES[word] : null;
}
