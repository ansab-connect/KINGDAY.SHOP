"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ImagePlus, Layers, ListPlus, Pencil, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { ProductImages } from "@/components/admin/catalog/product-images";
import { inputClass } from "@/components/admin/form/fields";
import type { AdminProductImage } from "@/features/catalog/admin-repo";
import { rupeesToPaise } from "@/features/catalog/schemas";
import { swatchFor } from "@/lib/colours";
import { discountPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SpecRow = { key: string; name: string; value: string };

export type VariantRow = {
  key: string;
  id: string | null;
  /** Rows sharing a group belong to the same main value (e.g. the same size). */
  group: string;
  sku: string;
  name: string;
  colour: string;
  option1: string;
  option2: string;
  specs: SpecRow[];
  mrp: string;
  price: string;
  /** New variants: opening stock. Saved variants: the stock count (changes are recorded as adjustments). */
  opening_stock: string;
  on_hand: number | null;
  is_active: boolean;
  is_default: boolean;
};

export type OptionNames = { option1_name: string; option2_name: string };

let seq = 0;
export const nextKey = () => `vr-${++seq}`;

export function newVariantRow(patch: Partial<VariantRow> = {}): VariantRow {
  const key = nextKey();
  return {
    key,
    id: null,
    group: key,
    sku: "",
    name: "",
    colour: "",
    option1: "",
    option2: "",
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
  names: OptionNames;
  onNamesChange: (n: OptionNames) => void;
  rows: VariantRow[];
  onRowsChange: (rows: VariantRow[]) => void;
  optionTypes: string[];
  errors: Record<string, string>;
  /** Saved product: enables per-variant image galleries. */
  product: ProductInfo;
  onSuggestSku: (row: VariantRow) => string;
};

const isColour = (t: string) => /colou?r/i.test(t);

/**
 * Multi-level variants, laid out as: Main variant (type + value chips) → each value's
 * panel (sub variant type + value chips) → one detail card per combination with its
 * own images, SKU, MRP, price, stock, status and specifications.
 */
export function VariantEditor({ names, onNamesChange, rows, onRowsChange, optionTypes, errors, product, onSuggestSku }: Props) {
  const main = names.option1_name.trim();
  const sub = main ? names.option2_name.trim() : "";
  const mode: "simple" | "single" | "matrix" = !main ? "simple" : sub ? "matrix" : "single";

  // Groups in first-appearance order.
  const groups: { group: string; rows: VariantRow[] }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.group === r.group);
    if (g) g.rows.push(r);
    else groups.push({ group: r.group, rows: [r] });
  }
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.group ?? null);
  const open = groups.find((g) => g.group === openGroup) ?? groups[0];

  const indexOf = (key: string) => rows.findIndex((r) => r.key === key);
  const patch = (key: string, p: Partial<VariantRow>) =>
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...p } : p.is_default ? { ...r, is_default: false } : r)));
  const ensureDefault = (list: VariantRow[]) => (list.length && !list.some((r) => r.is_default) ? [{ ...list[0], is_default: true }, ...list.slice(1)] : list);
  const removeRow = (r: VariantRow) => {
    if (rows.length <= 1) return;
    if (r.id && !window.confirm("Remove this variant? It will be hidden from the store when you save (kept for order history).")) return;
    onRowsChange(ensureDefault(rows.filter((x) => x.key !== r.key)));
  };
  const setGroupValue = (group: string, value: string) => onRowsChange(rows.map((r) => (r.group === group ? { ...r, option1: value } : r)));
  const addToGroup = (group: string) => {
    const g = groups.find((x) => x.group === group);
    const base = g?.rows[g.rows.length - 1];
    const row = newVariantRow({ group, option1: base?.option1 ?? "", mrp: base?.mrp ?? "", price: base?.price ?? "" });
    const at = rows.reduce((last, r, i) => (r.group === group ? i : last), rows.length - 1);
    onRowsChange([...rows.slice(0, at + 1), row, ...rows.slice(at + 1)]);
  };
  const addGroup = (value = "") => {
    const last = rows[rows.length - 1];
    const row = newVariantRow({ option1: value, mrp: last?.mrp ?? "", price: last?.price ?? "", is_default: rows.length === 0 });
    onRowsChange([...rows, row]);
    setOpenGroup(row.group);
  };
  const removeGroup = (group: string) => {
    const g = groups.find((x) => x.group === group);
    if (!g || groups.length <= 1) return;
    if (g.rows.some((r) => r.id) && !window.confirm(`Remove ${main} "${g.rows[0].option1 || "(empty)"}" and its ${g.rows.length} variant(s)? Saved ones are hidden from the store when you save.`)) return;
    onRowsChange(ensureDefault(rows.filter((r) => r.group !== group)));
    if (openGroup === group) setOpenGroup(groups.find((x) => x.group !== group)?.group ?? null);
  };

  const changeNames = (n: OptionNames) => {
    let next = rows;
    // Turning on the main type: reuse colours already typed in.
    if (!names.option1_name.trim() && n.option1_name.trim()) next = next.map((r) => ({ ...r, option1: r.option1 || r.colour }));
    // Turning on the sub type: group existing rows by their main value.
    if (!names.option2_name.trim() && n.option2_name.trim()) {
      const byValue = new Map<string, string>();
      next = next.map((r) => {
        const v = r.option1.trim().toLowerCase();
        if (!v) return r;
        if (!byValue.has(v)) byValue.set(v, r.group);
        return { ...r, group: byValue.get(v)! };
      });
    }
    if (next !== rows) onRowsChange(next);
    onNamesChange(n);
  };

  const cardProps = { patch, removeRow, errors, product, onSuggestSku, indexOf, canRemove: rows.length > 1 };

  return (
    <div className="flex flex-col gap-4">
      {errors.variants ? <p className="text-xs text-danger">{errors.variants}</p> : null}

      <div className="rounded-2xl border bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-royal-50 px-3 py-1.5 text-sm font-semibold text-royal">
            <Layers aria-hidden className="size-4" /> Main Variant
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
          <TypeSelect
            label="Variant Type"
            value={names.option1_name}
            options={optionTypes}
            noneLabel="None (simple variants)"
            error={errors.option1_name}
            onChange={(v) => changeNames({ ...names, option1_name: v })}
          />
          {mode !== "simple" ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-deep">Variant Values</span>
              <div className="flex flex-wrap items-center gap-2">
                {groups.map((g) => (
                  <button
                    key={g.group}
                    type="button"
                    onClick={() => setOpenGroup(g.group)}
                    aria-pressed={open?.group === g.group}
                    className={cn(
                      "inline-flex h-10 min-w-14 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors",
                      open?.group === g.group ? "border-royal bg-royal-50 text-royal" : "text-deep hover:border-royal-200",
                      !g.rows[0].option1 && "italic text-muted-foreground",
                    )}
                  >
                    {g.rows[0].option1 || "New"}
                  </button>
                ))}
                <AddValueButton label="Add Value" onAdd={addGroup} />
              </div>
            </div>
          ) : (
            <p className="self-end text-xs text-muted-foreground">
              Choose a type (e.g. Size, Wheel Size, Voltage) to let customers pick step by step, with a colour list for each value.
            </p>
          )}
        </div>

        {mode === "simple" ? (
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((r, i) => (
              <DetailCard key={r.key} row={r} title={r.colour || r.name || `Variant ${i + 1}`} labelField={{ field: "colour", label: "Colour / name", placeholder: "e.g. Red" }} {...cardProps} />
            ))}
            <li>
              <button type="button" onClick={() => addGroup()} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-royal-200 px-4 text-sm font-semibold text-royal hover:bg-royal-50">
                <Plus aria-hidden className="size-4" /> Add variant
              </button>
            </li>
          </ul>
        ) : (
          <div className="mt-4 flex flex-col gap-3 border-t pt-4">
            {groups.map((g) =>
              g.group === open?.group ? (
                <GroupPanel
                  key={g.group}
                  group={g}
                  main={main}
                  sub={sub}
                  mode={mode}
                  optionTypes={optionTypes}
                  onSubTypeChange={(v) => changeNames({ ...names, option2_name: v })}
                  subError={errors.option2_name}
                  valueError={errors[`variants.${indexOf(g.rows[0].key)}.option1`]}
                  onValueChange={(v) => setGroupValue(g.group, v)}
                  onAddSub={() => addToGroup(g.group)}
                  onRemove={groups.length > 1 ? () => removeGroup(g.group) : undefined}
                  cardProps={cardProps}
                />
              ) : (
                <div key={g.group} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-3 py-2.5">
                  <button type="button" onClick={() => setOpenGroup(g.group)} aria-label={`Open ${g.rows[0].option1 || main}`} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
                    <ChevronRight className="size-4" />
                  </button>
                  <span className="rounded-lg border border-royal-100 bg-royal-50 px-3 py-1 text-sm font-bold text-royal">{g.rows[0].option1 || "New"}</span>
                  {mode === "matrix" ? (
                    <span className="text-xs text-muted-foreground">
                      Sub Variant Type: <span className="font-semibold text-deep">{sub}</span>
                    </span>
                  ) : null}
                  {g.rows.some((r) => g.rows.indexOf(r) >= 0 && errors[`variants.${indexOf(r.key)}.sku`]) ? <span className="text-xs text-danger">Has errors</span> : null}
                  <span className="ml-auto text-xs font-semibold text-deep">
                    {mode === "matrix" ? `${g.rows.length} ${isColour(sub) ? (g.rows.length === 1 ? "Colour" : "Colours") : sub}` : `₹${g.rows[0].price || "—"}`}
                  </span>
                  <button type="button" onClick={() => setOpenGroup(g.group)} aria-label="Edit" className="grid size-8 place-items-center rounded-md border hover:bg-muted">
                    <Pencil className="size-3.5" />
                  </button>
                  {groups.length > 1 ? (
                    <button type="button" onClick={() => removeGroup(g.group)} aria-label={`Remove ${g.rows[0].option1 || main}`} className="grid size-8 place-items-center rounded-md border text-danger hover:bg-danger-soft">
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ),
            )}
            <AddValueButton label={`Add ${main} value`} onAdd={addGroup} wide />
          </div>
        )}
      </div>
    </div>
  );
}

/** Type picker: saved types, "None", or a new name. */
function TypeSelect({
  label,
  value,
  options,
  noneLabel,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  noneLabel: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const known = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  const [custom, setCustom] = useState(Boolean(value.trim()) && !known);
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium text-deep">{label}</span>
      {custom ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={value}
            maxLength={30}
            disabled={disabled}
            placeholder="Type name, e.g. Wheel Size"
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={Boolean(error)}
            className={inputClass}
          />
          <button type="button" onClick={() => setCustom(false)} aria-label="Pick from list" className="grid size-10 shrink-0 place-items-center rounded-lg border hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <select
          value={known ? options.find((o) => o.toLowerCase() === value.trim().toLowerCase()) : ""}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === "__new") {
              setCustom(true);
              onChange("");
            } else onChange(e.target.value);
          }}
          aria-invalid={Boolean(error)}
          className={cn(inputClass, "disabled:opacity-50")}
        >
          <option value="">{noneLabel}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="__new">+ New type…</option>
        </select>
      )}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

/** "+ Add …" that turns into a small input: Enter adds the value. */
function AddValueButton({ label, onAdd, wide = false }: { label: string; onAdd: (value: string) => void; wide?: boolean }) {
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const commit = () => {
    if (value.trim()) onAdd(value.trim().slice(0, 60));
    setValue("");
    setTyping(false);
  };
  if (typing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          maxLength={60}
          placeholder="e.g. 26″"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") setTyping(false);
          }}
          onBlur={commit}
          className="h-10 w-28 rounded-lg border border-royal px-3 text-base outline-none sm:text-sm"
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setTyping(true)}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-lg border border-royal-200 px-3 text-sm font-semibold text-royal hover:bg-royal-50",
        wide && "w-fit px-4",
      )}
    >
      <Plus aria-hidden className="size-4" /> {label}
    </button>
  );
}

type CardProps = {
  patch: (key: string, p: Partial<VariantRow>) => void;
  removeRow: (r: VariantRow) => void;
  errors: Record<string, string>;
  product: ProductInfo;
  onSuggestSku: (row: VariantRow) => string;
  indexOf: (key: string) => number;
  canRemove: boolean;
};

function GroupPanel({
  group: g,
  main,
  sub,
  mode,
  optionTypes,
  onSubTypeChange,
  subError,
  valueError,
  onValueChange,
  onAddSub,
  onRemove,
  cardProps,
}: {
  group: { group: string; rows: VariantRow[] };
  main: string;
  sub: string;
  mode: "single" | "matrix";
  optionTypes: string[];
  onSubTypeChange: (v: string) => void;
  subError?: string;
  valueError?: string;
  onValueChange: (v: string) => void;
  onAddSub: () => void;
  onRemove?: () => void;
  cardProps: CardProps;
}) {
  const value = g.rows[0].option1;
  return (
    <section className="rounded-2xl border border-royal-100 bg-royal-50/40 p-3 sm:p-4" aria-label={`${main} ${value}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex flex-col gap-1">
          <span className="sr-only">{main} value</span>
          <input
            value={value}
            maxLength={60}
            placeholder={`${main} value`}
            onChange={(e) => onValueChange(e.target.value)}
            aria-invalid={Boolean(valueError)}
            className="h-10 w-40 rounded-lg border-2 border-royal-200 bg-white px-3 font-heading text-base font-bold text-royal outline-none focus:border-royal aria-invalid:border-danger"
          />
          {valueError ? <span className="text-xs text-danger">{valueError}</span> : null}
        </label>
        {onRemove ? (
          <button type="button" onClick={onRemove} aria-label={`Remove ${main} ${value}`} className="grid size-9 place-items-center rounded-lg border bg-white text-danger hover:bg-danger-soft">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <TypeSelect label="Sub Variant Type" value={sub} options={optionTypes} noneLabel="None (one variant per value)" error={subError} onChange={onSubTypeChange} />
        {mode === "matrix" ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-deep">Sub Variant Values ({sub})</span>
            <div className="flex flex-wrap items-center gap-2">
              {g.rows.map((r) => {
                const sw = isColour(sub) ? swatchFor(r.option2) : null;
                return (
                  <a
                    key={r.key}
                    href={`#vcard-${r.key}`}
                    className={cn("inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-deep hover:border-royal-200", !r.is_active && "opacity-50")}
                  >
                    {sw ? <span aria-hidden className="size-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: sw }} /> : null}
                    {r.option2 || <span className="italic text-muted-foreground">New</span>}
                  </a>
                );
              })}
              <button type="button" onClick={onAddSub} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-royal-200 bg-white px-3 text-sm font-semibold text-royal hover:bg-royal-50">
                <Plus aria-hidden className="size-4" /> Add {sub}
              </button>
            </div>
          </div>
        ) : (
          <p className="self-end text-xs text-muted-foreground">Optional: choose a sub type (e.g. Colour) to give each {main} its own colour list.</p>
        )}
      </div>

      <p className="mt-5 mb-2 text-sm font-semibold text-deep">{mode === "matrix" ? "Sub Variant Details" : "Details"}</p>
      <ul className="flex flex-col gap-3">
        {g.rows.map((r) => (
          <DetailCard
            key={r.key}
            row={r}
            title={mode === "matrix" ? r.option2 : value}
            labelField={mode === "matrix" ? { field: "option2", label: sub, placeholder: isColour(sub) ? "e.g. Volt Blue" : `${sub} value` } : null}
            dot={mode === "matrix" && isColour(sub)}
            {...cardProps}
          />
        ))}
      </ul>
      {mode === "matrix" ? (
        <button type="button" onClick={onAddSub} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-royal-200 bg-white px-4 text-sm font-semibold text-royal hover:bg-royal-50">
          <Plus aria-hidden className="size-4" /> Add {sub}
        </button>
      ) : null}
    </section>
  );
}

function DetailCard({
  row: v,
  title,
  labelField,
  dot = false,
  patch,
  removeRow,
  errors,
  product,
  onSuggestSku,
  indexOf,
  canRemove,
}: CardProps & {
  row: VariantRow;
  title: string;
  /** Inline name field for the card (colour name, etc.). Null = no field (value edited in the panel). */
  labelField: { field: "option2" | "colour"; label: string; placeholder: string } | null;
  dot?: boolean;
}) {
  const i = indexOf(v.key);
  const err = (f: string) => errors[`variants.${i}.${f}`];
  const [more, setMore] = useState(false);
  const [gallery, setGallery] = useState(false);
  const off = discountPercent(rupeesToPaise(v.mrp) || 0, rupeesToPaise(v.price) || 0);
  const ownImages = product && v.id ? product.images.filter((img) => img.variant_id === v.id).sort((a, b) => a.position - b.position) : [];
  const sw = dot ? swatchFor(v.option2) : null;
  const setSpec = (key: string, p: Partial<SpecRow>) => patch(v.key, { specs: v.specs.map((s) => (s.key === key ? { ...s, ...p } : s)) });
  const hasMoreErrors = Boolean(err("name"));

  return (
    <li id={`vcard-${v.key}`} className={cn("scroll-mt-24 rounded-xl border bg-white p-3", !v.is_active && "opacity-70")}>
      <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr]">
        {/* Images */}
        <div className="flex gap-1.5">
          {product && v.id ? (
            <button
              type="button"
              onClick={() => setGallery((g) => !g)}
              aria-expanded={gallery}
              aria-label={`Images for ${title || "this variant"} (${ownImages.length})`}
              className="group flex w-full gap-1.5"
            >
              <span className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted group-hover:border-royal-200">
                {ownImages[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img src={ownImages[0].url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-[0.65rem] font-medium text-royal">
                    <ImagePlus className="size-5" /> Add images
                  </span>
                )}
              </span>
              <span className="flex flex-col gap-1.5">
                {ownImages.slice(1, 3).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                  <img key={img.id} src={img.url ?? ""} alt="" className="size-[2.6rem] rounded-md border object-cover" />
                ))}
                {ownImages.length > 3 ? (
                  <span className="grid size-[2.6rem] place-items-center rounded-md bg-deep/80 text-xs font-bold text-white">+{ownImages.length - 3}</span>
                ) : null}
              </span>
            </button>
          ) : (
            <span className="grid size-24 place-items-center rounded-lg border border-dashed bg-muted/50 px-2 text-center text-[0.65rem] text-muted-foreground">
              Save the product, then add images
            </span>
          )}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {sw ? <span aria-hidden className="size-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: sw }} /> : null}
            {labelField ? (
              <label className="min-w-0 flex-1">
                <span className="sr-only">{labelField.label}</span>
                <input
                  value={v[labelField.field]}
                  maxLength={labelField.field === "colour" ? 40 : 60}
                  placeholder={labelField.placeholder}
                  onChange={(e) => patch(v.key, { [labelField.field]: e.target.value })}
                  aria-invalid={Boolean(err(labelField.field))}
                  className="h-9 w-full max-w-64 rounded-md border border-transparent px-1.5 font-heading text-sm font-semibold text-deep outline-none hover:border-border focus:border-royal aria-invalid:border-danger"
                />
                {err(labelField.field) ? <span className="block text-xs text-danger">{err(labelField.field)}</span> : null}
              </label>
            ) : (
              <span className="flex-1 font-heading text-sm font-semibold text-deep">{title || "Details"}</span>
            )}
            {v.is_default ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-[0.7rem] font-semibold text-gold-800">
                <Star aria-hidden className="size-3" /> Default
              </span>
            ) : null}
            <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-deep">
              <input type="checkbox" role="switch" checked={v.is_active} onChange={(e) => patch(v.key, { is_active: e.target.checked })} className="peer sr-only" />
              <span aria-hidden className="relative h-5 w-9 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-success after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
              {v.is_active ? "Active" : "Inactive"}
            </label>
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              aria-label="More details: name, specifications, default"
              className={cn("grid size-8 place-items-center rounded-md border hover:bg-muted", (more || hasMoreErrors) && "border-royal text-royal")}
            >
              <Pencil className="size-3.5" />
            </button>
            {canRemove ? (
              <button type="button" onClick={() => removeRow(v)} aria-label={`Remove ${title || "variant"}`} className="grid size-8 place-items-center rounded-md border text-danger hover:bg-danger-soft">
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(10rem,1.5fr)_1fr_1fr_minmax(5rem,0.7fr)]">
            <Field label="SKU" error={err("sku")}>
              <div className="flex gap-1">
                <input value={v.sku} maxLength={40} onChange={(e) => patch(v.key, { sku: e.target.value.toUpperCase() })} aria-invalid={Boolean(err("sku"))} className={cn(inputClass, "min-w-0 font-mono text-xs")} />
                <button type="button" onClick={() => patch(v.key, { sku: onSuggestSku(v) })} title="Generate SKU" aria-label="Generate SKU" className="grid size-10 shrink-0 place-items-center rounded-lg border text-royal hover:bg-royal-50">
                  <Sparkles className="size-4" />
                </button>
              </div>
            </Field>
            <Field label="MRP" error={err("mrp")}>
              <Money value={v.mrp} invalid={Boolean(err("mrp"))} onChange={(mrp) => patch(v.key, { mrp })} />
            </Field>
            <Field label="Selling Price" error={err("price")} hint={off > 0 ? `${off}% off` : undefined}>
              <Money value={v.price} invalid={Boolean(err("price"))} onChange={(price) => patch(v.key, { price })} />
            </Field>
            <Field label={v.id ? "Stock" : "Opening stock"} error={err("opening_stock") || err("stock_target")} hint={v.id && v.on_hand !== null && String(v.on_hand) !== v.opening_stock ? `Was ${v.on_hand}` : undefined}>
              <input
                inputMode="numeric"
                value={v.opening_stock}
                onChange={(e) => patch(v.key, { opening_stock: e.target.value.replace(/[^\d]/g, "") })}
                aria-invalid={Boolean(err("opening_stock") || err("stock_target"))}
                className={inputClass}
              />
            </Field>
          </div>

          {more ? (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Variant name (optional)" error={err("name")} hint="Automatic if empty, e.g. 24″ · Volt Blue. Shown in cart and orders.">
                  <input value={v.name} maxLength={120} placeholder="Automatic" onChange={(e) => patch(v.key, { name: e.target.value })} className={inputClass} />
                </Field>
                <label className="mb-5 inline-flex items-center gap-2 text-sm">
                  <input type="radio" name="default-variant" checked={v.is_default} onChange={() => patch(v.key, { is_default: true })} className="accent-royal" />
                  Default selection
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-deep">
                  <ListPlus aria-hidden className="size-4 text-royal" /> Specifications for this variant
                </span>
                {v.specs.map((s) => (
                  <div key={s.key} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                    <input aria-label="Specification name" value={s.name} maxLength={60} placeholder="e.g. Wheel size" onChange={(e) => setSpec(s.key, { name: e.target.value })} className={inputClass} />
                    <input aria-label="Specification value" value={s.value} maxLength={200} placeholder="e.g. 24 inch" onChange={(e) => setSpec(s.key, { value: e.target.value })} className={inputClass} />
                    <button type="button" aria-label="Remove specification" onClick={() => patch(v.key, { specs: v.specs.filter((x) => x.key !== s.key) })} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => patch(v.key, { specs: [...v.specs, { key: nextKey(), name: "", value: "" }] })} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal hover:underline">
                  <Plus aria-hidden className="size-4" /> Add specification
                </button>
                <p className="text-xs text-muted-foreground">These replace the product&apos;s specification with the same name when this variant is selected.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {gallery && product && v.id ? (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-deep">Images for {title || "this variant"}</p>
            <button type="button" onClick={() => setGallery(false)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-deep">
              <ChevronDown className="size-3.5 rotate-180" /> Close
            </button>
          </div>
          <ProductImages
            key={`${v.id}-${ownImages.map((x) => x.id).join(",")}`}
            productId={product.id}
            productName={`${product.name} ${[v.option1, v.option2].filter(Boolean).join(" ")}`.trim()}
            images={product.images}
            variantId={v.id}
            compact
          />
        </div>
      ) : null}
    </li>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="text-danger">{error}</span> : hint ? <span className="text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Money({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  return (
    <span className="relative block">
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={cn(inputClass, "pl-7")} />
    </span>
  );
}
