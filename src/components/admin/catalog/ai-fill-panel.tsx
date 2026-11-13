"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { smartFill, type ProductFill } from "@/features/catalog/smart-fill";
import { cn } from "@/lib/utils";

/** Paste a bulk description; Smart fill splits it into the editor's fields for review (free, runs in the browser). */
export function AiFillPanel({
  categories,
  brands,
  onFill,
}: {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  onFill: (data: ProductFill) => string;
}) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-royal-200 bg-gradient-to-br from-royal-50 to-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-royal text-gold"><Sparkles aria-hidden className="size-4" /></span>
        <span className="flex-1">
          <span className="block font-heading text-base font-semibold text-deep">Smart fill</span>
          <span className="block text-sm text-muted-foreground">Paste the full product description. Smart fill splits it into every field below for you to check and edit.</span>
        </span>
        <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="flex flex-col gap-3 px-5 pb-5 sm:px-6">
          <label htmlFor="ai-text" className="sr-only">Product description to analyse</label>
          <textarea
            id="ai-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            maxLength={12000}
            placeholder={"Paste everything you have about the product: title, features, specifications, colours, prices…\n\nTips: put the product name on the first line, specs as \"Battery: 12V 7Ah\", features as bullet points, \"Colours: Red, Black\", \"MRP: 28999\" and \"Offer price: 23499\"."}
            className="w-full rounded-xl border border-input bg-white px-4 py-3 text-sm leading-relaxed text-deep outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={text.trim().length < 10}
              onClick={() => setStatus({ kind: "ok", text: onFill(smartFill(text, categories, brands)) })}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-50"
            >
              <Sparkles aria-hidden className="size-4" /> Fill the form
            </button>
            <span className="text-xs text-muted-foreground tabular">{text.length.toLocaleString("en-IN")}/12,000</span>
          </div>
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
