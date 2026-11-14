"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps live lists current (new bookings, job assignments, status updates):
 * re-fetches the page's server data every `seconds` while the tab is visible,
 * and immediately when the user returns to the tab or app.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router, seconds]);
  return null;
}
