"use client";

import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { setUpdateReady, startPwaState, usePwa } from "./pwa-state";

/**
 * Registers the service worker (production, HTTPS or localhost) and offers a
 * one-tap update when a new version is waiting. Updates never apply mid-session
 * on their own, so a half-filled form is never lost.
 */
export function PwaManager() {
  const { updateReady } = usePwa();
  const reloading = useRef(false);

  useEffect(() => {
    startPwaState();
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (!enabled || !("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      if (!reloading.current) return; // only reload after the user asked to update
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        const watch = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener("statechange", () => {
            // A new version is ready and an older one controls the page: offer the update.
            if (w.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(w);
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(reg.waiting);
        reg.addEventListener("updatefound", () => watch(reg.installing));
        // Check for a newer version when the app comes back to the foreground.
        const onVisible = () => document.visibilityState === "visible" && reg.update().catch(() => {});
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => {
        /* registration failed (e.g. private mode): the site works without it */
      });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!updateReady) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-deep px-4 py-3 text-sm text-white shadow-lift lg:bottom-6">
      <span className="flex-1">A new version of KING DAY is ready.</span>
      <button
        type="button"
        onClick={() => {
          reloading.current = true;
          updateReady.postMessage({ type: "SKIP_WAITING" });
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 font-semibold text-deep"
      >
        <RefreshCw aria-hidden className="size-4" /> Update
      </button>
    </div>
  );
}
