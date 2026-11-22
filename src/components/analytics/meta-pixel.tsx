"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CONSENT_KEY, contentParams, META_PIXEL_ID, readConsent, track, type PixelItem } from "@/lib/meta-pixel";

/**
 * Meta Pixel base code (official snippet), loaded once for the store. Consent is revoked
 * until the visitor accepts, so nothing is sent before that. The base code sends the first
 * PageView; later client-side navigations send one PageView per new URL.
 */
export function MetaPixel() {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq.disablePushState=true;
try{if(localStorage.getItem('${CONSENT_KEY}')!=='granted')fbq('consent','revoke');}catch(e){fbq('consent','revoke');}
fbq('init','${META_PIXEL_ID}');
fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element -- official Pixel fallback */}
        <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
      <Suspense fallback={null}>
        <RoutePageViews />
      </Suspense>
      <ConsentBanner />
    </>
  );
}

/** One PageView per client-side URL change (the first one comes from the base code). */
function RoutePageViews() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const url = `${pathname}?${search}`;
    if (last.current === null) {
      last.current = url;
      return;
    }
    if (last.current === url) return;
    last.current = url;
    window.fbq?.("track", "PageView");
  }, [pathname, search]);
  return null;
}

function ConsentBanner() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOpen(readConsent() === null), 0);
    return () => window.clearTimeout(t);
  }, []);
  if (!open) return null;
  const choose = (granted: boolean) => {
    try {
      localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
    } catch {
      // Storage blocked: the choice applies to this page only.
    }
    window.fbq?.("consent", granted ? "grant" : "revoke");
    setOpen(false);
  };
  return (
    <div role="dialog" aria-label="Cookie choice" className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border bg-white p-4 text-sm shadow-2xl lg:bottom-6">
      <p className="text-deep">
        We use cookies, including the Meta Pixel, to measure our ads and show you relevant offers.{" "}
        <Link href="/policies/privacy" className="font-semibold text-royal underline-offset-2 hover:underline">Privacy policy</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose(false)} className="h-10 flex-1 rounded-full border text-sm font-semibold text-deep hover:bg-muted">
          Decline
        </button>
        <button type="button" onClick={() => choose(true)} className="h-10 flex-1 rounded-full bg-royal text-sm font-semibold text-white hover:bg-royal-800">
          Accept
        </button>
      </div>
    </div>
  );
}

const PURCHASED_KEY = "kingday.pixel.purchased";

/**
 * Purchase, once per order. Rendered only by the order success page, which the server shows
 * after a verified online payment (or a confirmed COD order). The order number is also the
 * event ID, so Meta drops any repeat.
 */
export function PurchaseEvent({ orderNumber, value, items }: { orderNumber: string; value: number; items: PixelItem[] }) {
  useEffect(() => {
    let done: string[] = [];
    try {
      done = JSON.parse(localStorage.getItem(PURCHASED_KEY) ?? "[]");
    } catch {
      done = [];
    }
    if (done.includes(orderNumber)) return;
    track("Purchase", { ...contentParams(items, value), order_id: orderNumber }, `purchase-${orderNumber}`);
    try {
      localStorage.setItem(PURCHASED_KEY, JSON.stringify([...done, orderNumber].slice(-50)));
    } catch {
      // ignore
    }
  }, [orderNumber, value, items]);
  return null;
}
