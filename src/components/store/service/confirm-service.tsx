"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { confirmMyServiceAction } from "@/features/service/actions";

/** Optional confirmation after the service; the job continues whether or not it is used. */
export function ConfirmService({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 rounded-xl border border-success/30 bg-success-soft/40 p-3">
      <p className="text-sm font-semibold text-deep"><L en="Is everything OK with your product?" ml="നിങ്ങളുടെ ഉൽപ്പന്നം ശരിയായോ?" /></p>
      <p className="mt-0.5 text-xs text-muted-foreground"><L en="Optional: confirm the service is done and your product is ready." ml="ഐച്ഛികം: സർവീസ് പൂർത്തിയായി, ഉൽപ്പന്നം റെഡിയാണെന്ന് ഉറപ്പിക്കുക." /></p>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Comment (optional)" aria-label="Comment" className="mt-2 h-10 w-full rounded-lg border bg-white px-3 text-sm" />
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await confirmMyServiceAction(id, note); setError(r.ok ? null : (r.error ?? "Error")); })}
        className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-success px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden className="size-4" />}
        <L en="Yes, I agree — service done" ml="അതെ, സർവീസ് പൂർത്തിയായി" />
      </button>
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
