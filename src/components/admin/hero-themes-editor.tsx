"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { SingleImageUpload } from "@/components/admin/form/single-image-upload";
import { HeroStage } from "@/components/store/hero/hero-stage";
import { saveHeroThemesAction } from "@/features/marketing/hero-theme-actions";
import {
  COSTUMES,
  EFFECTS,
  KINDS,
  resolveHeroTheme,
  SCENES,
  todayInIndia,
  type HeroTheme,
  type HeroThemesValue,
} from "@/features/marketing/hero-theme-config";
import { publicStorageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

const inputCls = "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";
const KIND_LABEL = { default: "Default (all season)", season: "Season", festival: "Festival / campaign" } as const;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "theme";

/** Seasonal hero themes: dates, colours, effects, costumes and up to 4 scenes each, with a live preview. */
export function HeroThemesEditor({ initial }: { initial: HeroThemesValue }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const live = resolveHeroTheme(value, todayInIndia());

  const set = (id: string, patch: Partial<HeroTheme>) => setValue((v) => ({ ...v, themes: v.themes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const add = () => {
    let id = "campaign";
    for (let n = 2; value.themes.some((t) => t.id === id); n++) id = `campaign-${n}`;
    const today = todayInIndia();
    const theme: HeroTheme = { id, name: "New campaign", kind: "festival", enabled: false, starts_on: today, ends_on: today, yearly: false, sky: ["#1a0f2e", "#4b0082"], accent: "#d4af37", effect: "sparkles", costume: "none", scenes: [{ preset: "castle", image_path: null }, { preset: "park", image_path: null }, { preset: "road", image_path: null }] };
    setValue((v) => ({ ...v, themes: [...v.themes, theme] }));
    setOpen(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-royal-50 px-4 py-3 text-sm text-royal-800">
        Showing today: <strong>{live.name}</strong>. Festivals win over seasons, and seasons win over the default. When a campaign ends, the default comes back by itself.
      </p>

      {value.themes.map((t) => {
        const expanded = open === t.id;
        return (
          <div key={t.id} className={cn("rounded-xl border", t.id === live.id && "border-gold")}>
            <div className="flex flex-wrap items-center gap-3 p-3">
              <span aria-hidden className="size-9 shrink-0 rounded-lg ring-1 ring-black/10" style={{ background: `linear-gradient(135deg, ${t.sky[0]}, ${t.sky[1]})` }} />
              <button type="button" onClick={() => setOpen(expanded ? null : t.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold text-deep">{t.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {KIND_LABEL[t.kind]}
                  {t.kind !== "default" ? ` · ${t.starts_on ?? "?"} → ${t.ends_on ?? "?"}${t.yearly ? " (every year)" : ""}` : value.default_id === t.id ? " · Default" : ""}
                  {t.id === live.id ? " · Live today" : ""}
                </span>
              </button>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={t.enabled} onChange={(e) => set(t.id, { enabled: e.target.checked })} className="size-4 accent-royal" /> Active
              </label>
              <button type="button" onClick={() => setPreview(preview === t.id ? null : t.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-royal hover:bg-royal-50">
                <Eye aria-hidden className="size-4" /> Preview
              </button>
            </div>

            {preview === t.id ? (
              <div className="px-3 pb-3">
                <HeroStage theme={{ ...t, sceneUrls: t.scenes.map((s) => publicStorageUrl("category-images", s.image_path)) }} characters={[]} className="h-64 w-full max-w-xl rounded-2xl bg-deep sm:h-80" />
              </div>
            ) : null}

            {expanded ? (
              <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-deep">Name</span>
                  <input value={t.name} maxLength={40} onChange={(e) => set(t.id, { name: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-deep">Type</span>
                  <select value={t.kind} onChange={(e) => set(t.id, { kind: e.target.value as HeroTheme["kind"] })} className={inputCls}>
                    {KINDS.map((k) => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </select>
                </label>
                {t.kind === "default" ? (
                  <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="radio" name="default-theme" checked={value.default_id === t.id} onChange={() => setValue((v) => ({ ...v, default_id: t.id }))} className="accent-royal" />
                    Use as the default theme
                  </label>
                ) : (
                  <>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-deep">Start date</span>
                      <input type="date" value={t.starts_on ?? ""} onChange={(e) => set(t.id, { starts_on: e.target.value || null })} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-deep">End date</span>
                      <input type="date" value={t.ends_on ?? ""} onChange={(e) => set(t.id, { ends_on: e.target.value || null })} className={inputCls} />
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" checked={t.yearly} onChange={(e) => set(t.id, { yearly: e.target.checked })} className="size-4 accent-royal" />
                      Repeat every year on these dates (turn off for festivals whose date changes, like Onam)
                    </label>
                  </>
                )}
                <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
                  {(["Sky top", "Sky bottom", "Accent / lighting"] as const).map((label, i) => (
                    <label key={label} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={i < 2 ? t.sky[i] : t.accent}
                        onChange={(e) => set(t.id, i === 0 ? { sky: [e.target.value, t.sky[1]] } : i === 1 ? { sky: [t.sky[0], e.target.value] } : { accent: e.target.value })}
                        className="h-9 w-12 rounded border"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-deep">Decoration effect</span>
                  <select value={t.effect} onChange={(e) => set(t.id, { effect: e.target.value as HeroTheme["effect"] })} className={inputCls}>
                    {EFFECTS.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-deep">Character costume</span>
                  <select value={t.costume} onChange={(e) => set(t.id, { costume: e.target.value as HeroTheme["costume"] })} className={inputCls}>
                    {COSTUMES.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </label>

                <div className="sm:col-span-2">
                  <p className="mb-2 text-sm font-medium text-deep">Scenes (3–4, change every 3.5 seconds)</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {t.scenes.map((s, i) => (
                      <div key={i} className="flex gap-3 rounded-lg border p-3">
                        <SingleImageUpload
                          id={`hero-${t.id}-${i}`}
                          label="Banner image (optional)"
                          bucket="category-images"
                          folder="hero"
                          value={s.image_path}
                          maxEdge={1400}
                          onChange={(image_path) => set(t.id, { scenes: t.scenes.map((x, j) => (j === i ? { ...x, image_path } : x)) })}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <label className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">Drawn scene (used when there is no image, or it fails to load)</span>
                            <select value={s.preset} onChange={(e) => set(t.id, { scenes: t.scenes.map((x, j) => (j === i ? { ...x, preset: e.target.value as typeof s.preset } : x)) })} className={inputCls}>
                              {SCENES.map((x) => (
                                <option key={x} value={x}>{x}</option>
                              ))}
                            </select>
                          </label>
                          <button type="button" disabled={t.scenes.length <= 1} onClick={() => set(t.id, { scenes: t.scenes.filter((_, j) => j !== i) })} className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-danger disabled:opacity-40">
                            <Trash2 aria-hidden className="size-3.5" /> Remove scene
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {t.scenes.length < 4 ? (
                    <button type="button" onClick={() => set(t.id, { scenes: [...t.scenes, { preset: "park", image_path: null }] })} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline">
                      <Plus aria-hidden className="size-4" /> Add scene
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={value.themes.length <= 1 || value.default_id === t.id}
                  onClick={() => window.confirm(`Delete the theme "${t.name}"?`) && setValue((v) => ({ ...v, themes: v.themes.filter((x) => x.id !== t.id) }))}
                  className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-danger disabled:opacity-40"
                >
                  <Trash2 aria-hidden className="size-4" /> Delete theme
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={value.themes.length >= 30} className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50">
          <Plus aria-hidden className="size-4" /> Add theme
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              // New themes get an ID from their name once.
              const themes = value.themes.map((t) => (t.id.startsWith("campaign") && t.name !== "New campaign" ? { ...t, id: uniqueId(slug(t.name), t.id, value.themes) } : t));
              const res = await saveHeroThemesAction({ ...value, themes });
              if (res.ok) setValue((v) => ({ ...v, themes }));
              setMsg(res.ok ? { ok: true, text: "Saved. The homepage updates within a minute." } : { ok: false, text: res.error ?? "Couldn't save." });
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Save themes
        </button>
        {msg ? <p role="status" className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : null}
      </div>
    </div>
  );
}

function uniqueId(base: string, own: string, themes: HeroTheme[]) {
  let id = base;
  for (let n = 2; themes.some((t) => t.id === id && t.id !== own); n++) id = `${base}-${n}`;
  return id;
}
