"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { runOp, type OpResult } from "@/features/best-fit/ops";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "textarea" | "number" | "money" | "date" | "select" | "bool" | "list";
export type Field = {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  step?: string;
  wide?: boolean;
};
type Values = Record<string, unknown>;

/** Turn form strings into what the database expects (₹ → paise, "a, b" → [a, b], "" → null). */
function convert(fields: Field[], raw: Record<string, string | boolean>): Values {
  const out: Values = {};
  for (const f of fields) {
    const r = raw[f.name];
    if (f.type === "bool") out[f.name] = Boolean(r);
    else if (r === "" || r === undefined) out[f.name] = f.type === "list" ? [] : null;
    else if (f.type === "money") out[f.name] = Math.round(Number(r) * 100);
    else if (f.type === "number") out[f.name] = Number(r);
    else if (f.type === "list") out[f.name] = String(r).split(",").map((s) => s.trim()).filter(Boolean);
    else out[f.name] = r;
  }
  return out;
}

function initialFor(f: Field, v: unknown): string | boolean {
  if (f.type === "bool") return v === undefined ? true : Boolean(v);
  if (v === null || v === undefined) return "";
  if (f.type === "money") return String(Number(v) / 100);
  if (f.type === "list") return Array.isArray(v) ? v.join(", ") : String(v);
  return String(v);
}

export function Notice({ r }: { r: OpResult | null }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={cn("rounded-lg px-3 py-2 text-sm", r.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
      {r.ok ? (r.message ?? "Saved.") : r.error}
    </p>
  );
}

/** A small form bound to one whitelisted operation (see features/best-fit/ops.ts). */
export function OpForm({
  op,
  fields,
  initial = {},
  hidden = {},
  submitLabel = "Save",
  resetOnSuccess = false,
  columns = 2,
  transform,
}: {
  op: string;
  fields: Field[];
  initial?: Values;
  hidden?: Values;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  columns?: 1 | 2 | 3 | 4;
  /** Reshape the converted values before sending (e.g. wrap into a JSON setting). */
  transform?: "settingValue";
}) {
  const blank = () => Object.fromEntries(fields.map((f) => [f.name, initialFor(f, initial[f.name])]));
  const [raw, setRaw] = useState<Record<string, string | boolean>>(blank);
  const [result, setResult] = useState<OpResult | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      let values: Values = { ...convert(fields, raw), ...hidden };
      if (transform === "settingValue") values = { key: hidden.key, value: { ...(hidden.base as object), ...convert(fields, raw) } };
      const r = await runOp(op, values);
      setResult(r);
      if (r.ok && resetOnSuccess) setRaw(blank());
    });
  }

  const grid = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className={cn("grid gap-3", grid)}>
        {fields.map((f) => {
          const id = `${op}-${f.name}-${String(hidden.id ?? "new")}`;
          const val = raw[f.name];
          const set = (x: string | boolean) => setRaw((s) => ({ ...s, [f.name]: x }));
          if (f.type === "bool") {
            return (
              <label key={f.name} htmlFor={id} className="flex items-center gap-2 self-end pb-2 text-sm text-deep">
                <input id={id} type="checkbox" checked={Boolean(val)} onChange={(e) => set(e.target.checked)} className="size-4 accent-royal" />
                {f.label}
              </label>
            );
          }
          return (
            <label key={f.name} htmlFor={id} className={cn("flex flex-col gap-1 text-sm", (f.wide || f.type === "textarea") && "sm:col-span-full")}>
              <span className="font-medium text-deep">
                {f.label}
                {f.required ? <span className="text-danger"> *</span> : null}
              </span>
              {f.type === "select" ? (
                <select id={id} value={String(val)} required={f.required} onChange={(e) => set(e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea id={id} value={String(val)} required={f.required} rows={3} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
              ) : (
                <input
                  id={id}
                  value={String(val)}
                  required={f.required}
                  placeholder={f.placeholder}
                  type={f.type === "date" ? "date" : f.type === "number" || f.type === "money" ? "number" : "text"}
                  step={f.step ?? (f.type === "money" ? "0.01" : f.type === "number" ? "any" : undefined)}
                  inputMode={f.type === "number" || f.type === "money" ? "decimal" : undefined}
                  onChange={(e) => set(e.target.value)}
                  className={inputClass}
                />
              )}
              {f.hint ? <span className="text-xs text-muted-foreground">{f.hint}</span> : null}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        <Notice r={result} />
      </div>
    </form>
  );
}

/**
 * One-click operation. `ask` shows a small inline input (reason, amount…) before running,
 * so nothing irreversible happens on a single accidental tap.
 */
export function OpButton({
  op,
  values,
  label,
  tone = "royal",
  ask,
  askType = "text",
  askKey = "reason",
  confirmText,
}: {
  op: string;
  values: Values;
  label: string;
  tone?: "royal" | "danger" | "neutral" | "gold";
  ask?: string;
  askType?: "text" | "money";
  askKey?: string;
  confirmText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<OpResult | null>(null);
  const [pending, start] = useTransition();
  const cls = {
    royal: "bg-royal text-white hover:bg-royal-800",
    gold: "bg-gold text-deep hover:bg-gold-300",
    danger: "border border-danger/30 bg-white text-danger hover:bg-danger-soft",
    neutral: "border bg-white text-deep hover:bg-muted",
  }[tone];

  function run() {
    start(async () => {
      const extra = ask ? { [askKey]: askType === "money" ? Math.round(Number(input) * 100) : input } : {};
      const r = await runOp(op, { ...values, ...extra });
      setResult(r);
      if (r.ok) {
        setOpen(false);
        setInput("");
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1.5">
      {open ? (
        <span className="flex flex-wrap items-center gap-2">
          {ask ? (
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ask}
              aria-label={ask}
              type={askType === "money" ? "number" : "text"}
              step={askType === "money" ? "0.01" : undefined}
              className={cn(inputClass, "h-9 w-48")}
            />
          ) : (
            <span className="text-sm text-deep">{confirmText ?? "Are you sure?"}</span>
          )}
          <button type="button" disabled={pending} onClick={run} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-60", cls)}>
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Confirm
          </button>
          <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-2 text-sm text-muted-foreground hover:text-deep">Cancel</button>
        </span>
      ) : (
        <button type="button" disabled={pending} onClick={() => (ask || confirmText ? setOpen(true) : run())} className={cn("inline-flex h-9 w-fit items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-60", cls)}>
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {label}
        </button>
      )}
      <Notice r={result} />
    </span>
  );
}
