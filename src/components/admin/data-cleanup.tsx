"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cleanNowAction, saveCleanupPlanAction } from "@/features/data/actions";

const input = "h-11 rounded-lg border bg-white px-3 text-sm";

export function CleanupPlanForm({ date, every, keep, canClean }: { date: string; every: number; keep: number; canClean: boolean }) {
  const [d, setD] = useState(date);
  const [e, setE] = useState(String(every));
  const [k, setK] = useState(String(keep));
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-deep">Next clean date</span><input type="date" value={d} onChange={(x) => setD(x.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-deep">Then repeat every (days)</span><input type="number" min={7} max={365} value={e} onChange={(x) => setE(x.target.value)} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-medium text-deep">Keep files after a job closes (days)</span><input type="number" min={7} max={730} value={k} onChange={(x) => setK(x.target.value)} className={input} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => setMsg(await saveCleanupPlanAction({ date: d, every_days: Number(e), keep_days: Number(k) })))} className="inline-flex h-11 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Save plan
        </button>
        {canClean ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete the downloaded temporary files now? Each job keeps a short overview. This cannot be undone.")) start(async () => setMsg(await cleanNowAction()));
            }}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-danger px-5 text-sm font-semibold text-danger disabled:opacity-60"
          >
            Clean downloaded files now
          </button>
        ) : null}
      </div>
      {msg ? <p className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.message}</p> : null}
    </div>
  );
}
