"use client";

import { useState, useTransition } from "react";
import { Dices, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Kid } from "@/components/store/hero/kid";
import { saveMyCharactersAction } from "@/features/marketing/hero-theme-actions";
import {
  ACCESSORIES,
  characterSize,
  HAIR_COLOURS,
  HAIR_STYLES,
  MAX_CHARACTERS,
  OUTFITS,
  RELATIONSHIPS,
  SKIN_TONES,
  type CharacterLook,
  type CustomerCharacter,
} from "@/features/marketing/hero-theme-config";
import { cn } from "@/lib/utils";

const OUTFIT_COLOURS = ["#4b0082", "#d62828", "#3a86ff", "#2a9d8f", "#ff7a00", "#ff5d8f"];
const inputCls = "h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-base text-deep outline-none focus-visible:border-royal focus-visible:ring-2 focus-visible:ring-royal/20 sm:text-sm";
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const newId = () => Math.random().toString(36).slice(2, 12).padEnd(8, "0");

function randomLook(): CharacterLook {
  return { skin: pick(SKIN_TONES), hair: pick(HAIR_STYLES), hair_colour: pick(HAIR_COLOURS), outfit: pick(OUTFITS), outfit_colour: pick(OUTFIT_COLOURS), accessory: pick(ACCESSORIES) };
}

/** "My Characters": up to 3 cartoon characters that join King and Mia on the homepage. */
export function CharactersEditor({ initial }: { initial: CustomerCharacter[] }) {
  const [list, setList] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<CustomerCharacter>) => setList((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setLook = (c: CustomerCharacter, patch: Partial<CharacterLook>) => set(c.id, { look: { ...c.look, ...patch } });

  const save = (next = list) =>
    start(async () => {
      setMsg(null);
      const res = await saveMyCharactersAction(next);
      setMsg(res.ok ? { ok: true, text: "Saved! Welcome to King's family. Your characters now appear on the homepage." } : { ok: false, text: res.error ?? "Couldn't save." });
    });

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        No photos needed: you design the character yourself, so your child&apos;s picture is never uploaded or shared. Only you see your characters.
      </p>

      {list.length === 0 ? <p className="text-sm text-muted-foreground">You have no characters yet. Create one and they join King&apos;s family on our homepage: King and Mia will welcome them by name.</p> : null}

      {list.map((c) => (
        <div key={c.id} className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-[10rem_1fr]">
          <div className="flex h-48 items-end justify-center rounded-xl bg-gradient-to-b from-royal-800 to-royal">
            <Kid look={c.look} size={characterSize(c) === "adult" ? "adult" : "kid"} wave label={c.name || "Name"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">Name</span>
              <input value={c.name} maxLength={20} onChange={(e) => set(c.id, { name: e.target.value })} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-deep">Relationship</span>
              <select value={c.relationship} onChange={(e) => set(c.id, { relationship: e.target.value as CustomerCharacter["relationship"] })} className={inputCls}>
                {RELATIONSHIPS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <Swatches label="Skin" options={SKIN_TONES} value={c.look.skin} onChange={(skin) => setLook(c, { skin })} />
            <Swatches label="Hair colour" options={HAIR_COLOURS} value={c.look.hair_colour} onChange={(hair_colour) => setLook(c, { hair_colour })} />
            <Select label="Hair style" options={HAIR_STYLES} value={c.look.hair} onChange={(hair) => setLook(c, { hair })} />
            <Select label="Outfit" options={OUTFITS} value={c.look.outfit} onChange={(outfit) => setLook(c, { outfit })} />
            <Swatches label="Outfit colour" options={OUTFIT_COLOURS} value={c.look.outfit_colour} onChange={(outfit_colour) => setLook(c, { outfit_colour })} />
            <Select label="Accessory" options={ACCESSORIES} value={c.look.accessory} onChange={(accessory) => setLook(c, { accessory })} />
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="button" onClick={() => set(c.id, { look: randomLook() })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold text-royal hover:bg-royal-50">
                <Dices aria-hidden className="size-4" /> Surprise me
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete ${c.name || "this character"}?`)) return;
                  const next = list.filter((x) => x.id !== c.id);
                  setList(next);
                  save(next);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
              >
                <Trash2 aria-hidden className="size-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={list.length >= MAX_CHARACTERS}
          onClick={() => setList((l) => [...l, { id: newId(), name: "", relationship: "Son", look: randomLook() }])}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold text-deep hover:bg-muted disabled:opacity-50"
        >
          <Plus aria-hidden className="size-4" /> {list.length >= MAX_CHARACTERS ? `Up to ${MAX_CHARACTERS} characters` : "Create a character"}
        </button>
        <button type="button" disabled={pending} onClick={() => save()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Save characters
        </button>
        {msg ? <p role="status" className={cn("text-sm", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p> : null}
      </div>
    </div>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend className="mb-1.5 font-medium text-deep">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-label={`${label} ${o}`}
            aria-pressed={o === value}
            onClick={() => onChange(o)}
            className={cn("size-8 rounded-full ring-1 ring-black/10", o === value && "ring-3 ring-royal ring-offset-2")}
            style={{ background: o }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Select<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-deep">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace("-", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
