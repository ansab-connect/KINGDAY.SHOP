"use client";

import { useState, useTransition } from "react";
import { Check, Languages, Loader2, Maximize2, Minimize2, Wand2, X } from "lucide-react";
import { aiWriteAction } from "@/features/ai/admin-ai";

const ACTIONS = [
  { mode: "expand", label: "Expand", icon: Maximize2 },
  { mode: "improve", label: "Improve", icon: Wand2 },
  { mode: "shorten", label: "Shorten", icon: Minimize2 },
  { mode: "malayalam", label: "Malayalam", icon: Languages },
] as const;

/**
 * AI writing helper under a text box: expand, improve, shorten or translate to Malayalam.
 * Shows a suggestion first; nothing changes until you press "Use this".
 */
export function AiWriteButtons({ value, onChange, productName, only }: { value: string; onChange: (v: string) => void; productName?: string; only?: (typeof ACTIONS)[number]["mode"][] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (mode: (typeof ACTIONS)[number]["mode"]) => {
    setError(null);
    setSuggestion(null);
    setBusy(mode);
    start(async () => {
      const res = await aiWriteAction({ mode, text: value, productName });
      setBusy(null);
      if (res.ok) setSuggestion(res.text);
      else setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-royal">AI:</span>
        {ACTIONS.filter((a) => !only || only.includes(a.mode)).map((a) => (
          <button
            key={a.mode}
            type="button"
            disabled={pending || value.trim().length < 3}
            onClick={() => run(a.mode)}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-royal-200 bg-royal-50 px-3 text-xs font-semibold text-royal hover:bg-royal-100 disabled:opacity-50"
          >
            {busy === a.mode ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <a.icon aria-hidden className="size-3.5" />} {a.label}
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      {suggestion ? (
        <div className="rounded-xl border border-royal-200 bg-white p-3">
          <p className="text-xs font-semibold text-royal">AI suggestion (check it before using)</p>
          <p className="mt-1 max-h-60 overflow-y-auto text-sm whitespace-pre-line text-deep">{suggestion}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(suggestion);
                setSuggestion(null);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-royal px-3 text-xs font-semibold text-white hover:bg-royal-800"
            >
              <Check aria-hidden className="size-3.5" /> Use this
            </button>
            <button type="button" onClick={() => setSuggestion(null)} className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-semibold text-deep hover:bg-muted">
              <X aria-hidden className="size-3.5" /> Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
