"use server";

import { z } from "zod";
import { assertCan } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Which of these SKUs already exist (any product, any status)? Used to stop duplicate imports. */
export async function findExistingSkus(skus: string[]): Promise<{ ok: true; existing: string[] } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: true, existing: [] };
  try {
    await assertCan("products", "view");
  } catch {
    return { ok: false, error: "You don't have permission to import products." };
  }
  const list = z.array(z.string().trim().toUpperCase().max(40)).max(2000).safeParse(skus);
  if (!list.success) return { ok: false, error: "Too many rows. Import at most 2,000 at a time." };
  const unique = [...new Set(list.data.filter(Boolean))];
  const existing: string[] = [];
  const supabase = await createClient();
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase.from("product_variants").select("sku").in("sku", unique.slice(i, i + 200));
    if (error) return { ok: false, error: "Couldn't check SKUs. Please try again." };
    existing.push(...((data ?? []) as { sku: string }[]).map((r) => r.sku));
  }
  return { ok: true, existing };
}
