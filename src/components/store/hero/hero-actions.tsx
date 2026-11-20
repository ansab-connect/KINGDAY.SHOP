"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Wrench, X } from "lucide-react";
import { Kid } from "@/components/store/hero/kid";
import { OFFICIAL_ART } from "@/components/store/hero/walkers";
import { MIA, type CustomerCharacter } from "@/features/marketing/hero-theme-config";

/** Two playful buttons on the hero: vehicle help (Book Service) and a gift popup. */
export function HeroActions({ mine }: { mine: CustomerCharacter[] }) {
  const [gift, setGift] = useState(false);
  const star = mine[0] ?? MIA;

  useEffect(() => {
    if (!gift) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setGift(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gift]);

  const chip = "inline-flex h-8 items-center gap-1.5 rounded-full bg-white/90 px-3 text-[0.7rem] font-bold text-royal shadow-md hover:bg-white sm:text-xs";
  return (
    <>
      <div className="absolute inset-x-0 top-[27%] z-10 flex flex-wrap justify-center gap-2 px-3 sm:top-[25%]">
        <Link href="/book-service" className={chip}>
          <Wrench aria-hidden className="size-3.5 text-gold-600" /> My Vehicle Needs Help!
        </Link>
        <button type="button" onClick={() => setGift(true)} className={chip}>
          <Gift aria-hidden className="size-3.5 text-gold-600" /> Can I Have a Gift?
        </button>
      </div>

      {gift ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-deep/60 p-4 motion-safe:animate-in motion-safe:fade-in" onClick={() => setGift(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gift-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xs rounded-3xl bg-gradient-to-b from-royal-800 to-deep p-6 text-center text-white shadow-2xl ring-1 ring-gold/40 motion-safe:animate-in motion-safe:zoom-in-95"
          >
            <button type="button" onClick={() => setGift(false)} aria-label="Close" className="absolute top-2 right-2 grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
              <X aria-hidden className="size-4" />
            </button>
            <div className="flex h-36 items-end justify-center gap-2">
              {OFFICIAL_ART[star.id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- small static cut-out
                <img src={OFFICIAL_ART[star.id]} alt="" className="kd-bob h-full w-auto" />
              ) : (
                <Kid look={star.look} size="adult" wave className="h-full" />
              )}
              <span aria-hidden className="kd-hop mb-2 text-6xl">🎁</span>
            </div>
            <p id="gift-title" className="mt-3 font-heading text-lg font-bold">A royal gift for {star.name}!</p>
            <p className="mt-1 text-sm text-white/75">Pick a ride they&apos;ll love. Every gift is safety-checked and delivered with care.</p>
            <Link href="/shop" onClick={() => setGift(false)} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-gold text-sm font-bold text-deep hover:bg-gold-300">
              Find a gift
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
