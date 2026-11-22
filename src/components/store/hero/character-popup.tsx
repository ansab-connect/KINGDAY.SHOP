"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { readConsent } from "@/lib/meta-pixel";

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
    let t = 0;
    // Wait until the cookie choice is answered, so the two popups never overlap.
    const show = () => {
      if (readConsent() === null) {
        t = window.setTimeout(show, 1000);
        return;
      }
      setOpen(true);
      try {
        sessionStorage.setItem(SHOWN, "1");
      } catch {
        // ignore
      }
    };
    t = window.setTimeout(show, DELAY_MS);
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
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 z-50 flex items-center rounded-full bg-royal py-1 pr-1 pl-1 text-white shadow-xl ring-1 ring-gold/40 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 lg:bottom-6 lg:left-6">
      <Link href="/account/characters" onClick={() => setOpen(false)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold hover:bg-white/10 sm:text-sm">
        <Sparkles aria-hidden className="size-4 text-gold" /> Create Your Child&apos;s Character
      </Link>
      <button type="button" onClick={dismiss} aria-label="Close" className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
