"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crown,
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
  function addMainValue(value: string) {
    if (mainValues.some((m) => same(m, value))) return setSelected(value);
    // A main value starts as one combination; add sub-variants and generate to split it.
    const template = rows[rows.length - 1];
    commit([...rows, newVariantRow({ values: { [main]: value }, mrp: template?.mrp ?? "", price: template?.price ?? "" })]);
    setExtraMains((l) => l.filter((x) => !same(x, value)));
    setSelected(value);
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
  function moveValue(t: string, value: string, dir: -1 | 1) {
    const list = t === main ? [...mainValues] : valuesFor(current, t);
    const i = list.findIndex((x) => same(x, value));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
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

  function addValue(t: string, value: string) {
    if (valuesFor(current, t).some((v) => same(v, value))) return;
    setExtraValues((e) => ({ ...e, [mk(current)]: { ...(e[mk(current)] ?? {}), [t]: [...(e[mk(current)]?.[t] ?? []), value] } }));
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

  function moveType(index: number, dir: -1 | 1) {
    const next = [...types];
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved);
    onTypesChange(next);
    if (index + dir === 0 || index === 0) setSelected("");
  }

  const tableTypes = main ? [main, ...subTypes] : [];
  const tableRows = main ? rows.filter((r) => inMain(r, current)) : rows;

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
            <p className="mb-3 text-xs text-muted-foreground">The first is the main choice. Each main value picks which of the others it uses.</p>
            {types.length ? (
              <ul className="flex flex-col gap-1.5">
                {types.map((t, i) => (
                  <TypeRow
                    key={t}
                    type={t}
                    isMain={i === 0}
                    canUp={i > 0}
                    canDown={i < types.length - 1}
                    error={errors[`variant_types.${i}`]}
                    onUp={() => moveType(i, -1)}
                    onDown={() => moveType(i, 1)}
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
                  {mainValues.map((m) => {
                    const count = rows.filter((r) => inMain(r, m)).length;
                    const bad = rows.some((r) => inMain(r, m) && rowError(r));
                    return (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={same(m, current)}
                        onClick={() => setSelected(m)}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-bold transition-colors",
                          same(m, current) ? "border-royal bg-royal text-white" : "bg-white text-deep hover:border-royal-200",
                          bad && !same(m, current) && "border-danger",
                        )}
                      >
                        {m} <span className={cn("text-xs font-medium", same(m, current) ? "text-white/80" : "text-muted-foreground")}>({count})</span>
                      </button>
                    );
                  })}
                  <AddValueButton label={`Add ${main}`} onAdd={addMainValue} />
                </div>

                {current ? (
                  <div className="mt-4 rounded-xl border bg-muted/20 p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <p className="font-heading text-sm font-semibold text-deep">{current} – Variant Options</p>
                      <span className="ml-auto flex items-center gap-1">
                        <ValueTools
                          label={`${main} ${current}`}
                          onRename={(to) => renameValue(main, current, to)}
                          onLeft={() => moveValue(main, current, -1)}
                          onRight={() => moveValue(main, current, 1)}
                          onRemove={() => removeValue(main, current)}
                          value={current}
                        />
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {subTypes.map((t) => (
                        <div key={t} className="grid gap-2 rounded-lg bg-white p-2 sm:grid-cols-[10rem_1fr] sm:items-start">
                          <span className="flex items-center gap-2 pt-2 text-sm font-medium text-deep">
                            <TypeIcon type={t} main={false} className="size-4 shrink-0 text-royal" />
                            <span className="min-w-0 flex-1 truncate">{t}</span>
                            <button type="button" onClick={() => removeSubType(t)} aria-label={`Remove ${t} from ${current}`} className="grid size-6 place-items-center rounded-md text-danger hover:bg-danger-soft">
                              <Trash2 className="size-3.5" />
                            </button>
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {valuesFor(current, t).map((v) => (
                              <ValueChip
                                key={v}
                                value={v}
                                swatch={isColourType(t) ? swatchFor(v) : null}
                                onRename={(to) => renameValue(t, v, to)}
                                onLeft={() => moveValue(t, v, -1)}
                                onRight={() => moveValue(t, v, 1)}
                                onRemove={() => removeValue(t, v)}
                              />
                            ))}
                            <AddValueButton label="Add Value" onAdd={(v) => addValue(t, v)} small />
                          </div>
                        </div>
                      ))}
                      <AddTypeButton
                        label="Add Sub Variant"
                        compact
                        options={uniq([...types.slice(1), ...optionTypes]).filter((o) => !same(o, main) && !subTypes.some((t) => same(t, o)))}
                        onAdd={(n) => addType(n, current)}
                      />
                    </div>

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

/** A value chip: click to edit (rename, move, remove). */
function ValueChip({
  value,
  swatch,
  onRename,
  onLeft,
  onRight,
  onRemove,
}: {
  value: string;
  swatch: string | null;
  onRename: (to: string) => void;
  onLeft: () => void;
  onRight: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white pl-3 text-sm font-medium text-deep">
      {swatch ? <span aria-hidden className="size-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: swatch }} /> : null}
      {value}
      {open ? (
        <span className="flex items-center gap-0.5 pr-1">
          <ValueTools label={value} value={value} onRename={onRename} onLeft={onLeft} onRight={onRight} onRemove={onRemove} />
          <button type="button" onClick={() => setOpen(false)} aria-label="Done" className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Edit ${value}`} className="mr-1 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-deep">
          <Pencil className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Rename / move left / move right / remove buttons for a value. */
function ValueTools({
  label,
  value,
  onRename,
  onLeft,
  onRight,
  onRemove,
}: {
  label: string;
  value: string;
  onRename: (to: string) => void;
  onLeft: () => void;
  onRight: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const to = window.prompt(`Rename "${value}" to:`, value);
          if (to !== null) onRename(to);
        }}
        aria-label={`Rename ${label}`}
        className="grid size-7 place-items-center rounded-md border bg-white text-muted-foreground hover:text-deep"
      >
        <Pencil className="size-3" />
      </button>
      <button type="button" onClick={onLeft} aria-label={`Move ${label} earlier`} className="grid size-7 place-items-center rounded-md border bg-white text-muted-foreground hover:text-deep">
        <ArrowLeft className="size-3" />
      </button>
      <button type="button" onClick={onRight} aria-label={`Move ${label} later`} className="grid size-7 place-items-center rounded-md border bg-white text-muted-foreground hover:text-deep">
        <ArrowRight className="size-3" />
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid size-7 place-items-center rounded-md border bg-white text-danger hover:bg-danger-soft">
        <Trash2 className="size-3" />
      </button>
    </>
  );
}

function TypeRow({
  type,
  isMain,
  canUp,
  canDown,
  error,
  onUp,
  onDown,
  onRename,
  onRemove,
}: {
  type: string;
  isMain: boolean;
  canUp: boolean;
  canDown: boolean;
  error?: string;
  onUp: () => void;
  onDown: () => void;
  onRename: (to: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(type);
  return (
    <li className={cn("flex items-center gap-1.5 rounded-lg border bg-white px-2 py-2", isMain && "border-royal-200 bg-royal-50/60")}>
      <span className="flex flex-col">
        <button type="button" onClick={onUp} disabled={!canUp} aria-label={`Move ${type} up`} className="grid size-4 place-items-center text-muted-foreground disabled:opacity-20">
          <ArrowUp className="size-3" />
        </button>
        <button type="button" onClick={onDown} disabled={!canDown} aria-label={`Move ${type} down`} className="grid size-4 place-items-center text-muted-foreground disabled:opacity-20">
          <ArrowDown className="size-3" />
        </button>
      </span>
      <TypeIcon type={type} main={isMain} className={cn("size-4 shrink-0", isMain ? "text-gold-600" : "text-royal")} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={30}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onRename(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRename(draft);
              setEditing(false);
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-md border px-2 text-base outline-none focus:border-royal sm:text-sm"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-deep">
          {type} {isMain ? <span className="ml-1 rounded bg-gold-50 px-1 text-[0.65rem] font-semibold text-gold-700">Main</span> : null}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(type);
          setEditing(true);
        }}
        aria-label={`Rename ${type}`}
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-deep"
      >
        <Pencil className="size-3.5" />
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${type}`} className="grid size-7 place-items-center rounded-md text-danger hover:bg-danger-soft">
        <Trash2 className="size-3.5" />
      </button>
      {error ? <span className="sr-only">{error}</span> : null}
    </li>
  );
}

function AddTypeButton({ options, onAdd, label = "Add Variant Type", compact = false }: { options: string[]; onAdd: (name: string) => void; label?: string; compact?: boolean }) {
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
          placeholder="Or type a new one (e.g. Battery)"
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

/** "+ Add …" that turns into a small input: Enter adds the value. */
function AddValueButton({ label, onAdd, small = false }: { label: string; onAdd: (value: string) => void; small?: boolean }) {
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const done = () => {
    if (value.trim()) onAdd(value.trim().slice(0, 60));
    setValue("");
    setTyping(false);
  };
  if (typing) {
    return (
      <input
        autoFocus
        value={value}
        maxLength={60}
        placeholder="Type, then Enter"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            done();
          } else if (e.key === "Escape") setTyping(false);
        }}
        onBlur={done}
        className={cn("w-36 rounded-lg border border-royal px-3 text-base outline-none sm:text-sm", small ? "h-9" : "h-10")}
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
}) {
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
              <th className="w-10 px-3 py-2">
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
            {rows.map((r) => (
              <ComboRow
                key={r.key}
                row={r}
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
      <tr className={cn("border-t align-middle", !v.is_active && "bg-muted/40 text-muted-foreground", anyError && "bg-danger-soft/30")}>
        <td className="px-3 py-2">
          <input type="checkbox" aria-label={`Select ${label}`} checked={picked} onChange={(e) => onPick(e.target.checked)} className="accent-royal" />
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
