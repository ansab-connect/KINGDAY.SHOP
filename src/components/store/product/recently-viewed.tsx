"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { L } from "@/components/i18n/lang";
import { formatPaise } from "@/lib/format";

type Seen = { slug: string; name: string; image: string | null; price: number; mrp: number };
const KEY = "kingday.recent.v1";

let cacheRaw: string | null = null;
let cacheVal: Seen[] = [];
const EMPTY: Seen[] = [];

function read(): Seen[] {
  try {
    const raw = localStorage.getItem(KEY) ?? "[]";
    if (raw !== cacheRaw) {
      const v = JSON.parse(raw);
      cacheRaw = raw;
      cacheVal = Array.isArray(v) ? v.filter((x) => x && typeof x.slug === "string").slice(0, 12) : [];
    }
    return cacheVal;
  } catch {
    return EMPTY;
  }
}

/** Remembers this product in the browser and shows the others viewed before it. */
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function RecentlyViewed({ current }: { current: Seen }) {
  const all = useSyncExternalStore(subscribe, read, () => EMPTY);
  const items = all.filter((x) => x.slug !== current.slug).slice(0, 8);

  useEffect(() => {
    const before = read().filter((x) => x.slug !== current.slug);
    try {
      localStorage.setItem(KEY, JSON.stringify([current, ...before].slice(0, 12)));
      listeners.forEach((l) => l());
    } catch {
      /* storage unavailable: nothing to remember */
    }
  }, [current]);

  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading" className="mt-16">
      <h2 id="recent-heading" className="mb-4 text-xl font-bold text-deep">
        <L en="Recently viewed" ml="അടുത്തിടെ കണ്ടവ" />
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((p) => (
          <li key={p.slug} className="w-36 shrink-0 snap-start sm:w-44">
            <Link href={`/products/${p.slug}`} className="flex flex-col overflow-hidden rounded-xl border bg-white hover:shadow-lift">
              <span className="aspect-square bg-canvas">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small thumbnails from our own storage
                  <img src={p.image} alt="" loading="lazy" className="size-full object-cover" />
                ) : null}
              </span>
              <span className="flex flex-col gap-0.5 p-2">
                <span className="line-clamp-2 text-xs font-semibold text-deep">{p.name}</span>
                <span className="text-sm font-bold text-deep tabular">{formatPaise(p.price)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
