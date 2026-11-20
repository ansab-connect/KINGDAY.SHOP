/**
 * Variant type helpers shared by the admin editor, validation and the storefront.
 * `optionKey` must match private.option_key() in migration 0030: it is the key a
 * type's value is stored under in product_variants.options.
 */
export function optionKey(type: string): string {
  const t = type.trim().toLowerCase();
  if (t === "colour" || t === "color") return "colour";
  return t.replace(/[^a-z0-9]+/g, "_");
}

/** Values of a variant by type name, read from its stored options. */
export function valuesFromOptions(types: string[], options: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of types) {
    const v = options?.[optionKey(t)];
    if (v) out[t] = v;
  }
  return out;
}

/** Case-insensitive key for a combination of values (used to spot duplicates). */
export function comboKey(types: string[], values: Record<string, string | undefined>): string {
  return types.map((t) => (values[t] ?? "").trim().toLowerCase()).join("|");
}

export const isColourType = (t: string) => /colou?r/i.test(t);
