"use client";

import { useSyncExternalStore } from "react";
import { LANG_STORAGE_KEY, type Lang } from "@/components/i18n/lang";
import { cn } from "@/lib/utils";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });
  return () => obs.disconnect();
}
const read = (): Lang => (document.documentElement.dataset.lang === "ml" ? "ml" : "en");

/** Current language in client components (for placeholders, aria-labels, messages). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, read, () => "en");
}

export function setLang(lang: Lang) {
  const root = document.documentElement;
  if (lang === "ml") root.dataset.lang = "ml";
  else delete root.dataset.lang;
  root.lang = lang === "ml" ? "ml-IN" : "en-IN";
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {}
  document.cookie = `${LANG_STORAGE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const lang = useLang();
  const base = "h-7 rounded-full px-2.5 text-xs font-semibold transition-colors";
  const on = tone === "dark" ? "bg-gold text-deep" : "bg-royal text-white";
  const off = tone === "dark" ? "text-white/70 hover:text-white" : "text-deep/70 hover:text-royal";
  return (
    <div role="group" aria-label="Language" className={cn("inline-flex items-center rounded-full border p-0.5", tone === "dark" ? "border-white/20" : "border-border", className)}>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} className={cn(base, lang === "en" ? on : off)}>
        EN
      </button>
      <button type="button" aria-pressed={lang === "ml"} onClick={() => setLang("ml")} lang="ml" className={cn(base, lang === "ml" ? on : off)}>
        മല
      </button>
    </div>
  );
}
