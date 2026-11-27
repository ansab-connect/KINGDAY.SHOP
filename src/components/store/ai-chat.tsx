"use client";

import { useCompany } from "@/components/company-provider";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { customerChatAction } from "@/features/ai/chat";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "model"; text: string };

const HELLO: Msg = { role: "model", text: "Hi! I'm the KING DAY assistant. Ask me about our rides, prices, delivery or BEST FIT service." };

/** Turns plain links in the assistant's reply into tappable links (no HTML from the model). */
function Linkified({ text }: { text: string }) {
  // Tidy any markdown the model still sends: [name](url) → url, **bold** → bold.
  const clean = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2").replace(/\*\*([^*]+)\*\*/g, "$1");
  const parts = clean.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} className="break-all font-semibold underline underline-offset-2">
            {p.replace(/^https?:\/\/(www\.)?kingday\.in/, "kingday.in")}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Floating help chat (Gemini). Answers from KING DAY's own data; WhatsApp is always one tap away. */
export function AiChat() {
  const company = useCompany();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([HELLO]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, text: text.slice(0, 600) }];
    setMessages(next);
    setDraft("");
    start(async () => {
      // Send the conversation without the canned greeting, last 10 turns only.
      const res = await customerChatAction({ messages: next.filter((m) => m !== HELLO).slice(-10) });
      setMessages((m) => [...m, { role: "model", text: res.ok ? res.text : res.error }]);
    });
  };

  const wa = `https://wa.me/${company.whatsapp}?text=${encodeURIComponent("Hi KING DAY, I have a question.")}`;

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label="KING DAY assistant"
          className="fixed right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex h-[min(32rem,calc(100dvh-8rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl lg:right-6 lg:bottom-6"
        >
          <div className="flex items-center gap-3 bg-deep px-4 py-3 text-white">
            <span className="grid size-8 place-items-center rounded-full bg-gold text-deep">
              <Bot aria-hidden className="size-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">KING DAY assistant</span>
              <span className="block text-[0.7rem] text-white/60">AI answers from our store. A person is on WhatsApp.</span>
            </span>
            <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-white/10">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-canvas p-3" aria-live="polite">
            {messages.map((m, i) => (
              <p
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line",
                  m.role === "user" ? "ml-auto rounded-br-sm bg-royal text-white" : "rounded-bl-sm bg-white text-deep shadow-sm",
                )}
              >
                {m.role === "model" ? <Linkified text={m.text} /> : m.text}
              </p>
            ))}
            {pending ? (
              <p className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Typing…
              </p>
            ) : null}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t p-2"
          >
            <label htmlFor="ai-chat-input" className="sr-only">Your question</label>
            <input
              id="ai-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={600}
              placeholder="Ask a question…"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-full border bg-white px-4 text-base outline-none focus:border-royal sm:text-sm"
            />
            <button type="submit" aria-label="Send" disabled={!draft.trim() || pending} className="grid size-11 shrink-0 place-items-center rounded-full bg-royal text-white hover:bg-royal-800 disabled:opacity-50">
              <Send className="size-4" />
            </button>
          </form>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-t py-2 text-xs font-semibold text-[#128C7E] hover:bg-muted">
            <WhatsAppIcon className="size-4" /> Talk to a person on WhatsApp
          </a>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={open ? "Close chat" : "Open chat with the KING DAY assistant"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 grid size-13 place-items-center rounded-full bg-royal text-gold shadow-[0_12px_30px_-10px_rgb(75_0_130/0.7)] hover:bg-royal-800 lg:right-6 lg:bottom-6"
        style={open ? { display: "none" } : undefined}
      >
        <MessageCircle aria-hidden className="size-6" />
      </button>
    </>
  );
}
