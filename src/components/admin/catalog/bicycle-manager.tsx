"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  assignBicycleProduct,
  reorderBicycleCategories,
  saveBicycleSize,
  saveBicycleType,
  saveProductBicycleFit,
} from "@/features/catalog/bicycle-actions";
import { cn } from "@/lib/utils";

type Audience = "any" | "kids" | "junior" | "men" | "women";
type Size = {
  id: string; name: string; slug: string; active: boolean; productCount: number;
  inch: number; ageMin: number | null; ageMax: number | null; heightMin: number | null; heightMax: number | null; modelBased: boolean;
};
type Type = { id: string; name: string; slug: string; active: boolean; productCount: number; audience: Audience; sizes: Size[] };
type Fit = { ageMin: number | null; ageMax: number | null; heightMin: number | null; heightMax: number | null; note: string };
type Product = { id: string; name: string; status: string; categoryId: string | null; categoryName: string; fit: Fit | null };
export type ManagerData = { root: { id: string; name: string; slug: string }; types: Type[]; products: Product[] };

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "kids", label: "Kids" },
  { value: "junior", label: "Junior" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "any", label: "Everyone" },
];

const inputCls = "h-9 w-full min-w-0 rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-royal-300 focus:ring-2 focus:ring-royal-100";
const str = (v: number | null | undefined) => (v == null ? "" : String(v));

function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? <p role="status" className={cn("text-xs font-medium", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : null;
}

function move<T extends { id: string }>(list: T[], i: number, d: -1 | 1) {
  const ids = list.map((x) => x.id);
  const j = i + d;
  if (j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

// ---------------------------------------------------------------- Wheel size row
function SizeRow({ typeId, size, canUp, canDown, onMove }: { typeId: string; size: Size | null; canUp?: boolean; canDown?: boolean; onMove?: (d: -1 | 1) => void }) {
  const blank = { inch: "", ageMin: "", ageMax: "", heightMin: "", heightMax: "", modelBased: false, active: true };
  const [v, setV] = useState(
    size
      ? { inch: String(size.inch), ageMin: str(size.ageMin), ageMax: str(size.ageMax), heightMin: str(size.heightMin), heightMax: str(size.heightMax), modelBased: size.modelBased, active: size.active }
      : blank,
  );
  const { pending, msg, run } = useSaver();
  const set = (k: keyof typeof v, val: string | boolean) => setV((p) => ({ ...p, [k]: val }));
  const save = () =>
    run(
      () =>
        saveBicycleSize({
          id: size?.id ?? null, type_id: typeId, inch: v.inch, age_min: v.ageMin, age_max: v.ageMax,
          height_min_cm: v.heightMin, height_max_cm: v.heightMax, model_based: v.modelBased, is_active: v.active,
        }),
      size ? undefined : () => setV(blank),
    );
  return (
    <tr className={cn("border-t align-top", !v.active && "opacity-60")}>
      <td className="py-2 pr-2 pl-4">
        <input aria-label="Wheel size (inch)" className={inputCls} inputMode="decimal" value={v.inch} onChange={(e) => set("inch", e.target.value)} placeholder="20" />
        {size ? <p className="mt-1 max-w-48 truncate text-[0.7rem] text-muted-foreground" title={size.name}>{size.name}</p> : <p className="mt-1 text-[0.7rem] text-royal">New size</p>}
      </td>
      <td className="p-2"><input aria-label="Minimum age" className={inputCls} inputMode="numeric" value={v.ageMin} disabled={v.modelBased} onChange={(e) => set("ageMin", e.target.value)} /></td>
      <td className="p-2"><input aria-label="Maximum age (blank = and up)" className={inputCls} inputMode="numeric" value={v.ageMax} disabled={v.modelBased} onChange={(e) => set("ageMax", e.target.value)} placeholder="+" /></td>
      <td className="p-2"><input aria-label="Minimum height cm" className={inputCls} inputMode="numeric" value={v.heightMin} onChange={(e) => set("heightMin", e.target.value)} /></td>
      <td className="p-2"><input aria-label="Maximum height cm" className={inputCls} inputMode="numeric" value={v.heightMax} onChange={(e) => set("heightMax", e.target.value)} /></td>
      <td className="p-2 text-center"><input type="checkbox" aria-label="Model-based age" className="mt-2.5 size-4 accent-royal" checked={v.modelBased} onChange={(e) => set("modelBased", e.target.checked)} /></td>
      <td className="p-2 text-center"><input type="checkbox" aria-label="Active" className="mt-2.5 size-4 accent-royal" checked={v.active} onChange={(e) => set("active", e.target.checked)} /></td>
      <td className="p-2 pt-4 text-right text-xs tabular">{size?.productCount ?? ""}</td>
      <td className="py-2 pr-4 pl-2">
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" onClick={save} disabled={pending || !v.inch}>
            {pending ? <Loader2 className="animate-spin" /> : size ? <Save /> : <Plus />} {size ? "Save" : "Add"}
          </Button>
          {size ? (
            <>
              <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move up" disabled={!canUp} onClick={() => onMove?.(-1)}><ArrowUp /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move down" disabled={!canDown} onClick={() => onMove?.(1)}><ArrowDown /></Button>
            </>
          ) : null}
        </div>
        <Msg msg={msg} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Type card
function TypeCard({ type, index, count, onMoveType }: { type: Type; index: number; count: number; onMoveType: (d: -1 | 1) => void }) {
  const [v, setV] = useState({ name: type.name, audience: type.audience, active: type.active });
  const { pending, msg, run } = useSaver();
  const sizeMover = useSaver();
  return (
    <Card className={cn("py-0 shadow-card", !v.active && "opacity-75")}>
      <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_9rem_auto]">
          <label className="text-xs font-medium text-muted-foreground">Type name
            <input className={cn(inputCls, "mt-1 font-semibold text-deep")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">For
            <select className={cn(inputCls, "mt-1")} value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value as Audience })}>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input type="checkbox" className="size-4 accent-royal" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Active
          </label>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => saveBicycleType({ id: type.id, name: v.name, audience: v.audience, is_active: v.active }))}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save type
          </Button>
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move type up" disabled={index === 0} onClick={() => onMoveType(-1)}><ArrowUp /></Button>
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Move type down" disabled={index === count - 1} onClick={() => onMoveType(1)}><ArrowDown /></Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="flex items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
          <span>/categories/{type.slug} · {type.productCount} products</span>
          <span><Msg msg={msg ?? sizeMover.msg} /></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 pl-4 font-medium">Wheel (inch)</th>
                <th className="p-2 font-medium">Age from</th>
                <th className="p-2 font-medium">Age to</th>
                <th className="p-2 font-medium">Height from (cm)</th>
                <th className="p-2 font-medium">Height to (cm)</th>
                <th className="p-2 text-center font-medium">Model-based</th>
                <th className="p-2 text-center font-medium">Active</th>
                <th className="p-2 text-right font-medium">Products</th>
                <th className="py-2 pr-4 pl-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {type.sizes.map((s, i) => (
                <SizeRow
                  key={`${s.id}-${s.name}-${s.active}`}
                  typeId={type.id}
                  size={s}
                  canUp={i > 0}
                  canDown={i < type.sizes.length - 1}
                  onMove={(d) => {
                    const ids = move(type.sizes, i, d);
                    if (ids) sizeMover.run(() => reorderBicycleCategories(ids));
                  }}
                />
              ))}
              <SizeRow typeId={type.id} size={null} />
            </tbody>
          </table>
        </div>
        <p className="px-4 pt-1 pb-4 text-[0.7rem] text-muted-foreground">
          Leave “Age to” empty for “and up” (e.g. 18+). Tick Model-based for electric bicycles, then set each model&apos;s age below. Unticking Active hides a size without deleting it.
        </p>
      </CardContent>
    </Card>
  );
}

function NewType() {
  const [v, setV] = useState<{ name: string; audience: Audience }>({ name: "", audience: "any" });
  const { pending, msg, run } = useSaver();
  return (
    <Card className="py-0 shadow-card">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-muted-foreground">New bicycle type
          <input className={cn(inputCls, "mt-1")} value={v.name} placeholder="e.g. Gear Bicycles" onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        <label className="text-xs font-medium text-muted-foreground sm:w-36">For
          <select className={cn(inputCls, "mt-1")} value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value as Audience })}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <Button type="button" disabled={pending || v.name.trim().length < 2} onClick={() => run(() => saveBicycleType({ id: null, name: v.name, audience: v.audience, is_active: true }), () => setV({ name: "", audience: "any" }))}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add type
        </Button>
        <Msg msg={msg} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- Products
function ProductRow({ product, options, bicycleIds }: { product: Product; options: { id: string; label: string }[]; bicycleIds: Set<string> }) {
  const [target, setTarget] = useState(product.categoryId && bicycleIds.has(product.categoryId) ? product.categoryId : "");
  const [open, setOpen] = useState(false);
  const [fit, setFit] = useState({ ageMin: str(product.fit?.ageMin), ageMax: str(product.fit?.ageMax), heightMin: str(product.fit?.heightMin), heightMax: str(product.fit?.heightMax), note: product.fit?.note ?? "" });
  const mover = useSaver();
  const fitter = useSaver();
  const inBicycles = Boolean(product.categoryId && bicycleIds.has(product.categoryId));
  return (
    <li className="border-t px-4 py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-deep">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            Now in: {product.categoryName}
            {product.status !== "active" ? ` · ${product.status}` : ""}
            {product.fit ? " · model fit set" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={`Bicycle category for ${product.name}`} className={cn(inputCls, "w-64")} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose type › wheel size…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" disabled={mover.pending || !target || target === product.categoryId} onClick={() => mover.run(() => assignBicycleProduct(product.id, target))}>
            {mover.pending ? <Loader2 className="animate-spin" /> : null} Assign
          </Button>
          {inBicycles ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Model fit</Button>
          ) : null}
        </div>
      </div>
      <Msg msg={mover.msg} />
      {open ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-canvas p-3 sm:grid-cols-6">
          {(["ageMin", "ageMax", "heightMin", "heightMax"] as const).map((k) => (
            <label key={k} className="text-[0.7rem] font-medium text-muted-foreground">
              {{ ageMin: "Age from", ageMax: "Age to", heightMin: "Height from (cm)", heightMax: "Height to (cm)" }[k]}
              <input className={cn(inputCls, "mt-1")} inputMode="numeric" value={fit[k]} onChange={(e) => setFit({ ...fit, [k]: e.target.value })} />
            </label>
          ))}
          <label className="text-[0.7rem] font-medium text-muted-foreground sm:col-span-2">Note (optional)
            <input className={cn(inputCls, "mt-1")} maxLength={120} value={fit.note} placeholder="e.g. Throttle model, 14+ only" onChange={(e) => setFit({ ...fit, note: e.target.value })} />
          </label>
          <div className="flex items-center gap-2 sm:col-span-6">
            <Button type="button" size="sm" disabled={fitter.pending} onClick={() => fitter.run(() => saveProductBicycleFit({ product_id: product.id, age_min: fit.ageMin, age_max: fit.ageMax, height_min_cm: fit.heightMin, height_max_cm: fit.heightMax, note: fit.note }))}>
              {fitter.pending ? <Loader2 className="animate-spin" /> : <Save />} Save model fit
            </Button>
            <span className="text-[0.7rem] text-muted-foreground">Overrides the wheel size&apos;s range for this model. Clear all fields to go back to it.</span>
            <Msg msg={fitter.msg} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Products({ data }: { data: ManagerData }) {
  const [q, setQ] = useState("");
  const [onlyBikes, setOnlyBikes] = useState(true);
  const { options, bicycleIds } = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (const t of data.types) {
      opts.push({ id: t.id, label: `${t.name} (no size yet)` });
      for (const s of t.sizes) opts.push({ id: s.id, label: `${t.name} › ${s.name}${s.active ? "" : " (hidden)"}` });
    }
    return { options: opts, bicycleIds: new Set([data.root.id, ...opts.map((o) => o.id)]) };
  }, [data]);
  const list = data.products.filter(
    (p) => (!onlyBikes || (p.categoryId && bicycleIds.has(p.categoryId))) && p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Card className="py-0 shadow-card">
      <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Assign products</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Search products" className={cn(inputCls, "w-56")} placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-royal" checked={onlyBikes} onChange={(e) => setOnlyBikes(e.target.checked)} /> Only bicycles
          </label>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <p className="px-4 pt-3 text-xs text-muted-foreground">Each product sits in one category, so moving it never duplicates it. Untick “Only bicycles” to bring in other products.</p>
        {list.length ? (
          <ul className="mt-2">
            {list.map((p) => <ProductRow key={`${p.id}-${p.categoryId}`} product={p} options={options} bicycleIds={bicycleIds} />)}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No products here yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function BicycleManager({ data }: { data: ManagerData }) {
  const typeMover = useSaver();
  return (
    <div className="flex flex-col gap-6">
      <Msg msg={typeMover.msg} />
      {data.types.map((t, i) => (
        <TypeCard
          key={`${t.id}-${t.name}-${t.active}`}
          type={t}
          index={i}
          count={data.types.length}
          onMoveType={(d) => {
            const ids = move(data.types, i, d);
            if (ids) typeMover.run(() => reorderBicycleCategories(ids));
          }}
        />
      ))}
      <NewType />
      <Products data={data} />
    </div>
  );
}
