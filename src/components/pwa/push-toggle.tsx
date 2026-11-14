"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/features/push/actions";
import { cn } from "@/lib/utils";
import { usePwa } from "./pwa-state";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Turn phone notifications on/off for this device (orders, shipping, service, reminders). */
export function PushToggle({ className }: { className?: string }) {
  const { ios, standalone } = usePwa();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!VAPID || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })();
  }, [ios, standalone]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });
      const res = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
      if (!res.ok) {
        await sub.unsubscribe();
        throw new Error(res.error);
      }
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border bg-white p-4", className)}>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", status === "on" ? "bg-success-soft text-success" : "bg-royal-50 text-royal")}>
          {status === "on" ? <BellRing aria-hidden className="size-5" /> : <BellOff aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-deep"><L en="Phone notifications" ml="ഫോൺ നോട്ടിഫിക്കേഷനുകൾ" /></p>
          <p className="text-xs text-muted-foreground">
            {status === "on" ? (
              <L en="On for this device." ml="ഈ ഉപകരണത്തിൽ ഓൺ ആണ്." />
            ) : status === "denied" ? (
              <L en="Blocked in your browser settings. Allow notifications for this site to turn them on." ml="ബ്രൗസർ സെറ്റിംഗ്സിൽ ബ്ലോക്ക് ചെയ്തിരിക്കുന്നു." />
            ) : status === "ios-install" ? (
              <L en="On iPhone, first add KING DAY to your Home Screen, then open it from there." ml="iPhone-ൽ ആദ്യം ഹോം സ്ക്രീനിൽ ചേർക്കുക." />
            ) : status === "unsupported" ? (
              <L en="This browser doesn't support notifications." ml="ഈ ബ്രൗസർ പിന്തുണയ്ക്കുന്നില്ല." />
            ) : (
              <L en="Get order, delivery and service updates instantly." ml="ഓർഡർ, ഡെലിവറി, സർവീസ് അപ്ഡേറ്റുകൾ ഉടൻ അറിയൂ." />
            )}
          </p>
        </div>
        {status === "on" || status === "off" ? (
          <button
            type="button"
            onClick={status === "on" ? turnOff : turnOn}
            disabled={busy}
            className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-60", status === "on" ? "border text-deep hover:bg-muted" : "bg-royal text-white hover:bg-royal-800")}
          >
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {status === "on" ? <L en="Turn off" ml="ഓഫ്" /> : <L en="Turn on" ml="ഓൺ" />}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
