"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Film, Loader2, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { DeleteButton } from "@/components/admin/catalog/delete-button";
import { ProductImages } from "@/components/admin/catalog/product-images";
import { FormSection, FormStatus, inputClass, SelectField, SwitchField, TextAreaField, TextField } from "@/components/admin/form/fields";
import { deleteProduct, saveProduct } from "@/features/catalog/admin-actions";
import type { AdminProduct } from "@/features/catalog/admin-repo";
import { paiseToRupees, rupeesToPaise, slugify } from "@/features/catalog/schemas";
import { isSupabaseConfigured } from "@/lib/env";
import { discountPercent } from "@/lib/format";
import { randomFileId } from "@/lib/image-optimize";
import { publicStorageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type VariantRow = {
  key: string;
  id: string | null;
  sku: string;
  name: string;
  colour: string;
  mrp: string;
  price: string;
  opening_stock: string;
  on_hand: number | null;
  is_active: boolean;
  is_default: boolean;
};

type Option = { id: string; name: string; parent_id?: string | null };

let keySeq = 0;
const nextKey = () => `row-${++keySeq}`;

function newVariant(isDefault = false): VariantRow {
  return { key: nextKey(), id: null, sku: "", name: "", colour: "", mrp: "", price: "", opening_stock: "0", on_hand: null, is_active: true, is_default: isDefault };
}

export function ProductEditor({
  product,
  categories,
  brands,
  canDelete,
}: {
  product: AdminProduct | null;
  categories: Option[];
  brands: Option[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(Boolean(product));

  const [basics, setBasics] = useState({
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    category_id: product?.category_id ?? "",
    brand_id: product?.brand_id ?? "",
    age_range: product?.age_range ?? "",
    short_description: product?.short_description ?? "",
    description: product?.description ?? "",
    status: product?.status ?? "draft",
    is_featured: product?.is_featured ?? false,
    seo_title: product?.seo_title ?? "",
    seo_description: product?.seo_description ?? "",
    video_path: product?.video_path ?? null,
  });
  const [highlights, setHighlights] = useState<string[]>(product?.highlights.length ? product.highlights : [""]);
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.length
      ? product.variants.map((v) => ({
          key: nextKey(),
          id: v.id,
          sku: v.sku,
          name: v.name === "Default" ? "" : v.name,
          colour: v.options?.colour ?? "",
          mrp: paiseToRupees(v.mrp),
          price: paiseToRupees(v.price),
          opening_stock: "0",
          on_hand: v.on_hand,
          is_active: v.is_active,
          is_default: v.is_default,
        }))
      : [newVariant(true)],
  );
  const [attributes, setAttributes] = useState(
    product?.attributes.length ? product.attributes.map((a) => ({ key: nextKey(), ...a })) : [{ key: nextKey(), name: "", value: "" }],
  );
  const [videoBusy, setVideoBusy] = useState(false);

  const setB = <K extends keyof typeof basics>(k: K, val: (typeof basics)[K]) => setBasics((p) => ({ ...p, [k]: val }));
  const setVariant = (key: string, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : patch.is_default ? { ...r, is_default: false } : r)));

  const categoryOptions = categories
    .filter((c) => !c.parent_id)
    .flatMap((p) => [
      { value: p.id, label: p.name },
      ...categories.filter((c) => c.parent_id === p.id).map((c) => ({ value: c.id, label: `— ${c.name}` })),
    ]);

  function suggestSku(row: VariantRow) {
    const cat = categories.find((c) => c.id === basics.category_id)?.name ?? "KD";
    const prefix = cat.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
    const colour = row.colour.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    setVariant(row.key, { sku: ["KD", prefix, rand, colour].filter(Boolean).join("-") });
  }

  async function uploadVideo(file: File) {
    if (!product) return;
    if (!["video/mp4", "video/webm"].includes(file.type)) return setStatus({ kind: "error", text: "Use an MP4 or WebM video." });
    if (file.size > 50 * 1024 * 1024) return setStatus({ kind: "error", text: "Video must be 50 MB or smaller." });
    setVideoBusy(true);
    const path = `products/${product.id}/${randomFileId()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
    const { error } = await createClient().storage.from("product-videos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    setVideoBusy(false);
    if (error) return setStatus({ kind: "error", text: "Video upload failed." });
    setB("video_path", path);
    setStatus({ kind: "success", text: "Video uploaded. Save the product to publish it." });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveProduct({
        ...basics,
        id: product?.id ?? null,
        video_path: basics.video_path ?? "",
        highlights,
        attributes: attributes.map(({ name, value }) => ({ name, value })),
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name || v.colour || "Default",
          colour: v.colour,
          mrp: v.mrp,
          price: v.price,
          opening_stock: v.opening_stock || "0",
          is_active: v.is_active,
          is_default: v.is_default,
        })),
      });
      if (r.ok) {
        setErrors({});
        setStatus({ kind: "success", text: product ? "Product saved." : "Product created. You can now add images." });
        if (!product) router.push(`/admin/products/${r.data.id}`);
        else router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setStatus({ kind: "error", text: r.error });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  const videoUrl = publicStorageUrl("product-videos", basics.video_path);

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_20rem]" noValidate>
      <div className="flex min-w-0 flex-col gap-6">
        <FormStatus status={status} />

        <FormSection title="Basics">
          <TextField
            id="p-name"
            label="Product name"
            required
            maxLength={160}
            value={basics.name}
            error={errors.name}
            onChange={(name) => setBasics((p) => ({ ...p, name, slug: slugTouched ? p.slug : slugify(name) }))}
          />
          <TextField
            id="p-slug"
            label="URL slug"
            value={basics.slug}
            error={errors.slug}
            hint={`www.kingday.in/products/${basics.slug || "…"}`}
            onChange={(slug) => {
              setSlugTouched(true);
              setB("slug", slug);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField id="p-category" label="Category" required value={basics.category_id} error={errors.category_id} placeholder="Choose a category" options={categoryOptions} onChange={(v) => setB("category_id", v)} />
            <SelectField id="p-brand" label="Brand" value={basics.brand_id} error={errors.brand_id} placeholder="No brand" options={brands.map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => setB("brand_id", v)} />
          </div>
          <TextField id="p-age" label="Recommended age" placeholder="e.g. 3–8 years" maxLength={40} value={basics.age_range} error={errors.age_range} onChange={(v) => setB("age_range", v)} />
          <TextAreaField id="p-short" label="Short description" rows={2} maxLength={300} hint="Shown near the price and in search results." value={basics.short_description} error={errors.short_description} onChange={(v) => setB("short_description", v)} />
          <TextAreaField id="p-desc" label="Full description" rows={8} maxLength={10000} value={basics.description} error={errors.description} onChange={(v) => setB("description", v)} />
        </FormSection>

        <FormSection title="Highlights" description="Short selling points shown as a checklist.">
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-2">
              <label htmlFor={`p-hl-${i}`} className="sr-only">Highlight {i + 1}</label>
              <input id={`p-hl-${i}`} value={h} maxLength={120} placeholder="e.g. Parental remote control" onChange={(e) => setHighlights((list) => list.map((x, j) => (j === i ? e.target.value : x)))} className={inputClass} />
              <button type="button" aria-label="Remove highlight" onClick={() => setHighlights((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [""]))} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
          ))}
          {highlights.length < 12 ? (
            <button type="button" onClick={() => setHighlights((l) => [...l, ""])} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal hover:underline">
              <Plus aria-hidden className="size-4" /> Add highlight
            </button>
          ) : null}
          {errors.highlights ? <p className="text-xs text-danger">{errors.highlights}</p> : null}
        </FormSection>

        <FormSection
          title="Variants, pricing & SKUs"
          description="Every colour or model is a variant with its own SKU, price and stock."
          aside={
            <button type="button" onClick={() => setVariants((v) => [...v, newVariant(false)])} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-deep hover:bg-muted">
              <Plus aria-hidden className="size-4" /> Add variant
            </button>
          }
        >
          {errors.variants ? <p className="text-xs text-danger">{errors.variants}</p> : null}
          <ul className="flex flex-col gap-4">
            {variants.map((v, i) => {
              const err = (f: string) => errors[`variants.${i}.${f}`];
              const off = discountPercent(rupeesToPaise(v.mrp) || 0, rupeesToPaise(v.price) || 0);
              return (
                <li key={v.key} className={cn("rounded-xl border p-4", !v.is_active && "bg-muted/50 opacity-80")}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-heading text-sm font-semibold text-deep">
                      Variant {i + 1}
                      {!v.is_active ? <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span> : null}
                    </p>
                    <div className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" name="default-variant" checked={v.is_default} onChange={() => setVariant(v.key, { is_default: true })} className="accent-royal" />
                        Default
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={v.is_active} onChange={(e) => setVariant(v.key, { is_active: e.target.checked })} className="accent-royal" />
                        Active
                      </label>
                      {!v.id && variants.length > 1 ? (
                        <button type="button" aria-label={`Remove variant ${i + 1}`} onClick={() => setVariants((rows) => rows.filter((r) => r.key !== v.key))} className="grid size-8 place-items-center rounded-md text-danger hover:bg-danger-soft">
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <TextField id={`v-name-${v.key}`} label="Variant name" placeholder="e.g. Red / 12V" maxLength={120} value={v.name} error={err("name")} onChange={(val) => setVariant(v.key, { name: val })} />
                    <TextField id={`v-colour-${v.key}`} label="Colour" placeholder="e.g. Red" maxLength={40} value={v.colour} error={err("colour")} onChange={(val) => setVariant(v.key, { colour: val })} />
                    <div className="sm:col-span-2">
                      <div className="flex items-end gap-2">
                        <TextField id={`v-sku-${v.key}`} label="SKU" required className="flex-1" maxLength={40} value={v.sku} error={err("sku")} onChange={(val) => setVariant(v.key, { sku: val.toUpperCase() })} />
                        <button type="button" onClick={() => suggestSku(v)} title="Generate SKU" aria-label="Generate SKU" className={cn("grid size-10 shrink-0 place-items-center rounded-lg border text-royal hover:bg-royal-50", err("sku") && "mb-5")}>
                          <Sparkles className="size-4" />
                        </button>
                      </div>
                    </div>
                    <TextField id={`v-mrp-${v.key}`} label="MRP" required prefix="₹" inputMode="decimal" value={v.mrp} error={err("mrp")} onChange={(val) => setVariant(v.key, { mrp: val })} />
                    <TextField id={`v-price-${v.key}`} label="Selling price" required prefix="₹" inputMode="decimal" value={v.price} error={err("price")} hint={off > 0 ? `${off}% off MRP` : undefined} onChange={(val) => setVariant(v.key, { price: val })} />
                    {v.id ? (
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-sm font-medium text-deep">Stock on hand</span>
                        <p className="flex h-10 items-center gap-2 text-sm">
                          <span className="font-semibold tabular">{v.on_hand ?? 0}</span>
                          <Link href="/admin/inventory" className="inline-flex items-center gap-1 text-royal hover:underline">
                            <Boxes aria-hidden className="size-4" /> Adjust in Inventory
                          </Link>
                        </p>
                      </div>
                    ) : (
                      <TextField id={`v-stock-${v.key}`} label="Opening stock" inputMode="numeric" value={v.opening_stock} error={err("opening_stock")} hint="Recorded in the stock ledger." onChange={(val) => setVariant(v.key, { opening_stock: val })} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </FormSection>

        <FormSection title="Specifications" description="Shown as a table on the product page.">
          {attributes.map((a, i) => (
            <div key={a.key} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <label htmlFor={`a-name-${a.key}`} className="sr-only">Specification name</label>
              <input id={`a-name-${a.key}`} value={a.name} placeholder="e.g. Battery" maxLength={60} aria-invalid={Boolean(errors[`attributes.${i}.name`])} onChange={(e) => setAttributes((l) => l.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)))} className={inputClass} />
              <label htmlFor={`a-value-${a.key}`} className="sr-only">Specification value</label>
              <input id={`a-value-${a.key}`} value={a.value} placeholder="e.g. 12V 7Ah" maxLength={200} onChange={(e) => setAttributes((l) => l.map((x) => (x.key === a.key ? { ...x, value: e.target.value } : x)))} className={inputClass} />
              <button type="button" aria-label="Remove specification" onClick={() => setAttributes((l) => (l.length > 1 ? l.filter((x) => x.key !== a.key) : [{ key: nextKey(), name: "", value: "" }]))} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setAttributes((l) => [...l, { key: nextKey(), name: "", value: "" }])} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal hover:underline">
            <Plus aria-hidden className="size-4" /> Add specification
          </button>
        </FormSection>

        <FormSection title="Images">
          {product ? (
            <ProductImages productId={product.id} productName={basics.name} images={product.images} />
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Save the product first, then add images.</p>
          )}
        </FormSection>

        <FormSection title="Product video" description="Optional. MP4 or WebM, up to 50 MB.">
          {product ? (
            <div className="flex flex-col gap-3">
              {videoUrl ? <video src={videoUrl} controls preload="metadata" className="aspect-video w-full max-w-md rounded-xl bg-deep" /> : null}
              <div className="flex flex-wrap gap-2">
                <input id="p-video" type="file" accept="video/mp4,video/webm" className="sr-only" disabled={videoBusy || !isSupabaseConfigured} onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
                <label htmlFor="p-video" aria-disabled={videoBusy || !isSupabaseConfigured} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium text-deep hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50">
                  {videoBusy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Film aria-hidden className="size-4" />}
                  {basics.video_path ? "Replace video" : "Upload video"}
                </label>
                {basics.video_path ? (
                  <button type="button" onClick={() => setB("video_path", null)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-danger hover:bg-danger-soft">
                    <Trash2 aria-hidden className="size-4" /> Remove
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Save the product first, then add a video.</p>
          )}
        </FormSection>

        <FormSection title="Search engine listing" description="Optional. Defaults to the product name and short description.">
          <TextField id="p-seo-title" label="SEO title" maxLength={70} value={basics.seo_title} error={errors.seo_title} onChange={(v) => setB("seo_title", v)} />
          <TextAreaField id="p-seo-desc" label="SEO description" rows={2} maxLength={170} value={basics.seo_description} error={errors.seo_description} onChange={(v) => setB("seo_description", v)} />
        </FormSection>
      </div>

      <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
        <FormSection title="Status">
          <SelectField
            id="p-status"
            label="Visibility"
            value={basics.status}
            error={errors.status}
            options={[
              { value: "draft", label: "Draft (hidden)" },
              { value: "active", label: "Active (visible in store)" },
              { value: "archived", label: "Archived" },
            ]}
            onChange={(v) => setB("status", v as typeof basics.status)}
          />
          <SwitchField id="p-featured" label="Featured" description="Show on the homepage." checked={basics.is_featured} onChange={(v) => setB("is_featured", v)} />
        </FormSection>
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            {product ? "Save changes" : "Create product"}
          </button>
          <Link href="/admin/products" className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-medium text-deep hover:bg-muted">Cancel</Link>
        </div>
        {product?.status === "active" ? (
          <Link href={`/products/${product.slug}`} target="_blank" className="text-center text-sm font-medium text-royal hover:underline">View in store ↗</Link>
        ) : null}
        {product && canDelete ? <DeleteButton label="product" redirectTo="/admin/products" onDelete={() => deleteProduct(product.id)} /> : null}
      </aside>
    </form>
  );
}
