/**
 * Smart fill (free, no AI service): splits a pasted product description into
 * editor fields using text patterns. Runs in the browser; nothing is sent anywhere.
 */

export type ProductFill = {
  name: string;
  short_description: string;
  description: string;
  highlights: string[];
  age_range: string;
  category_id: string;
  brand_id: string;
  specifications: { name: string; value: string }[];
  variants: { name: string; colour: string; mrp: number; price: number }[];
  seo_title: string;
  seo_description: string;
  /** Key specs Smart fill looked for but did not find (shown as "Not provided"; never guessed). */
  missing: string[];
};

/** Key specifications for kids' rides. Each is read only from the pasted text, never invented. */
export const KEY_SPECS: { name: string; keys: RegExp; find: RegExp }[] = [
  { name: "Battery", keys: /^batter(y|ies)$/i, find: /batter(?:y|ies)[^.\n:]{0,20}[:\-–]?\s*(\d{1,2}\s?v[^.\n,;]{0,25})|\b(\d{1,2}\s?v(?:olt)?(?:\s*[x×]\s*\d)?(?:\s*\d{1,3}(?:\.\d)?\s?ah)?)\s*(?:rechargeable\s*)?batter/i },
  { name: "Motor", keys: /^motors?$/i, find: /motors?[^.\n:]{0,15}[:\-–]\s*([^.\n,;]{2,40})|\b(\d\s*[x×]\s*\d{1,3}\s?w|(?:dual|twin|single)?\s*\d{1,3}\s?w(?:att)?s?|dual|twin|single)\s*(?:\w+\s)?motors?\b/i },
  { name: "Weight capacity", keys: /^(max(imum)?\s*)?(weight|load)(\s*capacity)?$/i, find: /(?:max(?:imum)?\s*)?(?:weight|load)(?:\s*capacity)?\s*(?:of|up to|upto|:|-|–)?\s*(\d{1,3}\s?kg)/i },
  { name: "Dimensions", keys: /^(dimensions?|size|product size)$/i, find: /(\d{2,3}(?:\.\d)?\s*[x×]\s*\d{2,3}(?:\.\d)?\s*[x×]\s*\d{2,3}(?:\.\d)?\s*(?:cm|mm|inch(?:es)?)?)/i },
  { name: "Charging time", keys: /^charging(\s*time)?$/i, find: /charg(?:e|ing)\s*(?:time)?\s*(?:of|:|-|–)?\s*(\d{1,2}(?:\s*(?:-|–|to)\s*\d{1,2})?\s*(?:hrs?|hours?))/i },
  { name: "Max speed", keys: /^(max(imum)?\s*)?speed$/i, find: /(?:max(?:imum)?\s*)?speed\s*(?:of|up to|upto|:|-|–)?\s*(\d{1,2}(?:\.\d)?(?:\s*-\s*\d{1,2})?\s*km\/?h)/i },
  { name: "Remote control", keys: /^(parental\s*)?remote(\s*control)?$/i, find: /\b(2\.4\s?g(?:hz)?\s*(?:parental\s*)?remote(?:\s*control)?|parental remote(?:\s*control)?|remote control(?:led)?)\b/i },
];
function addKeySpecs(text: string, specs: { name: string; value: string }[]): string[] {
  const missing: string[] = [];
  for (const k of KEY_SPECS) {
    if (specs.some((sp) => k.keys.test(sp.name.trim()))) continue;
    const m = text.match(k.find);
    const value = m ? (m.slice(1).find(Boolean) ?? m[0]).replace(/\s+/g, " ").trim() : "";
    if (value) specs.push({ name: k.name, value: value.slice(0, 200) });
    else missing.push(k.name);
  }
  return missing;
}

type Option = { id: string; name: string };

const BULLET = /^\s*(?:[-*•●▪◦‣✓✔✅➤►»>]|\d{1,2}[.)])\s+/;
const MONEY = String.raw`(?:rs\.?|inr|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:\/-|rs\.?|inr)?`;
const MRP_RE = new RegExp(String.raw`\b(?:m\.?r\.?p\.?|list price|original price|market price)\b\s*(?:is|:|-|=)?\s*${MONEY}`, "i");
const PRICE_RE = new RegExp(
  String.raw`\b(?:offer price|selling price|sale price|special price|our price|deal price|discounted price|now|price)\b\s*(?:is|:|-|=|@)?\s*${MONEY}`,
  "i",
);
const RUPEE_RE = /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const AGE_RE = /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+\s*)?(yrs?|years?|months?)\b|\b(\d{1,2})\s*\+\s*(yrs?|years?)\b|\bages?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/i;
const COLOUR_LINE = /^\s*(?:available\s+)?colou?rs?(?:\s+available)?\s*[:\-–]\s*(.+)$/i;
const SKIP_KEYS = /^(?:m\.?r\.?p|price|offer price|selling price|sale price|special price|colou?rs?|age|recommended age|name|product name|title|brand|category|description)$/i;

const CATEGORY_HINTS: [RegExp, string[]][] = [
  [/\b(jeep|ride[- ]?on|electric car|kids car|toy car)\b/i, ["electric-jeeps-cars", "jeep", "car"]],
  [/\b(scooter)\b/i, ["scooter"]],
  [/\b(tricycle|trike)\b/i, ["tricycle", "trike"]],
  [/\b(bicycle|cycle)\b/i, ["cycle"]],
  [/\b(balance bike|bike|motorbike|motorcycle)\b/i, ["bike"]],
  [/\b(walker|stroller|pram|car seat|feeding|diaper|baby)\b/i, ["baby"]],
  [/\b(toy|blocks|puzzle|plush|doll|rc car|remote control)\b/i, ["toy"]],
];

const toNumber = (s: string) => Number(s.replace(/,/g, ""));
const clean = (s: string) => s.replace(BULLET, "").replace(/\s+/g, " ").trim();
const titleCase = (s: string) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
// Split on . ! ? followed by a space or the end, so "2.4G" or "7.5 kg" stay whole.
const sentenceSplit = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  return `${head.slice(0, space > max * 0.6 ? space : head.length).trim()}…`;
}

function findCategory(text: string, categories: Option[]): string {
  const lower = text.toLowerCase();
  // 1. A category name written in the text.
  const direct = [...categories].sort((a, b) => b.name.length - a.name.length).find((c) => lower.includes(c.name.toLowerCase()));
  if (direct) return direct.id;
  // 2. Keyword hints matched against category names.
  for (const [re, keys] of CATEGORY_HINTS) {
    if (!re.test(text)) continue;
    const hit = categories.find((c) => keys.some((k) => c.name.toLowerCase().includes(k) || c.id === k));
    if (hit) return hit.id;
  }
  return "";
}

function findBrand(text: string, brands: Option[]): string {
  const lower = text.toLowerCase();
  return [...brands].sort((a, b) => b.name.length - a.name.length).find((b) => b.name.length > 1 && lower.includes(b.name.toLowerCase()))?.id ?? "";
}

function findAge(text: string): string {
  const m = text.match(AGE_RE);
  if (!m) return "";
  if (m[1] && m[2]) return `${m[1]}–${m[2]} ${/month/i.test(m[3]) ? "months" : "years"}`;
  if (m[4]) return `${m[4]}+ years`;
  if (m[6] && m[7]) return `${m[6]}–${m[7]} years`;
  return "";
}

function findPrices(text: string): { mrp: number; price: number } {
  const mrp = text.match(MRP_RE);
  // Search for the selling price outside the MRP phrase.
  const rest = mrp ? text.replace(mrp[0], " ") : text;
  const price = rest.match(PRICE_RE);
  let m = mrp ? toNumber(mrp[1]) : 0;
  let p = price ? toNumber(price[1]) : 0;
  if (!m || !p) {
    const all = [...text.matchAll(RUPEE_RE)].map((x) => toNumber(x[1])).filter((n) => n >= 10);
    if (!m && !p && all.length >= 2) {
      m = Math.max(...all);
      p = Math.min(...all);
    } else if (!m && p && all.some((n) => n > p)) {
      m = Math.max(...all);
    } else if (!p && all.length) {
      p = Math.min(...all.filter((n) => !m || n <= m), m || Infinity);
    }
  }
  if (m && !p) p = m;
  if (p && !m) m = p;
  if (p > m) [m, p] = [p, m];
  return { mrp: Number.isFinite(m) ? m : 0, price: Number.isFinite(p) ? p : 0 };
}

function findColours(lines: string[]): { colours: string[]; line: number } {
  for (const [i, l] of lines.entries()) {
    const m = l.match(COLOUR_LINE);
    if (m) {
      const colours = m[1]
        .split(/\s*(?:,|\/|&|\band\b|\|)\s*/i)
        .map((c) => titleCase(c.replace(/[.;]+$/, "").trim()))
        .filter((c) => c && c.length <= 30);
      return { colours: [...new Set(colours)].slice(0, 12), line: i };
    }
  }
  return { colours: [], line: -1 };
}

export function smartFill(raw: string, categories: Option[], brands: Option[]): ProductFill {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\t/g, ": ").trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const used = new Set<number>();
  const specifications: { name: string; value: string }[] = [];
  const highlights: string[] = [];
  const prose: string[] = [];

  // Name: first short line that isn't a spec, price or bullet.
  let name = "";
  const nameIdx = lines.findIndex((l) => l.length <= 120 && !/[:]\s*\S/.test(l) && !MRP_RE.test(l) && !PRICE_RE.test(l));
  if (nameIdx >= 0 && nameIdx <= 2) {
    name = clean(lines[nameIdx]).replace(/[.!]+$/, "");
    used.add(nameIdx);
  } else {
    const titled = lines.find((l) => /^(?:product name|name|title)\s*[:\-]/i.test(l));
    if (titled) name = clean(titled.replace(/^(?:product name|name|title)\s*[:\-]\s*/i, ""));
  }

  const { colours, line: colourLine } = findColours(lines);
  if (colourLine >= 0) used.add(colourLine);

  for (const [i, line] of lines.entries()) {
    if (used.has(i)) continue;
    const body = clean(line);
    const kv = body.match(/^([A-Za-z][A-Za-z0-9 ()/&.'-]{1,40}?)\s*[:=]\s*(.{1,200})$/);
    if (kv && !SKIP_KEYS.test(kv[1].trim())) {
      specifications.push({ name: titleCase(kv[1].trim()).slice(0, 60), value: kv[2].trim().replace(/[.;]+$/, "").slice(0, 200) });
      continue;
    }
    if (kv) continue; // price/colour/age/name lines are read separately
    if (BULLET.test(line) && body.length <= 160) {
      highlights.push(body.replace(/[.;]+$/, "").slice(0, 120));
      continue;
    }
    if (MRP_RE.test(body) && body.length < 80) continue;
    prose.push(body);
  }

  const description = prose.join("\n\n").slice(0, 10000);
  const sentences = sentenceSplit(prose.join(" "));
  const short_description = cut(sentences.slice(0, 2).join(" "), 280);
  if (!highlights.length && sentences.length > 3) {
    highlights.push(...sentences.slice(2, 7).map((s) => cut(s.replace(/[.!]+$/, ""), 120)));
  }

  const missing = addKeySpecs(text, specifications);
  if (!findAge(text)) missing.unshift("Age group");
  const { mrp, price } = findPrices(text);
  const variants = colours.length
    ? colours.map((c) => ({ name: c, colour: c, mrp, price }))
    : mrp || price
      ? [{ name: "", colour: "", mrp, price }]
      : [];

  return {
    name: cut(name, 160),
    short_description,
    description,
    highlights: [...new Set(highlights)].slice(0, 12),
    age_range: findAge(text),
    category_id: findCategory(`${name} ${text}`, categories),
    brand_id: findBrand(text, brands),
    specifications: specifications.slice(0, 40),
    variants: variants.slice(0, 20),
    seo_title: cut(name, 60),
    seo_description: cut(short_description, 155),
    missing,
  };
}
