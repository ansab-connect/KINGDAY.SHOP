import { comboKey } from "./variant-types";

/**
 * "Enable price/stock variation by size": the product's size categories (main + "Also
 * show in", e.g. 24 Inch, 26 Inch, 27.5 Inch) become a "Size" variant type. Each size
 * gets its own variant(s) with its own MRP, price and stock, and the first variant of a
 * size is listed in that size's category with its price (product_categories.variant_id).
 * Pure functions on the editor's variant rows, so they are easy to test.
 */

export const SIZE_TYPE = "Size";

export type SizeCategory = { id: string; label: string };

/** Minimal shape of an editor variant row. */
export type SizeRow = { key: string; values: Record<string, string>; category_id: string; is_active: boolean; mrp: string; price: string };

const same = (a: string | undefined, b: string | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** "24 Inch | 18+ Years" → "24 Inch". */
export const sizeLabel = (categoryName: string) => categoryName.split("|")[0].trim() || categoryName.trim();

export const isSizeType = (t: string) => same(t, SIZE_TYPE);

export const hasSizeType = (types: string[]) => types.some(isSizeType);

function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
}

const uniq = (list: string[]) => list.filter((v, i) => v.trim() && list.findIndex((x) => same(x, v)) === i);

/**
 * Make the rows match the sizes: Size becomes the first type, every size × combination of
 * the other types has a row (new rows copy the size's price, else the last row's), rows of
 * sizes no longer chosen are dropped, and each size's first row is linked to its category.
 */
export function applySizes<R extends SizeRow>(rows: R[], types: string[], sizes: SizeCategory[], makeRow: (patch: Partial<R>) => R) {
  const others = types.filter((t) => !isSizeType(t));
  const sizeType = types.find(isSizeType) ?? SIZE_TYPE;
  const nextTypes = [sizeType, ...others];
  const labels = sizes.map((s) => s.label);
  const sizeIds = new Set(sizes.map((s) => s.id));

  // Rows from before sizes were on take the first size.
  let next = rows.map((r) => ({ ...r, values: { ...r.values, [sizeType]: labels.find((l) => same(l, r.values[sizeType])) ?? (r.values[sizeType]?.trim() ? r.values[sizeType] : labels[0]) } }));
  const dropped = next.filter((r) => !labels.some((l) => same(l, r.values[sizeType])));
  next = next.filter((r) => !dropped.includes(r));

  const otherLists = others.map((t) => uniq(rows.map((r) => r.values[t] ?? "")));
  const combos = otherLists.some((l) => !l.length) ? [] : cartesian(otherLists);
  const template = rows[rows.length - 1];
  for (const label of labels) {
    for (const combo of combos) {
      const values: Record<string, string> = { [sizeType]: label, ...Object.fromEntries(others.map((t, i) => [t, combo[i]])) };
      if (next.some((r) => comboKey(nextTypes, r.values) === comboKey(nextTypes, values))) continue;
      const sameSize = next.find((r) => same(r.values[sizeType], label));
      next.push(makeRow({ values, mrp: (sameSize ?? template)?.mrp ?? "", price: (sameSize ?? template)?.price ?? "" } as Partial<R>));
    }
  }

  // Size order follows the chosen categories; each size's first active row is listed in its category.
  const rank = (r: R) => labels.findIndex((l) => same(l, r.values[sizeType]));
  const pos = new Map(next.map((r, i) => [r.key, i]));
  next.sort((a, b) => rank(a) - rank(b) || pos.get(a.key)! - pos.get(b.key)!);
  const linked = new Set<string>();
  next = next.map((r) => {
    const size = sizes[rank(r)];
    const keepOther = r.category_id && !sizeIds.has(r.category_id) ? r.category_id : "";
    if (size && r.is_active && !linked.has(size.id)) {
      linked.add(size.id);
      return { ...r, category_id: size.id };
    }
    return { ...r, category_id: keepOther };
  });
  return { rows: next, types: nextTypes, dropped };
}

/** Turn size variation off: the Size type goes; per combination the first row stays. */
export function removeSizes<R extends SizeRow>(rows: R[], types: string[], sizeIds: string[]) {
  const nextTypes = types.filter((t) => !isSizeType(t));
  const seen = new Set<string>();
  const kept: R[] = [];
  const dropped: R[] = [];
  for (const r of rows) {
    const values = { ...r.values };
    for (const t of Object.keys(values)) if (isSizeType(t)) delete values[t];
    const k = comboKey(nextTypes, values);
    const row = { ...r, values, category_id: sizeIds.includes(r.category_id) ? "" : r.category_id };
    if (seen.has(k)) dropped.push(r);
    else {
      seen.add(k);
      kept.push(row);
    }
  }
  return { rows: kept, types: nextTypes, dropped };
}
