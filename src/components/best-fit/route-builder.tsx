"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { inputClass } from "@/components/admin/form/fields";
import { Notice } from "@/components/best-fit/op-form";
import { runOp, type OpResult } from "@/features/best-fit/ops";

export type Stop = { id: string; code: string; label: string; hint?: string };
export type Suggestion = { key: string; title: string; reason: string; stops: Stop[]; technicianId: string | null };
type Opt = { value: string; label: string };

/**
 * Suggested groups (or plain bookings) → a draft route. The admin can tick any bookings
 * across suggestions (merge), untick some (split/edit) or ignore a suggestion (reject).
 * Nothing is assigned unless the admin ticks "Also create work orders".
 */
export function RouteBuilder({ suggestions, techs, groups }: { suggestions: Suggestion[]; techs: Opt[]; groups: Opt[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tech, setTech] = useState("");
  const [group, setGroup] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [assign, setAssign] = useState(false);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<OpResult | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const acceptSuggestion = (s: Suggestion) => { setPicked(new Set(s.stops.map((x) => x.id))); if (s.technicianId) setTech(s.technicianId); };

  function create() {
    start(async () => {
      const r = await runOp("route.build", { booking_ids: [...picked], technician_id: tech || null, group_id: group || null, plan_date: date, assign, notes });
      setResult(r);
      if (r.ok) setPicked(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {suggestions.filter((s) => !hidden.has(s.key)).map((s) => (
          <div key={s.key} className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold text-deep">{s.title}</p><p className="text-xs text-muted-foreground">{s.reason}</p></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => acceptSuggestion(s)} className="h-8 rounded-lg bg-royal px-3 text-xs font-semibold text-white">Accept</button>
                <button type="button" onClick={() => setHidden((h) => new Set(h).add(s.key))} className="h-8 rounded-lg border px-3 text-xs font-semibold text-deep">Reject</button>
              </div>
            </div>
            <ul className="flex flex-col gap-1">
              {s.stops.map((x) => (
                <li key={x.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={picked.has(x.id)} onChange={() => toggle(x.id)} className="mt-1 size-4 accent-royal" />
                    <span><span className="font-mono text-xs text-royal">{x.code}</span> {x.label}{x.hint ? <span className="block text-xs text-muted-foreground">{x.hint}</span> : null}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="sticky bottom-3 flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-lift">
        <p className="text-sm font-semibold text-deep">{picked.size} booking(s) selected for the route</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Technician</span><select value={tech} onChange={(e) => setTech(e.target.value)} className={inputClass}><option value="">—</option>{techs.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">or Group</span><select value={group} onChange={(e) => setGroup(e.target.value)} className={inputClass}><option value="">—</option>{groups.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assign} onChange={(e) => setAssign(e.target.checked)} className="size-4 accent-royal" /> Also create work orders for these bookings (assign to the technician)</label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending || !picked.size} onClick={create} className="inline-flex h-10 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Create draft route
          </button>
          <Notice r={result} />
        </div>
      </div>
    </div>
  );
}
