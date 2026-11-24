import { Bike } from "lucide-react";
import type { BicycleTree, FinderQuery } from "@/features/catalog/bicycles";
import { TypeIcon } from "./bicycle-nav";

const GENDERS = [
  { value: "", label: "Any" },
  { value: "boy", label: "Boy" },
  { value: "girl", label: "Girl" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-border/70 pt-5 first:border-0 first:pt-0">
      <legend className="flex items-center gap-2.5 text-sm font-bold text-deep sm:text-base">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-royal text-xs font-bold text-gold">{n}</span>
        {title}
        {hint ? <span className="text-xs font-medium text-muted-foreground">{hint}</span> : null}
      </legend>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

/** Plain GET form (works without JavaScript); the page reads the answers from the URL. */
export function FinderForm({ tree, value }: { tree: BicycleTree; value: Partial<FinderQuery> }) {
  return (
    <form action="/bicycle-finder" method="get" className="flex flex-col gap-5 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-6">
      <Step n={1} title="Bicycle type" hint="Required">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tree.types.map((t) => (
            <label
              key={t.slug}
              className="flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border bg-white p-3 transition-colors hover:border-royal-200 has-[:checked]:border-royal has-[:checked]:bg-royal-50 has-[:checked]:ring-2 has-[:checked]:ring-royal-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input type="radio" name="type" value={t.slug} required defaultChecked={value.type ? value.type === t.slug : false} className="sr-only" />
              <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-royal-50 text-royal">
                <TypeIcon type={t} className="size-4.5" />
              </span>
              <span className="text-sm leading-tight font-semibold text-deep">{t.name}</span>
            </label>
          ))}
        </div>
      </Step>

      <div className="grid gap-5 sm:grid-cols-2">
        <Step n={2} title="Rider's age" hint="Required">
          <label className="relative block">
            <span className="sr-only">Age in years</span>
            <input
              type="number"
              name="age"
              inputMode="numeric"
              min={1}
              max={99}
              required
              defaultValue={value.age ?? ""}
              placeholder="e.g. 7"
              className="h-12 w-full rounded-xl border border-input bg-white pr-16 pl-4 text-base outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">years</span>
          </label>
        </Step>
        <Step n={3} title="Height" hint="Optional">
          <label className="relative block">
            <span className="sr-only">Height in centimetres</span>
            <input
              type="number"
              name="height"
              inputMode="numeric"
              min={50}
              max={230}
              defaultValue={value.height ?? ""}
              placeholder="e.g. 120"
              className="h-12 w-full rounded-xl border border-input bg-white pr-12 pl-4 text-base outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">cm</span>
          </label>
        </Step>
      </div>

      <Step n={4} title="Gender" hint="Optional">
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <label key={g.value || "any"} className="cursor-pointer rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-deep transition-colors has-[:checked]:border-royal has-[:checked]:bg-royal has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
              <input type="radio" name="gender" value={g.value} defaultChecked={(value.gender ?? "") === g.value} className="sr-only" />
              {g.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Any bicycle that fits the rider is shown — gender never hides a good match.</p>
      </Step>

      <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gold px-6 text-base font-extrabold text-deep shadow-sm transition-colors hover:bg-gold-300 focus-visible:ring-3 focus-visible:ring-royal-200 focus-visible:outline-none">
        <Bike aria-hidden className="size-5" /> Find My Bicycle
      </button>
    </form>
  );
}
