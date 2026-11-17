"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { aiAnalystAction } from "@/features/ai/admin-ai";

const SUGGESTIONS = [
  "What needs my attention today?",
  "Summarise this week's sales in 5 lines.",
  "Which products should I restock first?",
  "How is the BEST FIT service doing?",
  "Which category sells best and what should I promote?",
  "Give me 3 ideas to increase orders next month.",
];

type QA = { q: string; a: string; error?: boolean };

/** Ask questions about the business in plain words; answers come only from the store's own numbers. */
export function AiAnalyst() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    const text = q.trim();
    if (!text || pending) return;
    setQuestion("");
    start(async () => {
      const res = await aiAnalystAction({ question: text });
      setHistory((h) => [{ q: text, a: res.ok ? res.text : res.error, error: !res.ok }, ...h].slice(0, 20));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" disabled={pending} onClick={() => ask(s)} className="rounded-full border bg-white px-3 py-1.5 text-sm text-deep hover:border-royal/40 hover:text-royal disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <label htmlFor="analyst-q" className="sr-only">Your question</label>
        <input
          id="analyst-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={600}
          placeholder="Ask about sales, orders, stock or service…"
          className="h-11 min-w-0 flex-1 rounded-lg border bg-white px-3 text-base outline-none focus:border-royal sm:text-sm"
        />
        <button type="submit" disabled={pending || !question.trim()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-royal px-4 text-sm font-semibold text-white hover:bg-royal-800 disabled:opacity-50">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />} Ask
        </button>
      </form>
      {pending ? <p className="text-sm text-muted-foreground">Reading your numbers…</p> : null}
      <ol className="flex flex-col gap-3">
        {history.map((h, i) => (
          <li key={i} className="rounded-xl border bg-white p-4 shadow-card">
            <p className="text-sm font-semibold text-deep">{h.q}</p>
            <p className={`mt-2 flex gap-2 text-sm whitespace-pre-line ${h.error ? "text-danger" : "text-deep"}`}>
              <Bot aria-hidden className="mt-0.5 size-4 shrink-0 text-royal" />
              <span>{h.a}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
