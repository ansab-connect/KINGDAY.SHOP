"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { aiWebsiteAdviceAction } from "@/features/ai/admin-ai";

/** "Get AI suggestions" for Super Admin: business numbers + system health → next steps. */
export function AiAdvice({ health }: { health: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const res = await aiWebsiteAdviceAction({ health });
          if (res.ok) setText(res.text);
          else setError(res.error);
        })}
        className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-60"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
        {pending ? "Checking your website…" : text ? "Ask again" : "Get AI suggestions"}
      </button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {text ? <div className="rounded-xl border bg-royal-50/40 p-4 text-sm whitespace-pre-line text-deep">{text}</div> : null}
    </div>
  );
}
