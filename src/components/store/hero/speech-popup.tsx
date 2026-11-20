"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { familyScript, OFFICIAL_ART } from "@/components/store/hero/walkers";
import type { CustomerCharacter } from "@/features/marketing/hero-theme-config";

const KEY = "kingday.heroSpeech.closed";
const EVERY_MS = 9000;
const SHOW_MS = 5000;

/** Now and then a character says something in a small bubble; × stops them for this visit. */
export function SpeechPopup({ mine }: { mine: CustomerCharacter[] }) {
  const [n, setN] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") return;
    } catch {
      // ignore
    }
    let i = 0;
    let hide: number | undefined;
    const first = window.setTimeout(tick, 2500);
    const t = window.setInterval(tick, EVERY_MS);
    function tick() {
      setN(i++);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setN(null), SHOW_MS);
    }
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
      window.clearTimeout(hide);
    };
  }, []);

  if (n === null || closed) return null;
  const script = familyScript(mine);
  const line = script[n % script.length];
  const art = OFFICIAL_ART[line.who.id];
  return (
    <div role="status" className="absolute right-3 bottom-[44%] z-20 flex max-w-[13rem] items-start gap-2 rounded-2xl bg-white py-2 pr-1 pl-2 text-deep shadow-lg ring-1 ring-gold/40 motion-safe:animate-in motion-safe:zoom-in-90 sm:right-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- small static cut-out */}
      {art ? <img src={art} alt="" className="size-8 shrink-0 rounded-full bg-royal-50 object-cover object-top" /> : null}
      <p className="min-w-0 py-0.5 text-xs leading-snug">
        <span className="block font-bold text-royal">{line.who.name}</span>
        {line.say}
      </p>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          setClosed(true);
          try {
            sessionStorage.setItem(KEY, "1");
          } catch {
            // ignore
          }
        }}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
