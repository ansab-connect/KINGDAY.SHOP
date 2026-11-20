"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

const DISMISSED = "kingday.characterPromo.dismissed";
const SHOWN = "kingday.characterPromo.shownThisVisit";
const DELAY_MS = 1200;

/**
 * "Create Your Child's Character" popup: shown first when the homepage opens (once per visit)
 * for customers without a character. Later = next visit. × hides it for good (Account → My Characters still has it).
 */
export function CharacterPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED) === "1" || sessionStorage.getItem(SHOWN) === "1") return;
    } catch {
      return; // Storage blocked: don't risk showing it on every page view.
    }
    const t = window.setTimeout(() => {
      setOpen(true);
      try {
        sessionStorage.setItem(SHOWN, "1");
      } catch {
        // ignore
      }
    }, DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Storage blocked: hidden for this visit only.
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="char-popup-title"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-sm overflow-hidden rounded-3xl bg-gradient-to-br from-royal-800 to-deep text-white shadow-2xl ring-1 ring-gold/40 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 sm:right-auto sm:left-6 sm:w-sm lg:bottom-6"
    >
      <button type="button" onClick={dismiss} aria-label="Close" className="absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
        <X aria-hidden className="size-4" />
      </button>
      <div className="flex items-end gap-3 px-5 pt-5">
        <div aria-hidden className="flex h-28 shrink-0 items-end">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static cut-out */}
          <img src="/characters/king.webp" alt="" className="kd-bob h-full w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element -- small static cut-out */}
          <img src="/characters/mia.webp" alt="" className="kd-bob -ml-3 h-[80%] w-auto" style={{ animationDelay: "0.6s" }} />
        </div>
        <div className="min-w-0 pb-2">
          <p id="char-popup-title" className="flex items-center gap-1.5 font-heading text-base leading-tight font-bold">
            <Sparkles aria-hidden className="size-4 shrink-0 text-gold" /> Create Your Child&apos;s Character
          </p>
          <p className="mt-1 text-xs leading-snug text-white/75">Make them a new member of King &amp; Mia&apos;s family. Free, no photo needed.</p>
        </div>
      </div>
      <div className="flex gap-2 p-4 pt-3">
        <Link href="/account/characters" onClick={() => setOpen(false)} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-gold text-sm font-bold text-deep hover:bg-gold-300">
          Create Now
        </Link>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-sm font-medium text-white/70 hover:text-white">
          Later
        </button>
      </div>
    </div>
  );
}
