"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

/** Warranty and cycle size for cart/checkout lines (read-only, public data). */
export type LineExtra = { warranty: string | null; cycle_size: string | null };

const cache = new Map<string, LineExtra>();
const pending = new Map<string, Promise<void>>();

async function load(ids: string[]) {
  const missing = ids.filter((id) => !cache.has(id) && !pending.has(id));
  if (!missing.length) {
    await Promise.all(ids.map((id) => pending.get(id)));
    return;
  }
  const p = (async () => {
    const { data } = await createClient().rpc("line_extras", { p_variants: missing });
    for (const id of missing) cache.set(id, { warranty: null, cycle_size: null });
    for (const r of (data ?? []) as ({ variant_id: string } & LineExtra)[]) cache.set(r.variant_id, { warranty: r.warranty, cycle_size: r.cycle_size });
  })().catch(() => undefined);
  for (const id of missing) pending.set(id, p);
  await p;
  for (const id of missing) pending.delete(id);
}

export function useLineExtra(variantId: string): LineExtra | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured || cache.has(variantId) || !/^[0-9a-f-]{36}$/.test(variantId)) return;
    let alive = true;
    void load([variantId]).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [variantId]);
  return cache.get(variantId) ?? null;
}
