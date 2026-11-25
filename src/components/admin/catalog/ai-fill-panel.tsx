"use client";

import { useState, useTransition } from "react";
import { Bot, Check, ChevronDown, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { aiProductAssistAction } from "@/features/ai/product-assist";
import { cleanFill, smartFill, type ProductFill } from "@/features/catalog/smart-fill";
import { cn } from "@/lib/utils";

type FieldKey = "name" | "category_id" | "brand_id" | "age_range" | "short_description" | "description" | "highlights" | "specifications" | "variants" | "seo" | "extra_categories" | "size_prices" | "variant_types" | "tax";

/**
 * Smart fill (free, runs in the browser, no AI service): paste the product text, review
 * what it found, untick anything wrong, then apply. Nothing is guessed: details that
 * aren't in the text are shown as "Not provided". It never sets stock or SKUs.
 */
export function AiFillPanel({
  categories,
  brands,
  onFill,
  aiEnabled = false,
}: {
  categories: { id: string; name: string; parent_id?: string | null }[];
  brands: { id: string; name: string }[];
  onFill: (data: ProductFill) => string;
  /** Gemini key configured on the server: show "Search with AI". */
  aiEnabled?: boolean;
}) {
  const [aiPending, startAi] = useTransition();
  const [extra, setExtra] = useState<{ sources: { title: string; url: string }[]; conflicts: string[]; notVerified: string[] } | null>(null);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ProductFill | null>(null);
  const [pick, setPick] = useState<Record<FieldKey, boolean>>({} as Record<FieldKey, boolean>);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "";

  function read() {
    const d = smartFill(text, categories, brands);
    setExtra(null);
    review(d);
  }

  /** AI with Google Search; prices and colours still come only from the owner's own text (Smart fill). */
  function searchWithAi() {
    setStatus(null);
    startAi(async () => {
      const res = await aiProductAssistAction({ text, categories: categories.map((c) => c.name), brands: brands.map((b) => b.name) });
      if (!res.ok) {
        setStatus({ kind: "error", text: res.error });
        return;
      }
      const a = res.draft;
      const local = smartFill(text, categories, brands);
      const idOf = (list: { id: string; name: string }[], name: string) => list.find((x) => x.name === name)?.id ?? "";
      const d: ProductFill = {
        name: a.name || local.name,
        category_id: idOf(categories, a.category) || local.category_id,
        brand_id: idOf(brands, a.brand) || local.brand_id,
        age_range: a.age_group || local.age_range,
        short_description: a.short_description || local.short_description,
        description: a.description || local.description,
        highlights: a.key_features.length ? a.key_features : local.highlights,
        specifications: a.specifications.length ? a.specifications : local.specifications,
        variants: local.variants,
        extra_category_ids: [...new Set([...local.extra_category_ids, ...a.extra_categories.map((n) => idOf(categories, n)).filter(Boolean)])],
        size_prices: local.size_prices.length
          ? local.size_prices
          : a.size_prices.map((sp) => ({ category_id: idOf(categories, sp.category), mrp: sp.mrp || sp.price, price: sp.price, stock: sp.stock })).filter((sp) => sp.category_id),
        variant_types: a.variant_types.length ? a.variant_types : local.variant_types,
        gst_rate: a.gst_rate ?? local.gst_rate,
        hsn_code: a.hsn_code || local.hsn_code,
        seo_title: a.seo_title || local.seo_title,
        seo_description: a.seo_description || local.seo_description,
        missing: [...new Set([...a.not_verified, ...local.missing.filter((m) => !a.specifications.some((s) => s.name.toLowerCase() === m.toLowerCase()))])],
      };
      setExtra({ sources: a.sources, conflicts: a.conflicts, notVerified: a.not_verified });
      review(cleanFill(d));
    });
  }

  function review(d: ProductFill) {
    setDraft(d);
    setStatus(null);
    setPick({
      name: Boolean(d.name),
      category_id: Boolean(d.category_id),
      brand_id: Boolean(d.brand_id),
      age_range: Boolean(d.age_range),
      short_description: Boolean(d.short_description),
      description: Boolean(d.description),
      highlights: d.highlights.length > 0,
      specifications: d.specifications.length > 0,
      variants: d.variants.length > 0,
      seo: Boolean(d.seo_title || d.seo_description),
      extra_categories: d.extra_category_ids.length > 0,
      size_prices: d.size_prices.length > 0,
      variant_types: d.variant_types.length > 0,
      tax: d.gst_rate !== null || Boolean(d.hsn_code),
    });
  }

  function apply() {
    if (!draft) return;
    const p = (k: FieldKey) => pick[k];
    const chosen: ProductFill = {
      ...draft,
      name: p("name") ? draft.name : "",
      category_id: p("category_id") ? draft.category_id : "",
      brand_id: p("brand_id") ? draft.brand_id : "",
      age_range: p("age_range") ? draft.age_range : "",
      short_description: p("short_description") ? draft.short_description : "",
      description: p("description") ? draft.description : "",
      highlights: p("highlights") ? draft.highlights : [],
      specifications: p("specifications") ? draft.specifications : [],
      variants: p("variants") ? draft.variants : [],
      seo_title: p("seo") ? draft.seo_title : "",
      seo_description: p("seo") ? draft.seo_description : "",
      extra_category_ids: p("extra_categories") ? draft.extra_category_ids : [],
      size_prices: p("size_prices") ? draft.size_prices : [],
      variant_types: p("variant_types") ? draft.variant_types : [],
      gst_rate: p("tax") ? draft.gst_rate : null,
      hsn_code: p("tax") ? draft.hsn_code : "",
    };
    setStatus({ kind: "ok", text: onFill(chosen) });
    setDraft(null);
  }

  const rows: { key: FieldKey; label: string; value: string }[] = draft
    ? [
        { key: "name", label: "Product name", value: draft.name },
        { key: "category_id", label: "Category", value: nameOf(categories, draft.category_id) },
        { key: "brand_id", label: "Brand", value: nameOf(brands, draft.brand_id) },
        { key: "age_range", label: "Age group", value: draft.age_range },
        { key: "short_description", label: "Short description", value: draft.short_description },
        { key: "description", label: "Description", value: draft.description ? `${draft.description.slice(0, 140)}${draft.description.length > 140 ? "…" : ""}` : "" },
        { key: "highlights", label: "Key features", value: draft.highlights.join(" · ") },
        { key: "specifications", label: "Specifications", value: draft.specifications.map((s) => `${s.name}: ${s.value}`).join(" · ") },
        {
          key: "variants",
          label: "Colours & prices (from your text)",
          value: draft.variants
            .map((v) => [v.colour || v.name, v.price ? `₹${v.price.toLocaleString("en-IN")}` : "", v.mrp ? `MRP ₹${v.mrp.toLocaleString("en-IN")}` : ""].filter(Boolean).join(" "))
            .join(" · "),
        },
        { key: "extra_categories", label: "Also show in categories", value: draft.extra_category_ids.map((id) => nameOf(categories, id)).join(" · ") },
        {
          key: "size_prices",
          label: "Price & stock by size (from your text)",
          value: draft.size_prices
            .map((sp) => [nameOf(categories, sp.category_id).split("|")[0].trim(), `₹${sp.price.toLocaleString("en-IN")}`, sp.mrp > sp.price ? `MRP ₹${sp.mrp.toLocaleString("en-IN")}` : "", sp.stock != null ? `stock ${sp.stock}` : ""].filter(Boolean).join(" "))
            .join(" · "),
        },
        { key: "variant_types", label: "Variant types", value: draft.variant_types.map((vt) => `${vt.name}: ${vt.values.join(", ")}`).join(" · ") },
        { key: "tax", label: "GST / HSN (from your text)", value: [draft.gst_rate !== null ? `GST ${draft.gst_rate}%` : "", draft.hsn_code ? `HSN ${draft.hsn_code}` : ""].filter(Boolean).join(" · ") },
        { key: "seo", label: "Search listing (SEO)", value: draft.seo_title },
      ]
    : [];

  return (
    <section className="overflow-hidden rounded-2xl border border-royal-200 bg-gradient-to-br from-royal-50 to-white shadow-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-royal text-gold">
          <Sparkles aria-hidden className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block font-heading text-base font-semibold text-deep">{aiEnabled ? "Smart fill & AI assistant" : "Smart fill (free)"}</span>
          <span className="block text-sm text-muted-foreground">Paste the product text. Review what it found, then apply. Nothing is guessed or published automatically.</span>
        </span>
        <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
          {!draft ? (
            <>
              <label htmlFor="ai-text" className="sr-only">Product text to read</label>
              <textarea
                id="ai-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                maxLength={12000}
                placeholder={"Paste everything you have about the product: title, features, specifications, colours, prices…\n\nTips: product name on the first line, specs as \"Battery: 12V 7Ah\", features as bullet points, \"Colours: Red, Black\", \"MRP: 28999\" and \"Offer price: 23499\"."}
                className="w-full rounded-xl border border-input bg-white px-4 py-3 text-base leading-relaxed text-deep outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100 sm:text-sm"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={text.trim().length < 10}
                  onClick={read}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-50"
                >
                  <Sparkles aria-hidden className="size-4" /> Read the text
                </button>
                {aiEnabled ? (
                  <button
                    type="button"
                    disabled={text.trim().length < 3 || aiPending}
                    onClick={searchWithAi}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-royal bg-white px-4 text-sm font-semibold text-royal hover:bg-royal-50 disabled:opacity-50"
                  >
                    {aiPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Bot aria-hidden className="size-4" />}
                    {aiPending ? "Searching the web…" : "Search with AI"}
                  </button>
                ) : null}
                <span className="text-xs text-muted-foreground tabular">{text.length.toLocaleString("en-IN")}/12,000</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-deep">Review: untick anything that&apos;s wrong, then apply.</p>
              <ul className="flex flex-col divide-y rounded-xl border bg-white">
                {rows.map((r) => {
                  const found = Boolean(r.value);
                  return (
                    <li key={r.key}>
                      <label className={cn("flex gap-3 px-3 py-2.5 text-sm", found ? "cursor-pointer" : "opacity-70")}>
                        <input
                          type="checkbox"
                          disabled={!found}
                          checked={found && Boolean(pick[r.key])}
                          onChange={(e) => setPick((p) => ({ ...p, [r.key]: e.target.checked }))}
                          className="mt-0.5 size-4 shrink-0 accent-[#4B0082]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-deep">{r.label}</span>
                          <span className={cn("block break-words", found ? "text-muted-foreground" : "text-warning italic")}>{found ? r.value : "Not provided"}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {extra?.conflicts.length ? (
                <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                  <p className="font-semibold">Sources disagree. Check these before saving:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {extra.conflicts.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              ) : null}
              {extra?.sources.length ? (
                <div className="rounded-xl border bg-white px-3 py-2 text-sm">
                  <p className="font-semibold text-deep">Sources the AI used</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {extra.sources.map((src) => (
                      <li key={src.url}>
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-royal hover:underline">
                          <ExternalLink aria-hidden className="size-3.5 shrink-0" /> {src.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : extra ? (
                <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">The AI didn&apos;t show any sources for these details. Treat them as not verified.</p>
              ) : null}
              {draft.missing.length ? (
                <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
                  <span className="font-semibold">{extra ? "Not verified:" : "Not provided in your text:"}</span> {draft.missing.join(", ")}. Add them by hand if you know them; nothing is guessed.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">Stock, SKUs and purchase price are never filled automatically. Prices are only taken from your own text.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={apply} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800">
                  <Check aria-hidden className="size-4" /> Apply selected
                </button>
                <button type="button" onClick={() => setDraft(null)} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold text-deep hover:bg-muted">
                  <X aria-hidden className="size-4" /> Back to text
                </button>
              </div>
            </div>
          )}
          {status ? (
            <p role={status.kind === "ok" ? "status" : "alert"} className={cn("rounded-xl px-4 py-3 text-sm", status.kind === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
              {status.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
