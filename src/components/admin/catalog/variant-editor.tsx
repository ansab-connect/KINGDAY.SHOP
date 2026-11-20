"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  Crown,
  GripVertical,
  ImagePlus,
  Info,
  Layers,
  ListPlus,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { moveItem, sortableClass, useDragSort } from "@/components/admin/catalog/drag-sort";
import { ProductImages } from "@/components/admin/catalog/product-images";
import { inputClass } from "@/components/admin/form/fields";
import type { AdminProductImage } from "@/features/catalog/admin-repo";
import { rupeesToPaise } from "@/features/catalog/schemas";
import { comboKey, isColourType } from "@/features/catalog/variant-types";
import { swatchFor } from "@/lib/colours";
import { discountPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SpecRow = { key: string; name: string; value: string };

/** One purchasable variant (a combination of type values) as edited in the form. */
export type VariantRow = {
  key: string;
  id: string | null;
  sku: string;
  /** Optional custom name; empty = built from the values. */
  name: string;
  /** Simple products only: colour / label. */
  colour: string;
  /** Value for each variant type, by type name. */
  values: Record<string, string>;
  specs: SpecRow[];
  mrp: string;
  price: string;
  /** New variants: opening stock. Saved variants: the stock count (changes are recorded as adjustments). */
  opening_stock: string;
  on_hand: number | null;
  is_active: boolean;
  is_default: boolean;
};

let seq = 0;
export const nextKey = () => `vr-${++seq}`;

export function newVariantRow(patch: Partial<VariantRow> = {}): VariantRow {
  return {
    key: nextKey(),
    id: null,
    sku: "",
    name: "",
    colour: "",
    values: {},
    specs: [],
    mrp: "",
    price: "",
    opening_stock: "0",
    on_hand: null,
    is_active: true,
    is_default: false,
    ...patch,
  };
}

type ProductInfo = { id: string; name: string; images: AdminProductImage[] } | null;

type Props = {
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  types: string[];
  onTypesChange: (types: string[]) => void;
  rows: VariantRow[];
  onRowsChange: (rows: VariantRow[]) => void;
  optionTypes: string[];
  errors: Record<string, string>;
  product: ProductInfo;
  onSuggestSku: (row: VariantRow) => string;
};

const MAX_TYPES = 8;
const same = (a: string | undefined, b: string | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const uniq = (list: string[]) => list.filter((v, i) => v && list.findIndex((x) => same(x, v)) === i);
function TypeIcon({ type, main, className }: { type: string; main: boolean; className?: string }) {
  if (main) return <Crown aria-hidden className={className} />;
  if (isColourType(type)) return <Palette aria-hidden className={className} />;
  return <Tag aria-hidden className={className} />;
}

/** Every combination of the given value lists. */
function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
}

/** Keep one row per combination (saved rows win); returns kept and dropped rows. */
function dedupe(list: VariantRow[], types: string[]) {
  const seen = new Set<string>();
  const kept: VariantRow[] = [];
  const dropped: VariantRow[] = [];
  const order = new Map(list.map((r, i) => [r.key, i]));
  for (const r of [...list].sort((a, b) => Number(Boolean(b.id)) - Number(Boolean(a.id)))) {
    const k = comboKey(types, r.values);
    if (seen.has(k)) dropped.push(r);
    else {
      seen.add(k);
      kept.push(r);
    }
  }
  kept.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  return { kept, dropped };
}

export function VariantEditor({ enabled, onEnabledChange, types, onTypesChange, rows, onRowsChange, optionTypes, errors, product, onSuggestSku }: Props) {
  const main = types[0] ?? "";
  // Pending choices that have no combination yet: extra main values, and per main value
  // the sub-variant types and values added before "Generate Combinations".
  const [extraMains, setExtraMains] = useState<string[]>([]);
  const [extraTypes, setExtraTypes] = useState<Record<string, string[]>>({});
  const [extraValues, setExtraValues] = useState<Record<string, Record<string, string[]>>>({});
  // Main values whose "Enable Multiple Sub-Variants" switch is on before any sub type is added.
  const [subOn, setSubOn] = useState<Record<string, boolean>>({});
  const mainValues = uniq([...rows.map((r) => r.values[main] ?? ""), ...extraMains]);
  const [selected, setSelected] = useState<string>(mainValues[0] ?? "");
  const current = mainValues.find((m) => same(m, selected)) ?? mainValues[0] ?? "";
  const mk = (m: string) => m.trim().toLowerCase();

  const inMain = (r: VariantRow, m: string) => same(r.values[main], m);
  /** Sub-variant types used by a main value, in the product's type order. */
  const subTypesFor = (m: string) =>
    types.slice(1).filter((t) => rows.some((r) => inMain(r, m) && r.values[t]) || (extraTypes[mk(m)] ?? []).some((x) => same(x, t)));
  const valuesFor = (m: string, t: string) =>
    uniq([...rows.filter((r) => inMain(r, m)).map((r) => r.values[t] ?? ""), ...(extraValues[mk(m)]?.[t] ?? [])]);
  const indexOf = (key: string) => rows.findIndex((r) => r.key === key);
  const rowError = (r: VariantRow) => {
    const i = indexOf(r.key);
    return ["values", "sku", "mrp", "price", "opening_stock", "stock_target", "name"].map((f) => errors[`variants.${i}.${f}`]).find(Boolean);
  };

  const ensureDefault = (list: VariantRow[]) =>
    list.length && !list.some((r) => r.is_default && r.is_active) ? list.map((r, i) => ({ ...r, is_default: i === list.findIndex((x) => x.is_active) })) : list;
  const commit = (list: VariantRow[]) => onRowsChange(ensureDefault(list));
  const patch = (key: string, p: Partial<VariantRow>) =>
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...p } : p.is_default ? { ...r, is_default: false } : r)));
  const confirmRemoval = (list: VariantRow[], what: string) =>
    !list.some((r) => r.id) || window.confirm(`Remove ${what}? ${list.filter((r) => r.id).length} saved variant(s) will be hidden from the store when you save (kept for order history).`);

  // ------------------------------------------------------------ Generate combinations
  const subTypes = current ? subTypesFor(current) : [];
  const valueLists = subTypes.map((t) => valuesFor(current, t));
  const blockedBy = subTypes.find((t, i) => valueLists[i].length === 0);
  const plannedCombos = blockedBy ? [] : cartesian(valueLists);
  const missingCombos = plannedCombos.filter((combo) => {
    const values: Record<string, string> = { [main]: current };
    subTypes.forEach((t, i) => (values[t] = combo[i]));
    return !rows.some((r) => inMain(r, current) && comboKey([main, ...subTypes], r.values) === comboKey([main, ...subTypes], values));
  });
  const incomplete = rows.filter((r) => inMain(r, current) && subTypes.some((t) => !r.values[t])).length;

  function generate() {
    if (blockedBy) return;
    // Rows from before a sub type was added get its first value, then every missing combination is added.
    let next = rows.map((r) => {
      if (!inMain(r, current)) return r;
      const values = { ...r.values };
      subTypes.forEach((t, i) => {
        if (!values[t]) values[t] = valueLists[i][0];
      });
      return { ...r, values };
    });
    const template = next.find((r) => inMain(r, current)) ?? next[next.length - 1];
    const lastIndex = next.reduce((last, r, i) => (inMain(r, current) ? i : last), next.length - 1);
    const added: VariantRow[] = [];
    const scope = [main, ...subTypes];
    for (const combo of plannedCombos) {
      const values: Record<string, string> = { [main]: current };
      subTypes.forEach((t, i) => (values[t] = combo[i]));
      if (![...next, ...added].some((r) => inMain(r, current) && comboKey(scope, r.values) === comboKey(scope, values))) {
        added.push(newVariantRow({ values, mrp: template?.mrp ?? "", price: template?.price ?? "" }));
      }
    }
    next = [...next.slice(0, lastIndex + 1), ...added, ...next.slice(lastIndex + 1)];
    const { kept } = dedupe(next, types);
    commit(kept);
  }

  // ------------------------------------------------------------ Main values
  function addMainValues(list: string[]) {
    const fresh = uniq(list).filter((v) => !mainValues.some((m) => same(m, v)));
    if (!fresh.length) return setSelected(list[0] ?? current);
    // A main value starts as one combination; add sub-variants and generate to split it.
    const template = rows[rows.length - 1];
    commit([...rows, ...fresh.map((value) => newVariantRow({ values: { [main]: value }, mrp: template?.mrp ?? "", price: template?.price ?? "" }))]);
    setExtraMains((l) => l.filter((x) => !fresh.some((v) => same(x, v))));
    setSelected(fresh[0]);
  }

  function renameValue(t: string, from: string, to: string) {
    const v = to.trim().slice(0, 60);
    if (!v || same(from, v)) return;
    const scope = t === main ? (r: VariantRow) => same(r.values[main], from) : (r: VariantRow) => inMain(r, current) && same(r.values[t], from);
    const existing = t === main ? mainValues : valuesFor(current, t);
    if (existing.some((x) => same(x, v))) return window.alert(`"${v}" is already used here.`);
    onRowsChange(rows.map((r) => (scope(r) ? { ...r, values: { ...r.values, [t]: v } } : r)));
    if (t === main) {
      setExtraMains((l) => l.map((x) => (same(x, from) ? v : x)));
      setExtraTypes((e) => renameKey(e, mk(from), mk(v)));
      setExtraValues((e) => renameKey(e, mk(from), mk(v)));
      if (same(current, from)) setSelected(v);
    } else {
      setExtraValues((e) => ({ ...e, [mk(current)]: { ...(e[mk(current)] ?? {}), [t]: (e[mk(current)]?.[t] ?? []).map((x) => (same(x, from) ? v : x)) } }));
    }
  }

  /** Reorder a value: rows are re-sorted so the product page lists values in this order. */
  function reorderValue(t: string, from: number, to: number) {
    const list = moveItem(t === main ? mainValues : valuesFor(current, t), from, to);
    const rank = (r: VariantRow) => list.findIndex((x) => same(x, r.values[t]));
    if (t === main) {
      const order = new Map(rows.map((r, n) => [r.key, n]));
      onRowsChange([...rows].sort((a, b) => rank(a) - rank(b) || order.get(a.key)! - order.get(b.key)!));
      setExtraMains((l) => list.filter((x) => l.some((y) => same(x, y))));
    } else {
      const mine = rows.filter((r) => inMain(r, current));
      const order = new Map(mine.map((r, n) => [r.key, n]));
      const sorted = [...mine].sort((a, b) => rank(a) - rank(b) || order.get(a.key)! - order.get(b.key)!);
      let k = 0;
      onRowsChange(rows.map((r) => (inMain(r, current) ? sorted[k++] : r)));
      setExtraValues((e) => ({ ...e, [mk(current)]: { ...(e[mk(current)] ?? {}), [t]: list.filter((x) => (e[mk(current)]?.[t] ?? []).some((y) => same(x, y))) } }));
    }
  }

  function removeValue(t: string, value: string) {
    const doomed = rows.filter((r) => (t === main ? same(r.values[main], value) : inMain(r, current) && same(r.values[t], value)));
    if (t === main && rows.length - doomed.length < 1) return window.alert("A product needs at least one variant.");
    if (!confirmRemoval(doomed, `${t} "${value}"`)) return;
    if (t === main) {
      setExtraMains((l) => l.filter((m) => !same(m, value)));
      if (same(current, value)) setSelected(mainValues.find((m) => !same(m, value)) ?? "");
    } else {
      setExtraValues((e) => ({ ...e, [mk(current)]: { ...(e[mk(current)] ?? {}), [t]: (e[mk(current)]?.[t] ?? []).filter((v) => !same(v, value)) } }));
    }
    commit(rows.filter((r) => !doomed.includes(r)));
  }

  function addValues(t: string, list: string[]) {
    const fresh = uniq(list).filter((v) => !valuesFor(current, t).some((x) => same(x, v)));
    if (!fresh.length) return;
    setExtraValues((e) => ({ ...e, [mk(current)]: { ...(e[mk(current)] ?? {}), [t]: [...(e[mk(current)]?.[t] ?? []), ...fresh] } }));
  }

  /** "Enable Multiple Sub-Variants" for the selected main value. Off = it is sold as one variant. */
  function toggleSubVariants(on: boolean) {
    if (on) return setSubOn((s) => ({ ...s, [mk(current)]: true }));
    if (subTypes.length) {
      const stripped = rows.map((r) => (inMain(r, current) ? { ...r, values: { [main]: r.values[main] } } : r));
      const { kept, dropped } = dedupe(stripped, types);
      if (!window.confirm(`Turn off sub-variants for ${current}? ${current} becomes a single variant${dropped.length ? ` and ${dropped.length} combination(s) are removed` : ""}.`)) return;
      if (dropped.some((r) => r.id) && !confirmRemoval(dropped, `${dropped.length} combination(s)`)) return;
      commit(kept);
    }
    setExtraTypes((e) => ({ ...e, [mk(current)]: [] }));
    setExtraValues((e) => ({ ...e, [mk(current)]: {} }));
    setSubOn((s) => ({ ...s, [mk(current)]: false }));
  }

  // ------------------------------------------------------------ Types
  /** Add a type to the product (left panel) or, with `forMain`, a sub-variant to one main value. */
  function addType(name: string, forMain?: string) {
    const t = name.trim().slice(0, 30);
    if (!t) return;
    const existing = types.find((x) => same(x, t));
    if (!existing) {
      if (types.length >= MAX_TYPES) return window.alert(`Up to ${MAX_TYPES} variant types.`);
      if (!types.length) {
        // First type: existing simple variants keep their colour / name as the main value.
        onRowsChange(rows.map((r) => ({ ...r, values: { [t]: r.colour || (r.name !== "Default" ? r.name : "") || "Standard" } })));
        setSelected(rows[0]?.colour || rows[0]?.name || "Standard");
      }
      onTypesChange([...types, t]);
    } else if (same(existing, main) && forMain) return;
    if (forMain && types.length) {
      const typeName = existing ?? t;
      setExtraTypes((e) => ({ ...e, [mk(forMain)]: uniq([...(e[mk(forMain)] ?? []), typeName]) }));
    }
  }

  /** Remove a sub-variant type from one main value (its combinations merge). */
  function removeSubType(t: string) {
    const stripped = rows.map((r) => {
      if (!inMain(r, current) || !r.values[t]) return r;
      const values = { ...r.values };
      delete values[t];
      return { ...r, values };
    });
    const { kept, dropped } = dedupe(stripped, types);
    if (!window.confirm(`Remove ${t} from ${current}?${dropped.length ? ` ${dropped.length} combination(s) become duplicates and will be removed.` : ""}`)) return;
    if (dropped.some((r) => r.id) && !confirmRemoval(dropped, `${dropped.length} combination(s)`)) return;
    setExtraTypes((e) => ({ ...e, [mk(current)]: (e[mk(current)] ?? []).filter((x) => !same(x, t)) }));
    setExtraValues((e) => ({ ...e, [mk(current)]: { ...(e[mk(current)] ?? {}), [t]: [] } }));
    commit(kept);
  }

  /** Remove a type from the whole product. */
  function removeType(t: string) {
    const remaining = types.filter((x) => x !== t);
    const stripped = rows.map((r) => {
      const values = { ...r.values };
      delete values[t];
      return { ...r, values, colour: remaining.length ? r.colour : r.colour || r.values[t] || "" };
    });
    const { kept, dropped } = remaining.length ? dedupe(stripped, remaining) : { kept: stripped, dropped: [] as VariantRow[] };
    if (!window.confirm(`Remove the variant type "${t}" from this product?${dropped.length ? ` ${dropped.length} combination(s) become duplicates and will be removed.` : ""}`)) return;
    if (dropped.some((r) => r.id) && !confirmRemoval(dropped, `${dropped.length} combination(s)`)) return;
    commit(kept);
    onTypesChange(remaining);
    if (t === main) setSelected("");
  }

  function renameType(from: string, to: string) {
    const t = to.trim().slice(0, 30);
    if (!t || (types.some((x) => same(x, t)) && !same(from, t))) return;
    onTypesChange(types.map((x) => (x === from ? t : x)));
    onRowsChange(
      rows.map((r) => {
        if (!(from in r.values)) return r;
        const values = { ...r.values, [t]: r.values[from] };
        if (t !== from) delete values[from];
        return { ...r, values };
      }),
    );
    setExtraTypes((e) => Object.fromEntries(Object.entries(e).map(([m, list]) => [m, list.map((x) => (x === from ? t : x))])));
    setExtraValues((e) => Object.fromEntries(Object.entries(e).map(([m, byType]) => [m, renameKey(byType, from, t)])));
  }

  function reorderTypes(from: number, to: number) {
    if ((from === 0 || to === 0) && !window.confirm(`Make "${types[from === 0 ? 1 : from]}" the main variant type? Customers choose it first.`)) return;
    onTypesChange(moveItem(types, from, to));
    if (from === 0 || to === 0) setSelected("");
  }

  /** Reorder the selected main value's sub-variant types (the product's type order changes to match). */
  function reorderSubTypes(from: number, to: number) {
    const order = moveItem(subTypes, from, to);
    const moved = order[to];
    const rest = types.filter((x) => x !== moved);
    const after = order[to + 1];
    rest.splice(after ? rest.indexOf(after) : rest.indexOf(order[to - 1]) + 1, 0, moved);
    onTypesChange(rest);
  }

  const tableTypes = main ? [main, ...subTypes] : [];
  const tableRows = main ? rows.filter((r) => inMain(r, current)) : rows;

  /** Reorder combinations (the display order on the product page). */
  function reorderCombos(from: number, to: number) {
    const sorted = moveItem(tableRows, from, to);
    let k = 0;
    onRowsChange(rows.map((r) => (tableRows.includes(r) ? sorted[k++] : r)));
  }

  const subEnabled = subTypes.length > 0 || Boolean(subOn[mk(current)]);
  // Several sub types with a single value each usually means values were added as types.
  const lonelyTypes = subTypes.filter((t) => valuesFor(current, t).length === 1);
  const typeSort = useDragSort(types.length, reorderTypes);
  const mainSort = useDragSort(mainValues.length, (from, to) => reorderValue(main, from, to));
  const subSort = useDragSort(subTypes.length, reorderSubTypes);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-xl bg-royal-50 px-3 py-2 font-heading text-sm font-bold text-royal">
          <Layers aria-hidden className="size-4" /> Variant Structure
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2 text-sm font-medium text-deep">
          Enable Variants
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => {
              if (!e.target.checked && types.length && !window.confirm("Turn variants off? Variant types are removed and each combination stays as a simple variant.")) return;
              onEnabledChange(e.target.checked);
            }}
            className="peer sr-only"
          />
          <span aria-hidden className="relative h-6 w-11 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-royal after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
        </label>
      </div>

      {errors.variants ? <p className="text-xs text-danger">{errors.variants}</p> : null}

      {enabled ? (
        <div className="grid gap-4 xl:grid-cols-[17rem_1fr]">
          {/* All variant types of this product */}
          <section className="rounded-2xl border bg-muted/20 p-3" aria-labelledby="vt-h">
            <h3 id="vt-h" className="mb-1 flex items-center gap-1.5 font-heading text-sm font-bold text-deep">
              Variant Types <span className="font-normal text-muted-foreground">(Attributes)</span>
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">A type is what customers choose (Size, Colour, Speed Type). The first is the main choice. Drag to reorder.</p>
            {types.length ? (
              <ul className="flex flex-col gap-1.5">
                {types.map((t, i) => (
                  <TypeRow
                    key={t}
                    type={t}
                    isMain={i === 0}
                    item={typeSort.item(i)}
                    handle={typeSort.handle(i, t)}
                    error={errors[`variant_types.${i}`]}
                    onRename={(to) => renameType(t, to)}
                    onRemove={() => removeType(t)}
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-white p-3 text-xs text-muted-foreground">Add the first type: the main choice customers make (e.g. Wheel Size, Size, Voltage).</p>
            )}
            {types.length < MAX_TYPES ? (
              <AddTypeButton label={types.length ? "Add Variant Type" : "Add Main Variant Type"} options={optionTypes.filter((o) => !types.some((t) => same(t, o)))} onAdd={(n) => addType(n)} />
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Up to {MAX_TYPES} variant types.</p>
            )}
          </section>

          <section className="min-w-0 rounded-2xl border p-3" aria-labelledby="vv-h">
            <h3 id="vv-h" className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold text-deep">
              Variant Values &amp; Combinations
            </h3>
            {!main ? (
              <p className="mb-3 text-sm text-muted-foreground">Add a variant type on the left to start.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={main}>
                  {mainValues.map((m, i) => {
                    const count = rows.filter((r) => inMain(r, m)).length;
                    const bad = rows.some((r) => inMain(r, m) && rowError(r));
                    const on = same(m, current);
                    return (
                      <span
                        key={m}
                        {...mainSort.item(i)}
                        className={cn(
                          "inline-flex h-10 items-center rounded-lg border text-sm font-bold transition-colors",
                          on ? "border-royal bg-royal text-white" : "bg-white text-deep hover:border-royal-200",
                          bad && !on && "border-danger",
                          sortableClass,
                        )}
                      >
                        <button {...mainSort.handle(i, `${main} ${m}`)} className={cn("grid h-full w-6 place-items-center rounded-l-lg", on ? "text-white/70" : "text-muted-foreground")}>
                          <GripVertical aria-hidden className="size-3.5" />
                        </button>
                        <button type="button" role="tab" aria-selected={on} onClick={() => setSelected(m)} className="inline-flex h-full items-center gap-2 pr-4">
                          {m} <span className={cn("text-xs font-medium", on ? "text-white/80" : "text-muted-foreground")}>({count})</span>
                        </button>
                      </span>
                    );
                  })}
                  <AddValueButton label={`Add ${main}`} onAdd={addMainValues} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {main} values. Add several at once with commas (e.g. 24&quot;, 26&quot;, 27.5&quot;). Drag <GripVertical aria-hidden className="inline size-3" /> to reorder.
                </p>

                {current ? (
                  <div className="mt-4 rounded-xl border bg-muted/20 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <p className="font-heading text-sm font-semibold text-deep">{current} – Variant Options</p>
                      <span className="ml-auto flex items-center gap-1">
                        <ValueTools label={`${main} ${current}`} value={current} onRename={(to) => renameValue(main, current, to)} onRemove={() => removeValue(main, current)} />
                      </span>
                    </div>

                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5">
                      <span>
                        <span className="block text-sm font-semibold text-deep">Enable Multiple Sub-Variants</span>
                        <span className="block text-xs text-muted-foreground">Extra choices for {current} only, e.g. Colour, Speed Type, Brake Type.</span>
                      </span>
                      <input type="checkbox" role="switch" checked={subEnabled} onChange={(e) => toggleSubVariants(e.target.checked)} className="peer sr-only" />
                      <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-royal after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
                    </label>

                    {subEnabled ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {subTypes.map((t, i) => (
                          <SubTypeCard
                            key={t}
                            type={t}
                            main={current}
                            values={valuesFor(current, t)}
                            item={subSort.item(i)}
                            handle={subSort.handle(i, t)}
                            onRenameType={(to) => renameType(t, to)}
                            onRemoveType={() => removeSubType(t)}
                            onAddValues={(list) => addValues(t, list)}
                            onRenameValue={(v, to) => renameValue(t, v, to)}
                            onRemoveValue={(v) => removeValue(t, v)}
                            onReorderValues={(from, to) => reorderValue(t, from, to)}
                          />
                        ))}
                        {lonelyTypes.length >= 2 ? (
                          <p className="flex items-start gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-700">
                            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                            <span>
                              {lonelyTypes.map((t) => `"${t}"`).join(", ")} each have only one value. If they are choices of the same thing (e.g. Single Speed and Multi Speed), delete them and add <strong>one</strong> type (e.g. Speed Type) with those as its values.
                            </span>
                          </p>
                        ) : null}
                        <AddTypeButton
                          label="Add Sub-Variant Type"
                          compact
                          placeholder="Type name, e.g. Speed Type"
                          options={uniq([...types.slice(1), ...optionTypes]).filter((o) => !same(o, main) && !subTypes.some((t) => same(t, o)))}
                          onAdd={(n) => addType(n, current)}
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">{current} is sold as one variant. Turn the switch on to add sub-variant types and values.</p>
                    )}

                    {subTypes.length ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-royal-100 bg-royal-50/50 px-3 py-2">
                        <button
                          type="button"
                          onClick={generate}
                          disabled={Boolean(blockedBy) || (!missingCombos.length && !incomplete)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-royal px-3 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-50"
                        >
                          <Wand2 aria-hidden className="size-4" /> Generate Combinations
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {blockedBy
                            ? `Add at least one ${blockedBy} value first.`
                            : missingCombos.length || incomplete
                              ? `${missingCombos.length} new combination${missingCombos.length === 1 ? "" : "s"} will be added${incomplete ? `, ${incomplete} existing one${incomplete === 1 ? "" : "s"} completed` : ""}.`
                              : `All ${plannedCombos.length} combinations exist. Disable the ones you don't sell.`}
                        </span>
                        {!blockedBy ? (
                          <span className="ml-auto text-xs font-semibold text-royal">
                            {current}: {plannedCombos.length} combination{plannedCombos.length === 1 ? "" : "s"} · Product total: {rows.length + missingCombos.length}
                          </span>
                        ) : null}
                        {missingCombos.length ? (
                          <div className="flex w-full flex-wrap gap-1.5" aria-label="Combinations to be added">
                            {missingCombos.slice(0, 12).map((c) => (
                              <span key={c.join("|")} className="rounded-md border border-royal-100 bg-white px-2 py-0.5 text-xs text-deep">
                                {[current, ...c].join(" • ")}
                              </span>
                            ))}
                            {missingCombos.length > 12 ? <span className="px-1 text-xs text-muted-foreground">+{missingCombos.length - 12} more</span> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            {!main || current ? (
              <CombinationsTable
                title={main ? `Variant Combinations (${current})` : "Variants"}
                rows={tableRows}
                allRows={rows}
                types={tableTypes}
                main={main}
                current={current}
                commit={commit}
                patch={patch}
                confirmRemoval={confirmRemoval}
                errors={errors}
                indexOf={indexOf}
                product={product}
                onSuggestSku={onSuggestSku}
                valuesFor={valuesFor}
                onReorder={reorderCombos}
              />
            ) : null}
          </section>
        </div>
      ) : (
        <CombinationsTable
          title="Variants"
          rows={rows}
          allRows={rows}
          types={[]}
          main=""
          current=""
          commit={commit}
          patch={patch}
          confirmRemoval={confirmRemoval}
          errors={errors}
          indexOf={indexOf}
          product={product}
          onSuggestSku={onSuggestSku}
          valuesFor={valuesFor}
          onReorder={reorderCombos}
        />
      )}

      <p className="flex items-start gap-2 rounded-xl bg-royal-50/70 px-4 py-3 text-sm text-royal-800">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Variants are flexible and <strong>product dependent</strong>. Each {main || "main value"} can use its own sub-variants (e.g. Colour, Speed Type, Brake Type) and values. Every
          combination has its own SKU, price, stock, images and status; disable the ones you don&apos;t sell.
        </span>
      </p>
    </div>
  );
}

function renameKey<T>(obj: Record<string, T>, from: string, to: string): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]));
}

type SortItem = ReturnType<ReturnType<typeof useDragSort>["item"]>;
type SortHandle = ReturnType<ReturnType<typeof useDragSort>["handle"]>;

/** Splits "Red, Blue, Green" into values (commas or new lines). */
const splitValues = (text: string) =>
  text
    .split(/[,\n]+/)
    .map((v) => v.trim().slice(0, 60))
    .filter(Boolean);

/** One sub-variant type of a main value: its name, its values and the tools for both. */
function SubTypeCard({
  type,
  main,
  values,
  item,
  handle,
  onRenameType,
  onRemoveType,
  onAddValues,
  onRenameValue,
  onRemoveValue,
  onReorderValues,
}: {
  type: string;
  main: string;
  values: string[];
  item: SortItem;
  handle: SortHandle;
  onRenameType: (to: string) => void;
  onRemoveType: () => void;
  onAddValues: (list: string[]) => void;
  onRenameValue: (value: string, to: string) => void;
  onRemoveValue: (value: string) => void;
  onReorderValues: (from: number, to: number) => void;
}) {
  const valueSort = useDragSort(values.length, onReorderValues);
  const colour = isColourType(type);
  return (
    <div {...item} className={cn("rounded-lg border bg-white p-2.5", sortableClass)}>
      <div className="flex items-center gap-1.5">
        <button {...handle} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted">
          <GripVertical aria-hidden className="size-4" />
        </button>
        <TypeIcon type={type} main={false} className="size-4 shrink-0 text-royal" />
        <span className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Type</span>
        <InlineName value={type} maxLength={30} label={`Rename the type ${type}`} onSave={onRenameType} />
        <button type="button" onClick={onRemoveType} aria-label={`Remove ${type} from ${main}`} className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-danger hover:bg-danger-soft">
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-1 sm:pl-9">
        <span className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Values</span>
        {values.map((v, i) => (
          <ValueChip
            key={v}
            value={v}
            swatch={colour ? swatchFor(v) : null}
            item={valueSort.item(i)}
            handle={valueSort.handle(i, v)}
            onRename={(to) => onRenameValue(v, to)}
            onRemove={() => onRemoveValue(v)}
          />
        ))}
        {!values.length ? <span className="text-xs text-danger">Add at least one value.</span> : null}
        <AddValueButton label="Add Value" placeholder={colour ? "e.g. Red, Blue" : "e.g. Single Speed, Multi Speed"} onAdd={onAddValues} small />
      </div>
    </div>
  );
}

/** Text that turns into an input when clicked; Enter or leaving the field saves. */
function InlineName({ value, maxLength, label, onSave }: { value: string; maxLength: number; label: string; onSave: (to: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const save = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onSave(draft);
  };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 min-w-0 flex-1 rounded-md border px-2 text-base font-semibold outline-none focus:border-royal sm:text-sm"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      aria-label={label}
      className="group inline-flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-deep hover:bg-muted"
    >
      <span className="truncate">{value}</span>
      <Pencil aria-hidden className="size-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** A value chip: drag handle, value, rename and remove. */
function ValueChip({
  value,
  swatch,
  item,
  handle,
  onRename,
  onRemove,
}: {
  value: string;
  swatch: string | null;
  item: SortItem;
  handle: SortHandle;
  onRename: (to: string) => void;
  onRemove: () => void;
}) {
  return (
    <span {...item} className={cn("inline-flex h-9 items-center gap-1 rounded-lg border bg-white pr-1 text-sm font-medium text-deep", sortableClass)}>
      <button {...handle} className="grid h-full w-6 place-items-center rounded-l-lg text-muted-foreground hover:bg-muted">
        <GripVertical aria-hidden className="size-3.5" />
      </button>
      {swatch ? <span aria-hidden className="size-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: swatch }} /> : null}
      <span className="px-0.5">{value}</span>
      <ValueTools label={value} value={value} onRename={onRename} onRemove={onRemove} small />
    </span>
  );
}

/** Rename / remove buttons for a value. */
function ValueTools({ label, value, onRename, onRemove, small = false }: { label: string; value: string; onRename: (to: string) => void; onRemove: () => void; small?: boolean }) {
  const btn = cn("grid place-items-center rounded-md", small ? "size-6" : "size-7 border bg-white");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const to = window.prompt(`Rename "${value}" to:`, value);
          if (to !== null) onRename(to);
        }}
        aria-label={`Rename ${label}`}
        className={cn(btn, "text-muted-foreground hover:bg-muted hover:text-deep")}
      >
        <Pencil className="size-3" />
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className={cn(btn, "text-danger hover:bg-danger-soft")}>
        {small ? <X className="size-3" /> : <Trash2 className="size-3" />}
      </button>
    </>
  );
}

function TypeRow({
  type,
  isMain,
  item,
  handle,
  error,
  onRename,
  onRemove,
}: {
  type: string;
  isMain: boolean;
  item: SortItem;
  handle: SortHandle;
  error?: string;
  onRename: (to: string) => void;
  onRemove: () => void;
}) {
  return (
    <li {...item} className={cn("flex items-center gap-1.5 rounded-lg border bg-white px-1.5 py-1.5", isMain && "border-royal-200 bg-royal-50/60", sortableClass)}>
      <button {...handle} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted">
        <GripVertical aria-hidden className="size-4" />
      </button>
      <TypeIcon type={type} main={isMain} className={cn("size-4 shrink-0", isMain ? "text-gold-600" : "text-royal")} />
      <InlineName value={type} maxLength={30} label={`Rename ${type}`} onSave={onRename} />
      {isMain ? <span className="rounded bg-gold-50 px-1 text-[0.65rem] font-semibold text-gold-700">Main</span> : null}
      <button type="button" onClick={onRemove} aria-label={`Remove ${type}`} className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-danger hover:bg-danger-soft">
        <Trash2 className="size-3.5" />
      </button>
      {error ? <span className="sr-only">{error}</span> : null}
    </li>
  );
}

function AddTypeButton({
  options,
  onAdd,
  label = "Add Variant Type",
  placeholder = "Type name, e.g. Battery",
  compact = false,
}: {
  options: string[];
  onAdd: (name: string) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-royal-200 bg-white text-sm font-semibold text-royal hover:bg-royal-50",
          compact ? "w-fit px-3" : "mt-3 w-full",
        )}
      >
        <Plus aria-hidden className="size-4" /> {label}
      </button>
    );
  }
  const add = (name: string) => {
    if (name.trim()) onAdd(name);
    setCustom("");
    setOpen(false);
  };
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border bg-white p-2">
      <p className="text-xs text-muted-foreground">
        A <strong>type</strong> is the question customers answer (Colour, Speed Type). Its choices (Red, Single Speed) are <strong>values</strong>, added next.
      </p>
      {options.length ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button key={o} type="button" onClick={() => add(o)} className="rounded-md border px-2 py-1 text-xs font-medium text-deep hover:border-royal hover:text-royal">
              {o}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={custom}
          maxLength={30}
          aria-label="Type name"
          placeholder={placeholder}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(custom);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-9 min-w-0 flex-1 rounded-md border px-2 text-base outline-none focus:border-royal sm:text-sm"
        />
        <button type="button" onClick={() => add(custom)} className="h-9 rounded-md bg-royal px-3 text-xs font-semibold text-white">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="grid size-9 place-items-center rounded-md border">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** "+ Add …" that turns into a small input: Enter adds the value(s); commas add several. */
function AddValueButton({ label, onAdd, placeholder = "Type, then Enter", small = false }: { label: string; onAdd: (values: string[]) => void; placeholder?: string; small?: boolean }) {
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const done = () => {
    const list = splitValues(value);
    if (list.length) onAdd(list);
    setValue("");
    setTyping(false);
  };
  if (typing) {
    return (
      <input
        autoFocus
        value={value}
        maxLength={400}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            done();
          } else if (e.key === "Escape") setTyping(false);
        }}
        onBlur={done}
        className={cn("w-56 max-w-full rounded-lg border border-royal px-3 text-base outline-none sm:text-sm", small ? "h-9" : "h-10")}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setTyping(true)}
      className={cn("inline-flex items-center gap-1.5 rounded-lg border border-royal-200 bg-white px-3 text-sm font-semibold text-royal hover:bg-royal-50", small ? "h-9" : "h-10")}
    >
      <Plus aria-hidden className="size-4" /> {label}
    </button>
  );
}


function CombinationsTable({
  title,
  rows,
  allRows,
  types,
  main,
  current,
  commit,
  patch,
  confirmRemoval,
  errors,
  indexOf,
  product,
  onSuggestSku,
  valuesFor,
  onReorder,
}: {
  title: string;
  rows: VariantRow[];
  allRows: VariantRow[];
  types: string[];
  main: string;
  current: string;
  commit: (list: VariantRow[]) => void;
  patch: (key: string, p: Partial<VariantRow>) => void;
  confirmRemoval: (list: VariantRow[], what: string) => boolean;
  errors: Record<string, string>;
  indexOf: (key: string) => number;
  product: ProductInfo;
  onSuggestSku: (row: VariantRow) => string;
  valuesFor: (m: string, t: string) => string[];
  onReorder: (from: number, to: number) => void;
}) {
  const sort = useDragSort(rows.length, onReorder);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const others = types.slice(1);
  const simple = !types.length;
  const pickedRows = rows.filter((r) => picked.has(r.key));
  const allPicked = rows.length > 0 && pickedRows.length === rows.length;

  const remove = (list: VariantRow[]) => {
    if (allRows.length - list.length < 1) return window.alert("A product needs at least one variant.");
    if (!confirmRemoval(list, list.length === 1 ? "this variant" : `${list.length} variants`)) return;
    commit(allRows.filter((r) => !list.includes(r)));
    setPicked(new Set());
  };
  const bulk = (active: boolean) => {
    commit(allRows.map((r) => (picked.has(r.key) ? { ...r, is_active: active } : r)));
    setPicked(new Set());
  };
  const addSimple = () => {
    const last = allRows[allRows.length - 1];
    commit([...allRows, newVariantRow({ values: main ? { [main]: current } : {}, mrp: last?.mrp ?? "", price: last?.price ?? "" })]);
  };

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 font-heading text-sm font-bold text-deep">
          {title} <Info aria-hidden className="size-3.5 text-muted-foreground" />
        </h4>
        {simple ? (
          <button type="button" onClick={addSimple} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-royal-200 px-3 text-sm font-semibold text-royal hover:bg-royal-50">
            <Plus aria-hidden className="size-4" /> Add variant
          </button>
        ) : others.length ? (
          <button type="button" onClick={() => setAdding((a) => !a)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-royal-200 px-3 text-sm font-semibold text-royal hover:bg-royal-50">
            <Plus aria-hidden className="size-4" /> Add Combination
          </button>
        ) : null}
      </div>

      {adding && others.length ? (
        <AddCombination
          types={types}
          main={main}
          current={current}
          others={others}
          valuesFor={valuesFor}
          exists={(values) => allRows.some((r) => comboKey(types, r.values) === comboKey(types, values))}
          onAdd={(values) => {
            const template = rows[0] ?? allRows[allRows.length - 1];
            const at = allRows.reduce((last, r, i) => (same(r.values[main], current) ? i : last), allRows.length - 1);
            commit([...allRows.slice(0, at + 1), newVariantRow({ values, mrp: template?.mrp ?? "", price: template?.price ?? "" }), ...allRows.slice(at + 1)]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {pickedRows.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-royal-50 px-3 py-2 text-sm">
          <span className="font-semibold text-royal">{pickedRows.length} selected</span>
          <button type="button" onClick={() => bulk(true)} className="rounded-md border bg-white px-2 py-1 text-xs font-semibold text-success">Set active</button>
          <button type="button" onClick={() => bulk(false)} className="rounded-md border bg-white px-2 py-1 text-xs font-semibold text-deep">Set inactive</button>
          <button type="button" onClick={() => remove(pickedRows)} className="rounded-md border bg-white px-2 py-1 text-xs font-semibold text-danger">Remove</button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-16 py-2 pr-2 pl-9">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allPicked}
                  onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set())}
                  className="accent-royal"
                />
              </th>
              <th className="w-16 px-2 py-2 font-medium">Image</th>
              <th className="px-2 py-2 font-medium">{simple ? "Variant" : "Combination"}</th>
              <th className="w-44 px-2 py-2 font-medium">SKU</th>
              <th className="w-28 px-2 py-2 font-medium">MRP (₹)</th>
              <th className="w-28 px-2 py-2 font-medium">Selling Price (₹)</th>
              <th className="w-20 px-2 py-2 font-medium">Stock</th>
              <th className="w-24 px-2 py-2 font-medium">Status</th>
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No combinations yet. Add values above, or use Add Combination.
                </td>
              </tr>
            ) : null}
            {rows.map((r, n) => (
              <ComboRow
                key={r.key}
                row={r}
                item={sort.item(n)}
                handle={sort.handle(n, simple ? r.colour || r.name || "variant" : types.map((t) => r.values[t]).join(" "))}
                types={types}
                simple={simple}
                picked={picked.has(r.key)}
                onPick={(on) => setPicked((s) => {
                  const n = new Set(s);
                  if (on) n.add(r.key);
                  else n.delete(r.key);
                  return n;
                })}
                expanded={expanded === r.key}
                onToggle={() => setExpanded((e) => (e === r.key ? null : r.key))}
                onRemove={() => remove([r])}
                patch={patch}
                errors={errors}
                index={indexOf(r.key)}
                product={product}
                onSuggestSku={onSuggestSku}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddCombination({
  main,
  current,
  others,
  valuesFor,
  exists,
  onAdd,
  onCancel,
}: {
  types: string[];
  main: string;
  current: string;
  others: string[];
  valuesFor: (m: string, t: string) => string[];
  exists: (values: Record<string, string>) => boolean;
  onAdd: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(others.map((t) => [t, valuesFor(current, t)[0] ?? ""])));
  const full: Record<string, string> = { [main]: current, ...values };
  const missing = others.some((t) => !values[t]?.trim());
  const duplicate = !missing && exists(full);
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-royal-200 bg-royal-50/40 p-3">
      <span className="h-9 rounded-lg bg-royal px-3 text-sm leading-9 font-bold text-white">{current}</span>
      {others.map((t) => (
        <label key={t} className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">{t}</span>
          <input
            list={`combo-${t}`}
            value={values[t] ?? ""}
            maxLength={60}
            onChange={(e) => setValues((v) => ({ ...v, [t]: e.target.value }))}
            className="h-9 w-40 rounded-lg border bg-white px-2 text-base outline-none focus:border-royal sm:text-sm"
          />
          <datalist id={`combo-${t}`}>
            {valuesFor(current, t).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      ))}
      <button type="button" disabled={missing || duplicate} onClick={() => onAdd(full)} className="h-9 rounded-lg bg-royal px-3 text-sm font-semibold text-white disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={onCancel} className="h-9 rounded-lg border bg-white px-3 text-sm">
        Cancel
      </button>
      {duplicate ? <p className="w-full text-xs text-danger">That combination already exists.</p> : null}
    </div>
  );
}

function ComboRow({
  row: v,
  item,
  handle,
  types,
  simple,
  picked,
  onPick,
  expanded,
  onToggle,
  onRemove,
  patch,
  errors,
  index: i,
  product,
  onSuggestSku,
}: {
  row: VariantRow;
  item: SortItem;
  handle: SortHandle;
  types: string[];
  simple: boolean;
  picked: boolean;
  onPick: (on: boolean) => void;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  patch: (key: string, p: Partial<VariantRow>) => void;
  errors: Record<string, string>;
  index: number;
  product: ProductInfo;
  onSuggestSku: (row: VariantRow) => string;
}) {
  const err = (f: string) => errors[`variants.${i}.${f}`];
  const ownImages = useMemo(
    () => (product && v.id ? product.images.filter((img) => img.variant_id === v.id).sort((a, b) => a.position - b.position) : []),
    [product, v.id],
  );
  const label = simple ? v.colour || v.name : types.map((t) => v.values[t] || "?").join(" • ");
  const off = discountPercent(rupeesToPaise(v.mrp) || 0, rupeesToPaise(v.price) || 0);
  const anyError = ["values", "sku", "mrp", "price", "opening_stock", "stock_target", "name"].map(err).find(Boolean);
  const cell = "h-9 w-full min-w-0 rounded-md border bg-white px-2 text-base outline-none focus:border-royal aria-invalid:border-danger sm:text-sm";
  const setSpec = (key: string, p: Partial<SpecRow>) => patch(v.key, { specs: v.specs.map((s) => (s.key === key ? { ...s, ...p } : s)) });

  return (
    <Fragment>
      <tr {...item} className={cn("border-t align-middle", !v.is_active && "bg-muted/40 text-muted-foreground", anyError && "bg-danger-soft/30", sortableClass)}>
        <td className="py-2 pr-2 pl-1">
          <span className="flex items-center gap-1">
            <button {...handle} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
              <GripVertical aria-hidden className="size-4" />
            </button>
            <input type="checkbox" aria-label={`Select ${label}`} checked={picked} onChange={(e) => onPick(e.target.checked)} className="accent-royal" />
          </span>
        </td>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={`Images for ${label}`}
            className="grid size-12 place-items-center overflow-hidden rounded-lg border bg-muted hover:border-royal"
          >
            {ownImages[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
              <img src={ownImages[0].url} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-4 text-royal-300" />
            )}
          </button>
        </td>
        <td className="px-2 py-2">
          {simple ? (
            <input value={v.colour} maxLength={40} placeholder="e.g. Red" onChange={(e) => patch(v.key, { colour: e.target.value })} aria-label="Variant colour or label" className={cell} />
          ) : (
            <span className="font-medium text-deep">{label}</span>
          )}
          {v.is_default ? (
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-gold-50 px-1 text-[0.65rem] font-semibold text-gold-700">
              <Star aria-hidden className="size-2.5" /> Default
            </span>
          ) : null}
          {anyError ? <p className="mt-0.5 text-xs text-danger">{anyError}</p> : null}
        </td>
        <td className="px-2 py-2">
          <div className="flex gap-1">
            <input value={v.sku} maxLength={40} onChange={(e) => patch(v.key, { sku: e.target.value.toUpperCase() })} aria-label={`SKU for ${label}`} aria-invalid={Boolean(err("sku"))} className={cn(cell, "font-mono text-xs")} />
            <button type="button" onClick={() => patch(v.key, { sku: onSuggestSku(v) })} title="Generate SKU" aria-label="Generate SKU" className="grid size-9 shrink-0 place-items-center rounded-md border text-royal hover:bg-royal-50">
              <Sparkles className="size-3.5" />
            </button>
          </div>
        </td>
        <td className="px-2 py-2">
          <input inputMode="decimal" value={v.mrp} onChange={(e) => patch(v.key, { mrp: e.target.value })} aria-label={`MRP for ${label}`} aria-invalid={Boolean(err("mrp"))} className={cell} />
        </td>
        <td className="px-2 py-2">
          <input inputMode="decimal" value={v.price} onChange={(e) => patch(v.key, { price: e.target.value })} aria-label={`Selling price for ${label}`} aria-invalid={Boolean(err("price"))} className={cell} />
          {off > 0 ? <span className="text-[0.65rem] text-success">{off}% off</span> : null}
        </td>
        <td className="px-2 py-2">
          <input
            inputMode="numeric"
            value={v.opening_stock}
            onChange={(e) => patch(v.key, { opening_stock: e.target.value.replace(/[^\d]/g, "") })}
            aria-label={`Stock for ${label}`}
            aria-invalid={Boolean(err("opening_stock") || err("stock_target"))}
            className={cell}
          />
        </td>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={() => patch(v.key, { is_active: !v.is_active })}
            aria-pressed={v.is_active}
            className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", v.is_active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}
          >
            {v.is_active ? "Active" : "Inactive"}
          </button>
        </td>
        <td className="px-2 py-2">
          <div className="flex justify-end gap-1">
            <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`Edit ${label}`} className={cn("grid size-8 place-items-center rounded-md border hover:bg-muted", expanded && "border-royal text-royal")}>
              <Pencil className="size-3.5" />
            </button>
            <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid size-8 place-items-center rounded-md border text-danger hover:bg-danger-soft">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-muted/20">
          <td colSpan={9} className="px-3 py-3">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Variant name (optional)</span>
                  <input value={v.name} maxLength={120} placeholder={`Automatic: ${label}`} onChange={(e) => patch(v.key, { name: e.target.value })} className={inputClass} />
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="radio" name="default-variant" checked={v.is_default} onChange={() => patch(v.key, { is_default: true })} className="accent-royal" />
                  Default selection on the product page
                </label>
                <div className="flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-deep">
                    <ListPlus aria-hidden className="size-4 text-royal" /> Specifications for this variant
                  </span>
                  {v.specs.map((s) => (
                    <div key={s.key} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                      <input aria-label="Specification name" value={s.name} maxLength={60} placeholder="e.g. Gears" onChange={(e) => setSpec(s.key, { name: e.target.value })} className={inputClass} />
                      <input aria-label="Specification value" value={s.value} maxLength={200} placeholder="e.g. Single speed" onChange={(e) => setSpec(s.key, { value: e.target.value })} className={inputClass} />
                      <button type="button" aria-label="Remove specification" onClick={() => patch(v.key, { specs: v.specs.filter((x) => x.key !== s.key) })} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => patch(v.key, { specs: [...v.specs, { key: nextKey(), name: "", value: "" }] })} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal hover:underline">
                    <Plus aria-hidden className="size-4" /> Add specification
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-deep">Images for {label}</p>
                {product && v.id ? (
                  <ProductImages
                    key={`${v.id}-${ownImages.map((x) => x.id).join(",")}`}
                    productId={product.id}
                    productName={`${product.name} ${label}`.trim()}
                    images={product.images}
                    variantId={v.id}
                    compact
                  />
                ) : (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Save the product first, then add images for this variant.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
