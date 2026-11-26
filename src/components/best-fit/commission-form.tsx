"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { Notice } from "@/components/best-fit/op-form";
import { runOp, type OpResult } from "@/features/best-fit/ops";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };
type Share = { beneficiary: "company" | "assigned_technician" | "user"; user_id: string; percent: string };
export type RuleInitial = { id?: string; technician_id: string | null; effective_from: string; effective_to: string | null; notes: string | null; shares: { beneficiary: Share["beneficiary"]; user_id: string | null; percent: number }[] };

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Create a rule (or a new version that replaces an existing one) for one section. */
export function CommissionRuleForm({ section, techs, staff, initial, replaces }: { section: "inspection" | "service" | "parts"; techs: Opt[]; staff: Opt[]; initial?: RuleInitial; replaces?: string }) {
  const [tech, setTech] = useState(initial?.technician_id ?? "");
  const [from, setFrom] = useState(replaces ? new Date().toISOString().slice(0, 10) : (initial?.effective_from ?? new Date().toISOString().slice(0, 10)));
  const [to, setTo] = useState(initial?.effective_to ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [shares, setShares] = useState<Share[]>(
    initial?.shares.map((s) => ({ beneficiary: s.beneficiary, user_id: s.user_id ?? "", percent: String(s.percent) })) ?? [
      { beneficiary: "company", user_id: "", percent: "" },
      { beneficiary: "assigned_technician", user_id: "", percent: "" },
    ],
  );
  const [sample, setSample] = useState("1000");
  const [result, setResult] = useState<OpResult | null>(null);
  const [pending, start] = useTransition();
  const total = shares.reduce((n, s) => n + (Number(s.percent) || 0), 0);
  const base = Math.round(Number(sample) * 100) || 0;
  const set = (i: number, patch: Partial<Share>) => setShares((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  function save() {
    start(async () => {
      const r = await runOp("rule.save", {
        section, technician_id: tech || null, effective_from: from, effective_to: to || null, notes, replaces_id: replaces ?? null,
        shares: shares.map((s) => ({ beneficiary: s.beneficiary, user_id: s.beneficiary === "user" ? s.user_id : null, percent: Number(s.percent) })),
      });
      setResult(r);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2"><span className="font-medium">Applies to</span>
          <select value={tech} onChange={(e) => setTech(e.target.value)} disabled={Boolean(replaces)} className={inputClass}>
            <option value="">Default (all technicians without their own rule)</option>
            {techs.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Effective from</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Effective to</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} /></label>
      </div>
      <div className="flex flex-col gap-2">
        {shares.map((s, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <select aria-label="Beneficiary" value={s.beneficiary} onChange={(e) => set(i, { beneficiary: e.target.value as Share["beneficiary"] })} className={cn(inputClass, "w-56")}>
              <option value="company">Company</option>
              <option value="assigned_technician">The assigned technician</option>
              <option value="user">A specific staff member</option>
            </select>
            {s.beneficiary === "user" ? (
              <select aria-label="Staff member" value={s.user_id} onChange={(e) => set(i, { user_id: e.target.value })} className={cn(inputClass, "w-64")}>
                <option value="">Choose…</option>
                {staff.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            ) : null}
            <input aria-label="Percent" type="number" step="0.01" value={s.percent} onChange={(e) => set(i, { percent: e.target.value })} className={cn(inputClass, "w-24")} placeholder="%" />
            <span className="pb-2 text-sm text-muted-foreground">= {inr(Math.floor((base * (Number(s.percent) || 0)) / 100))}</span>
            <button type="button" aria-label="Remove" onClick={() => setShares((xs) => xs.filter((_, j) => j !== i))} className="mb-1 rounded p-1.5 text-danger hover:bg-danger-soft"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setShares((xs) => [...xs, { beneficiary: "user", user_id: "", percent: "" }])} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-royal"><Plus className="size-4" /> Add beneficiary</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={cn("rounded-full px-3 py-1 font-semibold", total === 100 ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>Total {total}%{total === 100 ? "" : " — must be exactly 100%"}</span>
        <label className="flex items-center gap-2">Preview on ₹<input type="number" value={sample} onChange={(e) => setSample(e.target.value)} className={cn(inputClass, "h-8 w-28")} /></label>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" className={inputClass} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || total !== 100} onClick={save} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}{replaces ? "Save as new version" : "Save rule"}
        </button>
        <Notice r={result} />
      </div>
    </div>
  );
}
