/**
 * Meta Pixel helpers (browser only). The Pixel ID is public (it is in every page's HTML).
 * Events only leave the browser after the visitor accepts tracking (fbq "consent" API);
 * before that, fbq is told to hold them back.
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1146440381266453";
export const CONSENT_KEY = "kingday.tracking.consent"; // "granted" | "denied"

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown };
declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export type PixelItem = { id: string; name?: string; price: number; quantity: number };

/** Paise → rupees with two decimals, as Meta expects. */
export const rupees = (paise: number) => Math.round(paise) / 100;

/** Standard e-commerce parameters for a list of items (prices in paise). */
export function contentParams(items: PixelItem[], value?: number) {
  return {
    content_type: "product",
    content_ids: items.map((i) => i.id),
    contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: rupees(i.price) })),
    num_items: items.reduce((n, i) => n + i.quantity, 0),
    value: rupees(value ?? items.reduce((s, i) => s + i.price * i.quantity, 0)),
    currency: "INR",
    ...(items.length === 1 && items[0].name ? { content_name: items[0].name } : {}),
  };
}

/** Sends a standard event. `eventID` lets Meta drop duplicates of the same event. */
export function track(event: string, params?: Record<string, unknown>, eventID?: string) {
  if (typeof window === "undefined") return;
  const send = () => {
    if (eventID) window.fbq!("track", event, params ?? {}, { eventID });
    else window.fbq!("track", event, params ?? {});
  };
  if (typeof window.fbq === "function") return send();
  // The base code loads after the page becomes interactive: wait for it (up to 10 s).
  let tries = 0;
  const t = window.setInterval(() => {
    if (typeof window.fbq === "function") {
      window.clearInterval(t);
      send();
    } else if (++tries > 100) window.clearInterval(t);
  }, 100);
}

export function readConsent(): "granted" | "denied" | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}
