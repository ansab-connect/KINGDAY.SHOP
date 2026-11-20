"use client";

import { useEffect, useMemo, useState } from "react";
import { Kid } from "@/components/store/hero/kid";
import { KING, MIA, type Costume, type CustomerCharacter } from "@/features/marketing/hero-theme-config";

export const OFFICIAL_ART: Record<string, string> = { [KING.id]: "/characters/king.webp", [MIA.id]: "/characters/mia.webp" };

type Line = { who: CustomerCharacter; say: string; run?: boolean };

const EVERY_MS = 11000;

/** King and Mia introduce the family (and each customer character), then chat now and then. */
export function familyScript(mine: CustomerCharacter[]): Line[] {
  const lines: Line[] = [
    { who: KING, say: "Hi! I'm King!" },
    { who: MIA, say: "I'm Mia, King's little sister!" },
  ];
  for (const c of mine) {
    lines.push({ who: KING, say: `Meet our new family member, ${c.name}!` }, { who: c, say: `Hi! I'm ${c.name}!` }, { who: MIA, say: "Welcome to our family!" });
  }
  lines.push(
    { who: mine[0] ?? KING, say: "Hi Mamma! Hi Papa!" },
    { who: MIA, say: "I need a gift! 🎁" },
    { who: KING, say: "Let's go shopping!", run: true },
  );
  return lines;
}

/**
 * Characters walk (or run) across the bottom of the screen, above the mobile menu, with a
 * speech bubble. They never take clicks (pointer-events: none), so shopping isn't blocked.
 */
export function Walkers({ mine, costume }: { mine: CustomerCharacter[]; costume: Costume }) {
  const script = useMemo(() => familyScript(mine), [mine]);
  const [step, setStep] = useState<{ n: number } | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 0;
    let hide: number | undefined;
    const t = window.setInterval(() => {
      setStep({ n: n++ });
      hide = window.setTimeout(() => setStep(null), 7000);
    }, EVERY_MS);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(hide);
    };
  }, []);

  if (!step) return null;
  const line = script[step.n % script.length];
  const art = OFFICIAL_ART[line.who.id];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-[4.25rem] z-30 h-28 overflow-hidden sm:h-32 lg:bottom-1">
      <div key={step.n} className={`${line.run ? "kd-run" : "kd-walk"} absolute bottom-0 flex h-full flex-col items-center`}>
        <span className="relative mb-1 rounded-2xl bg-white px-2.5 py-1 text-xs font-bold whitespace-nowrap text-royal shadow-md ring-1 ring-gold/40">
          {line.say}
          <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-white" />
        </span>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static cut-out
          <img src={art} alt="" className={`${line.run ? "kd-step-fast" : "kd-step"} min-h-0 flex-1 object-contain drop-shadow-[0_6px_6px_rgb(0_0_0/0.3)]`} />
        ) : (
          <Kid look={line.who.look} costume={costume} size="adult" className={`${line.run ? "kd-step-fast" : "kd-step"} min-h-0 flex-1`} />
        )}
      </div>
    </div>
  );
}
