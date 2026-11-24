"use client";

import { parseSocialVideo } from "@/lib/social-video";
import { treeOrder } from "@/features/catalog/category-tree";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, ImageIcon, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { AiFillPanel } from "@/components/admin/catalog/ai-fill-panel";
import { AiWriteButtons } from "@/components/admin/catalog/ai-write-buttons";
import { ImagePoolProvider, SelectImagesButton, TemporaryImageGallery } from "@/components/admin/catalog/image-pool";
import { DeleteButton } from "@/components/admin/catalog/delete-button";
import { ProductImages } from "@/components/admin/catalog/product-images";
import { newVariantRow, nextKey, VariantEditor, type VariantRow } from "@/components/admin/catalog/variant-editor";
import { valuesFromOptions } from "@/features/catalog/variant-types";
import { applySizes, hasSizeType, isSizeType, removeSizes, sizeLabel, type SizeCategory } from "@/features/catalog/size-pricing";
import { FormSection, FormStatus, inputClass, SelectField, SwitchField, TextAreaField, TextField } from "@/components/admin/form/fields";
import { deleteProduct, saveProduct } from "@/features/catalog/admin-actions";
import type { ProductFill } from "@/features/catalog/smart-fill";
import type { AdminProduct } from "@/features/catalog/admin-repo";
import { paiseToRupees, slugify } from "@/features/catalog/schemas";
import { isSupabaseConfigured } from "@/lib/env";
import { randomFileId } from "@/lib/image-optimize";
import { publicStorageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string; parent_id?: string | null };

export function ProductEditor({
  product,
  categories,
  brands,
  canDelete,
  optionTypes = [],
  onDirtyChange,
  aiEnabled = false,
}: {
  product: AdminProduct | null;
  categories: Option[];
  brands: Option[];
  canDelete: boolean;
  /** Reusable variant type names (Size, Colour, …). */
  optionTypes?: string[];
  /** Told whenever the form gains or loses unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Gemini is configured on the server (shows "Search with AI"). */
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(Boolean(product));

  // Medium description: about 3000 characters; longer text saved earlier is kept as it is.
  const mediumMax = Math.max(3000, product?.description?.length ?? 0);
  const [basics, setBasics] = useState({
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    category_id: product?.category_id ?? "",
    extra_category_ids: product?.extra_category_ids ?? [],
    brand_id: product?.brand_id ?? "",
    age_range: product?.age_range ?? "",
    short_description: product?.short_description ?? "",
    description: product?.description ?? "",
    status: product?.status ?? "draft",
    is_featured: product?.is_featured ?? false,
    prepaid_discount_pct: String(product?.prepaid_discount_pct ?? 0),
    cod_discount_pct: String(product?.cod_discount_pct ?? 0),
    seo_title: product?.seo_title ?? "",
    seo_description: product?.seo_description ?? "",
    video_path: product?.video_path ?? null,
    video_link: product?.video_link ?? "",
  });
  const [highlights, setHighlights] = useState<string[]>(product?.highlights.length ? product.highlights : [""]);
  const savedTypes = product
    ? product.variant_types?.length
      ? product.variant_types
      : [product.option1_name, product.option1_name ? product.option2_name : null].filter((t): t is string => Boolean(t))
    : [];
  // An old placeholder level where every variant is "Standard" adds nothing: drop it (saved on next save).
  const placeholderTypes = savedTypes.filter(
    (t) => product?.variants.length && product.variants.every((v) => /^standard$/i.test((valuesFromOptions(savedTypes, v.options)[t] ?? "").trim())),
  );
  const initialTypes = savedTypes.filter((t) => !placeholderTypes.includes(t));
  const [variantTypes, setVariantTypes] = useState<string[]>(initialTypes);
  const [variantsOn, setVariantsOn] = useState(initialTypes.length > 0);
  const [variants, setVariants] = useState<VariantRow[]>(() => {
    if (!product?.variants.length) return [newVariantRow({ is_default: true })];
    return product.variants.map((v) => {
      const values = valuesFromOptions(savedTypes, v.options);
      if (savedTypes[0] && !values[savedTypes[0]] && v.option1) values[savedTypes[0]] = v.option1;
      if (savedTypes[1] && !values[savedTypes[1]] && v.option2) values[savedTypes[1]] = v.option2;
      const autoName = savedTypes.map((t) => values[t]).filter(Boolean).join(" · ");
      for (const t of placeholderTypes) delete values[t];
      return newVariantRow({
        id: v.id,
        sku: v.sku,
        // Names the database built from the values stay "automatic".
        name: v.name === "Default" || v.name === autoName || /^standard$/i.test(v.name) ? "" : v.name,
        colour: v.options?.colour ?? "",
        values,
        specs: (v.specs ?? []).map((sp) => ({ key: nextKey(), ...sp })),
        mrp: paiseToRupees(v.mrp),
        price: paiseToRupees(v.price),
        opening_stock: String(v.on_hand ?? 0),
        category_id: v.category_id ?? "",
        on_hand: v.on_hand,
        is_active: v.is_active,
        is_default: v.is_default,
      });
    });
  });
  const types = variantsOn ? variantTypes : [];
  const [attributes, setAttributes] = useState(
    product?.attributes.length ? product.attributes.map((a) => ({ key: nextKey(), ...a })) : [{ key: nextKey(), name: "", value: "" }],
  );
  const [videoBusy, setVideoBusy] = useState(false);

  // Unsaved changes: warn before leaving the page, and let the "new product" wrapper ask before clearing.
  const snapshot = JSON.stringify({ basics, highlights, variants, attributes, variantTypes, variantsOn });
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);

  const setB = <K extends keyof typeof basics>(k: K, val: (typeof basics)[K]) => setBasics((p) => ({ ...p, [k]: val }));

  // ------------------------------------------------------------ Price/stock by size
  // The main category plus "Also show in" categories are the sizes (24 Inch, 26 Inch, …).
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const sizesFor = (main: string, extras: string[]): SizeCategory[] =>
    [...new Set([main, ...extras].filter(Boolean))].map((id) => ({ id, label: sizeLabel(nameOf(id)) || "Size" }));
  const sizes = sizesFor(basics.category_id, basics.extra_category_ids);
  const sizeOn = variantsOn && hasSizeType(variantTypes);
  const savedDropped = (list: VariantRow[]) => list.filter((r) => r.id).length;

  function setSizeVariation(on: boolean) {
    if (on) {
      const r = applySizes(variants, variantsOn ? variantTypes : [], sizes, (patch) => newVariantRow(patch));
      setVariantTypes(r.types);
      setVariants(r.rows.map((x, i) => (r.rows.some((y) => y.is_default) ? x : { ...x, is_default: i === 0 })));
      setVariantsOn(true);
      return;
    }
    const r = removeSizes(variants, variantTypes, sizes.map((x) => x.id));
    if (savedDropped(r.dropped) && !window.confirm(`Turn off price by size? ${savedDropped(r.dropped)} saved size variant(s) will be hidden from the store when you save.`)) return;
    setVariantTypes(r.types);
    setVariants(r.rows.map((x, i) => (r.rows.some((y) => y.is_default) ? x : { ...x, is_default: i === 0 })));
    if (!r.types.length) setVariantsOn(false);
  }

  /** Category changes keep the size variants in step while price by size is on. */
  function changeCategories(main: string, extras: string[]) {
    if (sizeOn) {
      const next = sizesFor(main, extras);
      const r = applySizes(variants, variantTypes, next, (patch) => newVariantRow(patch));
      if (savedDropped(r.dropped) && !window.confirm(`Remove ${r.dropped.map((x) => x.values[variantTypes.find(isSizeType) ?? "Size"]).filter(Boolean).join(", ")}? Its saved variant(s) will be hidden from the store when you save.`)) return;
      setVariantTypes(r.types);
      setVariants(r.rows.map((x, i) => (r.rows.some((y) => y.is_default) ? x : { ...x, is_default: i === 0 })));
    }
    setBasics((p) => ({ ...p, category_id: main, extra_category_ids: extras }));
  }

  // Every level, in tree order: "Cycles", "— Electric Cycles", "— — Women".
  const categoryOptions = treeOrder(categories.map((c) => ({ ...c, parentId: c.parent_id ?? null }))).map((c) => ({
    value: c.id,
    label: `${"— ".repeat(c.depth)}${c.name}`,
  }));

  function suggestSku(row: VariantRow): string {
    const cat = categories.find((c) => c.id === basics.category_id)?.name ?? "KD";
    const prefix = cat.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
    const part = (t: string) => t.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
    const opts = types.length ? types.map((t) => part(row.values[t] ?? "")) : [part(row.colour)];
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return ["KD", prefix, rand, ...opts].filter(Boolean).join("-").slice(0, 40);
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
        variant_types: types,
        attributes: attributes.map(({ name, value }) => ({ name, value })),
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: types.length ? v.name : v.name || v.colour || "Default",
          colour: v.colour,
          values: types.length ? Object.fromEntries(types.map((t) => [t, v.values[t] ?? ""])) : undefined,
          specs: v.specs.map(({ name, value }) => ({ name, value })),
          mrp: v.mrp,
          price: v.price,
          opening_stock: v.id ? "0" : v.opening_stock || "0",
          category_id: v.category_id,
          // Saved variants: a changed stock count is recorded as an adjustment.
          stock_target: v.id && v.opening_stock !== "" && Number(v.opening_stock) !== (v.on_hand ?? 0) ? Number(v.opening_stock) : undefined,
          is_active: v.is_active,
          is_default: v.is_default,
        })),
      });
      if (r.ok) {
        setErrors({});
        setStatus({ kind: "success", text: product ? (r.message ?? "Product saved.") : "Product created. You can now add images." });
        if (!product) router.push(`/admin/products/${r.data.id}`);
        else router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setStatus({ kind: "error", text: r.error });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  /** Apply Smart fill results. Only non-empty values overwrite; nothing is saved. */
  function applyAi(d: ProductFill): string {
    const filled: string[] = [];
    setBasics((p) => {
      const next = { ...p };
      const put = <K extends keyof typeof p>(k: K, v: (typeof p)[K] | "", label: string) => {
        if (v) {
          next[k] = v as (typeof p)[K];
          filled.push(label);
        }
      };
      put("name", d.name, "name");
      put("category_id", d.category_id, "category");
      put("brand_id", d.brand_id, "brand");
      put("age_range", d.age_range, "age");
      put("short_description", d.short_description.slice(0, 300), "short description");
      put("description", d.description.slice(0, 10000), "description");
      put("seo_title", d.seo_title.slice(0, 70), "SEO title");
      put("seo_description", d.seo_description.slice(0, 170), "SEO description");
      if (d.name && !slugTouched) next.slug = slugify(d.name);
      return next;
    });
    if (d.highlights.length) {
      setHighlights(d.highlights.map((h) => h.slice(0, 120)));
      filled.push(`${d.highlights.length} highlights`);
    }
    if (d.specifications.length) {
      setAttributes(d.specifications.map((a) => ({ key: nextKey(), name: a.name.slice(0, 60), value: a.value.slice(0, 200) })));
      filled.push(`${d.specifications.length} specifications`);
    }
    let variantNote = "";
    // Categories: main from the fill (or the current one) plus any extra size categories.
    const main = d.category_id || basics.category_id;
    const extras = [...new Set([...basics.extra_category_ids, ...d.extra_category_ids])].filter((c) => c && c !== main);
    if (d.extra_category_ids.length) {
      setBasics((p) => ({ ...p, extra_category_ids: extras }));
      filled.push(`${d.extra_category_ids.length} extra categor${d.extra_category_ids.length === 1 ? "y" : "ies"}`);
    }
    const bySize = d.size_prices.length >= 2;
    if (d.variants.length || d.variant_types.length || bySize) {
      if (variants.every((v) => !v.id)) {
        const base = d.size_prices[0] ?? d.variants[0];
        const money = (n: number | undefined) => (n ? String(n) : "");
        let ts: string[] = [];
        let rows: VariantRow[];
        if (d.variant_types.length) {
          // Every combination of the types, e.g. Single Speed • Red, Single Speed • Blue, …
          ts = d.variant_types.map((vt) => vt.name.slice(0, 30));
          const lists = d.variant_types.map((vt) => vt.values.map((v) => v.slice(0, 60)));
          const combos = lists.reduce<string[][]>((acc, list) => acc.flatMap((x) => list.map((v) => [...x, v])), [[]]);
          rows = combos.map((combo, i) => newVariantRow({ is_default: i === 0, values: Object.fromEntries(ts.map((t, j) => [t, combo[j]])), mrp: money(base?.mrp), price: money(base?.price) }));
        } else if (d.variants.length) {
          const colours = d.variants.some((v) => v.colour);
          if (colours) ts = ["Colour"];
          rows = d.variants.map((v, i) =>
            newVariantRow({ is_default: i === 0, name: colours ? "" : v.name.slice(0, 120), colour: v.colour.slice(0, 40), values: colours ? { Colour: v.colour.slice(0, 60) } : {}, mrp: money(v.mrp), price: money(v.price) }),
          );
        } else {
          rows = [newVariantRow({ is_default: true, mrp: money(base?.mrp), price: money(base?.price) })];
        }
        if (bySize) {
          // Price/stock by size: one size per category, with the prices from the text.
          const r = applySizes(rows, ts, sizesFor(main, extras), (patch) => newVariantRow(patch));
          ts = r.types;
          const sizeType = ts[0];
          rows = r.rows.map((row) => {
            const sp = d.size_prices.find((x) => sizeLabel(nameOf(x.category_id)).toLowerCase() === (row.values[sizeType] ?? "").toLowerCase());
            if (!sp) return row;
            const single = r.rows.filter((x) => x.values[sizeType] === row.values[sizeType]).length === 1;
            return { ...row, mrp: money(sp.mrp || sp.price), price: money(sp.price), opening_stock: single && sp.stock != null ? String(sp.stock) : row.opening_stock };
          });
          rows = rows.map((row, i) => ({ ...row, is_default: i === 0 }));
          filled.push(`prices for ${d.size_prices.length} sizes`);
        }
        setVariantTypes(ts);
        setVariantsOn(ts.length > 0);
        setVariants(rows);
        filled.push(`${rows.length} variant${rows.length === 1 ? "" : "s"}`);
      } else {
        variantNote = " Existing variants were kept unchanged.";
      }
    }
    return filled.length
      ? `Filled: ${filled.join(", ")}. Check every field, add SKUs (✨ button) and stock, then save.${variantNote}`
      : "No details were recognised. Put the name on the first line, specs as \"Name: value\" and features as bullet points.";
  }

  // Saved variant id → its label, shown on images in the temporary gallery.
  const variantLabels = useMemo(() => {
    const ts = variantsOn ? variantTypes : [];
    return new Map(variants.filter((v) => v.id).map((v) => [v.id!, (ts.length ? ts.map((t) => v.values[t]).filter(Boolean).join(" • ") : v.colour || v.name) || "Variant"]));
  }, [variants, variantsOn, variantTypes]);

  const videoUrl = publicStorageUrl("product-videos", basics.video_path);
  const linkVideo = parseSocialVideo(basics.video_link);

  const form = (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_20rem]" noValidate>
      <div className="flex min-w-0 flex-col gap-6">
        <ProductHeaderCard
          image={product?.images.find((i) => !i.variant_id)?.url ?? product?.images[0]?.url ?? null}
          name={basics.name || "New product"}
          status={basics.status}
          description={basics.short_description}
          pending={pending}
          saveLabel={product ? "Save Changes" : "Create product"}
        />
        <AiFillPanel categories={categories.map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id ?? null }))} brands={brands} onFill={applyAi} aiEnabled={aiEnabled} />
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
            <SelectField id="p-category" label="Category" required value={basics.category_id} error={errors.category_id} placeholder="Choose a category" options={categoryOptions} onChange={(v) => changeCategories(v, basics.extra_category_ids)} />
            <SelectField id="p-brand" label="Brand" value={basics.brand_id} error={errors.brand_id} placeholder="No brand" options={brands.map((b) => ({ value: b.id, label: b.name }))} onChange={(v) => setB("brand_id", v)} />
          </div>
          <ExtraCategoriesField
            options={categoryOptions}
            names={new Map(categories.map((c) => [c.id, c.name]))}
            mainId={basics.category_id}
            value={basics.extra_category_ids}
            error={errors.extra_category_ids}
            onChange={(v) => changeCategories(basics.category_id, v)}
          />
          {sizes.length >= 2 || sizeOn ? (
            <SizePricing
              on={sizeOn}
              onToggle={setSizeVariation}
              sizes={sizes}
              sizeType={variantTypes.find(isSizeType) ?? "Size"}
              rows={variants}
              onRowsChange={setVariants}
            />
          ) : null}
          <TextField id="p-age" label="Recommended age" placeholder="e.g. 3–8 years" maxLength={40} value={basics.age_range} error={errors.age_range} onChange={(v) => setB("age_range", v)} />
          <TextAreaField id="p-short" label="Short description" rows={2} maxLength={300} hint="Shown near the price and in search results." value={basics.short_description} error={errors.short_description} onChange={(v) => setB("short_description", v)} />
          {aiEnabled ? <AiWriteButtons value={basics.short_description} onChange={(v) => setB("short_description", v.slice(0, 300))} productName={basics.name} only={["improve", "shorten", "malayalam"]} /> : null}
          <TextAreaField
            id="p-desc"
            label="Medium description"
            rows={5}
            maxLength={mediumMax}
            hint="2–4 short paragraphs (about 100–250 words). Shown in the Description section of the product page."
            value={basics.description}
            error={errors.description}
            onChange={(v) => setB("description", v)}
          />
          {aiEnabled ? <AiWriteButtons value={basics.description} onChange={(v) => setB("description", v.slice(0, mediumMax))} productName={basics.name} /> : null}
        </FormSection>

        <FormSection
          title="Temporary Bulk Image Upload"
          description="Upload all photos at once, then open each variant and press “Select Images”. One image can be used by several variants. When done, remove the images you didn't use."
        >
          {product ? (
            <TemporaryImageGallery />
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Save the product first, then upload images.</p>
          )}
        </FormSection>

        <FormSection title="Variants, pricing & SKUs" description="Each variant (or each combination, e.g. Size + Colour) has its own SKU, price, stock, specifications and images.">
          <VariantEditor
            enabled={variantsOn}
            onEnabledChange={(on) => {
              setVariantsOn(on);
              if (!on) {
                // Each combination stays as a simple variant, named after its values.
                setVariants((rows) => rows.map((r) => ({ ...r, colour: r.colour || variantTypes.map((t) => r.values[t]).filter(Boolean).join(" · ") })));
                setVariantTypes([]);
              }
            }}
            types={variantTypes}
            onTypesChange={setVariantTypes}
            rows={variants}
            onRowsChange={setVariants}
            optionTypes={optionTypes}
            errors={errors}
            product={product ? { id: product.id, name: basics.name, images: product.images } : null}
            onSuggestSku={suggestSku}
            categoryOptions={categoryOptions}
          />
        </FormSection>

        <FormSection
          title={types.length ? "Shared images" : "Images"}
          description={types.length ? "Optional. Shown only for variants that have no images of their own. Add images per variant above." : undefined}
        >
          {product ? <SelectImagesButton variantId={null} label="shared images" className="w-fit" /> : null}
          {product ? (
            <ProductImages
              key={product.images.filter((i) => !i.variant_id).map((i) => i.id).join(",")}
              productId={product.id}
              productName={basics.name}
              images={product.images}
            />
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Save the product first, then add images.</p>
          )}
        </FormSection>
        <details className="group rounded-2xl border bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 font-heading text-base font-semibold text-deep">More details (optional): highlights, specifications, video, search listing</summary>
          <div className="flex flex-col gap-6 border-t p-4 sm:p-5">
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
        <FormSection title="Specifications" description="Shown as a table on the product page.">
          {attributes.map((a, i) => (
            <div key={a.key} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <label htmlFor={`a-name-${i}`} className="sr-only">Specification name</label>
              <input id={`a-name-${i}`} value={a.name} placeholder="e.g. Battery" maxLength={60} aria-invalid={Boolean(errors[`attributes.${i}.name`])} onChange={(e) => setAttributes((l) => l.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)))} className={inputClass} />
              <label htmlFor={`a-value-${i}`} className="sr-only">Specification value</label>
              <input id={`a-value-${i}`} value={a.value} placeholder="e.g. 12V 7Ah" maxLength={200} onChange={(e) => setAttributes((l) => l.map((x) => (x.key === a.key ? { ...x, value: e.target.value } : x)))} className={inputClass} />
              <button type="button" aria-label="Remove specification" onClick={() => setAttributes((l) => (l.length > 1 ? l.filter((x) => x.key !== a.key) : [{ key: nextKey(), name: "", value: "" }]))} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setAttributes((l) => [...l, { key: nextKey(), name: "", value: "" }])} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal hover:underline">
            <Plus aria-hidden className="size-4" /> Add specification
          </button>
        </FormSection>
        <FormSection title="Instagram / YouTube video" description="Optional. Paste the reel or video link; it shows in the product photos with its cover image.">
          <TextField
            id="p-video-link"
            label="Video link"
            placeholder="https://www.instagram.com/reel/... or https://youtu.be/..."
            maxLength={300}
            value={basics.video_link}
            error={errors.video_link ?? (basics.video_link && !linkVideo ? "Paste an Instagram reel or YouTube video link." : undefined)}
            onChange={(v) => setB("video_link", v.trim())}
          />
          {linkVideo ? (
            <a href={linkVideo.url} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-3 rounded-xl border p-2 pr-4 text-sm font-medium text-deep hover:bg-muted">
              {linkVideo.kind === "youtube" ? (
                // eslint-disable-next-line @next/next/no-img-element -- YouTube cover preview
                <img src={linkVideo.thumb} alt="" className="h-14 w-20 rounded-lg object-cover" />
              ) : (
                <span className="grid h-14 w-20 place-items-center rounded-lg bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-xs font-bold text-white">Reel</span>
              )}
              {linkVideo.kind === "youtube" ? "YouTube video found" : "Instagram reel found"} · open
            </a>
          ) : null}
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
        </details>
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
        <FormSection title="Payment discounts" description="Taken off this product's price at checkout, by payment method. 0 = no discount.">
          <div className="grid grid-cols-2 gap-3">
            <TextField id="p-prepaid" label="Prepaid Discount (%)" placeholder="e.g. 3" maxLength={5} value={basics.prepaid_discount_pct} error={errors.prepaid_discount_pct} onChange={(v) => setB("prepaid_discount_pct", v.replace(/[^\d.]/g, ""))} />
            <TextField id="p-cod" label="COD Discount (%)" placeholder="0" maxLength={5} value={basics.cod_discount_pct} error={errors.cod_discount_pct} onChange={(v) => setB("cod_discount_pct", v.replace(/[^\d.]/g, ""))} />
          </div>
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
  return product ? (
    <ImagePoolProvider productId={product.id} productName={basics.name} images={product.images} variantLabels={variantLabels}>
      {form}
    </ImagePoolProvider>
  ) : (
    form
  );
}

/** Summary at the top of the editor: photo, name, status and the main actions. */
function ProductHeaderCard({
  image,
  name,
  status,
  description,
  pending,
  saveLabel,
}: {
  image: string | null;
  name: string;
  status: string;
  description: string;
  pending: boolean;
  saveLabel: string;
}) {
  const tone = status === "active" ? "bg-success-soft text-success" : status === "draft" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground";
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-card sm:flex-row sm:items-center">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
          <img src={image} alt="" className="size-full object-contain" />
        ) : (
          <ImageIcon aria-hidden className="size-8 text-royal-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-heading text-lg font-bold text-deep">{name}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tone}`}>{status}</span>
        </div>
        {description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href="/admin/products" className="inline-flex h-11 items-center rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted">
          Cancel
        </Link>
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

/** "Also show in": extra categories for the same product (e.g. 24″, 26″ and 27.5″ of one bicycle model). */
function ExtraCategoriesField({
  options,
  names,
  mainId,
  value,
  error,
  onChange,
}: {
  options: { value: string; label: string }[];
  names: Map<string, string>;
  mainId: string;
  value: string[];
  error?: string;
  onChange: (v: string[]) => void;
}) {
  const shown = value.filter((id) => id !== mainId);
  const left = options.filter((o) => o.value !== mainId && !shown.includes(o.value));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="p-extra-cats" className="text-sm font-medium text-deep">Also show in categories</label>
      <p className="text-xs text-muted-foreground">
        Same product, more than one place — e.g. one bicycle in 24″, 26″ and 27.5″. Add the sizes and colours as variants below.
      </p>
      {shown.length ? (
        <ul className="flex flex-wrap gap-2">
          {shown.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pr-1 pl-3 text-sm">
              {names.get(id) ?? "Unknown category"}
              <button
                type="button"
                onClick={() => onChange(shown.filter((x) => x !== id))}
                className="grid size-6 place-items-center rounded-full hover:bg-muted"
                aria-label={`Remove ${names.get(id) ?? "category"}`}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        id="p-extra-cats"
        value=""
        onChange={(e) => e.target.value && onChange([...shown, e.target.value])}
        className={inputClass}
        disabled={!left.length}
      >
        <option value="">{shown.length ? "+ Add another category" : "+ Add a category"}</option>
        {left.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * "Enable price/stock variation by size": one row per size category with its own MRP,
 * selling price and stock. With other variant types (e.g. Speed Type) a size has several
 * combinations: MRP and price here apply to all of them, stock is set per combination below.
 */
function SizePricing({
  on,
  onToggle,
  sizes,
  sizeType,
  rows,
  onRowsChange,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  sizes: { id: string; label: string }[];
  sizeType: string;
  rows: VariantRow[];
  onRowsChange: (rows: VariantRow[]) => void;
}) {
  const sameLabel = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
  const set = (label: string, p: Partial<VariantRow>) => onRowsChange(rows.map((r) => (sameLabel(r.values[sizeType], label) ? { ...r, ...p } : r)));
  const cell = "h-9 w-full min-w-0 rounded-md border bg-white px-2 text-base outline-none focus:border-royal sm:text-sm";
  return (
    <div className="rounded-xl border border-royal-100 bg-royal-50/40 p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold text-deep">Enable price/stock variation by size</span>
          <span className="block text-xs text-muted-foreground">
            {on ? "Each size has its own MRP, selling price and stock, and shows that price in its category." : "Off: one price and stock for all the chosen size categories."}
          </span>
        </span>
        <input type="checkbox" role="switch" checked={on} onChange={(e) => onToggle(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-royal after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
      </label>
      {on ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Size</th>
                <th className="w-28 px-1 py-1 font-medium">MRP (₹)</th>
                <th className="w-28 px-1 py-1 font-medium">Selling Price (₹)</th>
                <th className="w-24 px-1 py-1 font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => {
                const mine = rows.filter((r) => sameLabel(r.values[sizeType], size.label));
                const first = mine[0];
                return (
                  <tr key={size.id} className="border-t border-royal-100">
                    <td className="py-1.5 pr-2 font-semibold text-deep">{size.label}</td>
                    <td className="px-1 py-1.5">
                      <input inputMode="decimal" aria-label={`MRP for ${size.label}`} value={first?.mrp ?? ""} onChange={(e) => set(size.label, { mrp: e.target.value })} className={cell} />
                    </td>
                    <td className="px-1 py-1.5">
                      <input inputMode="decimal" aria-label={`Selling price for ${size.label}`} value={first?.price ?? ""} onChange={(e) => set(size.label, { price: e.target.value })} className={cell} />
                    </td>
                    <td className="px-1 py-1.5">
                      {mine.length === 1 ? (
                        <input
                          inputMode="numeric"
                          aria-label={`Stock for ${size.label}`}
                          value={first.opening_stock}
                          onChange={(e) => set(size.label, { opening_stock: e.target.value.replace(/[^\d]/g, "") })}
                          className={cell}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{mine.length} combinations, set below</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
