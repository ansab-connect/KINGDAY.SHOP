"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { L } from "@/components/i18n/lang";
import { cn } from "@/lib/utils";
import { promptInstall, usePwa } from "./pwa-state";

const DISMISS_KEY = "kd-install-dismissed";

/** True when there is something to offer: Android/desktop install prompt, or iOS Safari (manual steps). */
function useCanInstall() {
  const s = usePwa();
  return { ...s, can: !s.standalone && !s.installed && (Boolean(s.installEvent) || s.ios) };
}

function IosSteps({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Install KING DAY on iPhone" className="fixed inset-0 z-[60] flex items-end bg-deep/60 p-3 sm:items-center sm:justify-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-muted"><X className="size-5" /></button>
        </div>
        <p className="mt-4 font-heading text-lg font-semibold text-deep"><L en="Add KING DAY to your Home Screen" ml="ഹോം സ്ക്രീനിൽ KING DAY ചേർക്കൂ" /></p>
        <ol className="mt-4 flex flex-col gap-3 text-sm text-deep">
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-royal-50 text-royal"><Share aria-hidden className="size-5" /></span>
            <span><L en={<>Tap the <b>Share</b> button in Safari&apos;s toolbar.</>} ml={<>Safari-യിലെ <b>Share</b> ബട്ടൺ അമർത്തുക.</>} /></span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-royal-50 text-royal"><PlusSquare aria-hidden className="size-5" /></span>
            <span><L en={<>Choose <b>Add to Home Screen</b>.</>} ml={<><b>Add to Home Screen</b> തിരഞ്ഞെടുക്കുക.</>} /></span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-royal-50 font-bold text-royal">3</span>
            <span><L en={<>Tap <b>Add</b>. KING DAY opens like an app.</>} ml={<><b>Add</b> അമർത്തുക. KING DAY ഒരു ആപ്പ് പോലെ തുറക്കും.</>} /></span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground"><L en="Use Safari. Other iPhone browsers may not show this option." ml="Safari ഉപയോഗിക്കുക." /></p>
      </div>
    </div>
  );
}

/** "Install KING DAY App" button. Hidden when installed, running as the app, or not installable. */
export function InstallAppButton({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const { can, ios, installEvent } = useCanInstall();
  const [steps, setSteps] = useState(false);
  if (!can) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (installEvent ? promptInstall() : ios ? setSteps(true) : undefined)}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors",
          tone === "dark" ? "bg-gold text-deep hover:bg-gold-300" : "bg-royal text-white hover:bg-royal-800",
          className,
        )}
      >
        <Download aria-hidden className="size-4" /> <L en="Install KING DAY App" ml="KING DAY ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക" />
      </button>
      {steps ? <IosSteps onClose={() => setSteps(false)} /> : null}
    </>
  );
}

/** One-time install card on phones (shown after a short delay, dismissible for 30 days). */
export function InstallBanner() {
  const { can, ios, installEvent } = useCanInstall();
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    if (!can) return;
    let dismissed = 0;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {}
    if (Date.now() - dismissed < 30 * 86400000) return;
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, [can]);

  if (!can || !visible) return steps ? <IosSteps onClose={() => setSteps(false)} /> : null;
  const close = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };
  return (
    <>
      <div className="fixed inset-x-3 bottom-[4.75rem] z-40 flex items-center gap-3 rounded-2xl bg-deep p-3 pr-2 text-white shadow-lift lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static app icon */}
        <img src="/icons/icon-192.png" alt="" className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold"><L en="Get the KING DAY app" ml="KING DAY ആപ്പ്" /></p>
          <p className="truncate text-xs text-white/70"><L en="Faster shopping, order & service updates" ml="വേഗത്തിൽ ഷോപ്പിംഗ്, അപ്ഡേറ്റുകൾ" /></p>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (installEvent) {
              if (await promptInstall()) setVisible(false);
            } else if (ios) setSteps(true);
          }}
          className="h-9 shrink-0 rounded-full bg-gold px-4 text-sm font-bold text-deep"
        >
          <L en="Install" ml="ഇൻസ്റ്റാൾ" />
        </button>
        <button type="button" onClick={close} aria-label="Not now" className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10">
          <X className="size-4" />
        </button>
      </div>
      {steps ? <IosSteps onClose={() => setSteps(false)} /> : null}
    </>
  );
}
