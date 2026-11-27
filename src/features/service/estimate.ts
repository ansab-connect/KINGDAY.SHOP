"use server";

import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { roadDistance } from "@/lib/routing";
import { createAdminClient } from "@/lib/supabase/admin";

export type VisitEstimateResult = { ok: true; km: number; chargePaise: number | null } | { ok: false };

/**
 * Approximate home-visit distance (road route from the KING DAY base) and the inspection
 * charge from the active slab, for the booking form. Signed-in customers only; read-only.
 * The real charge always uses the verified distance on the pre-invoice.
 */
export async function estimateVisitAction(input: { lat: number; lng: number }): Promise<VisitEstimateResult> {
  const p = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse(input);
  if (!p.success || !(await getCurrentUser())) return { ok: false };
  const admin = createAdminClient();
  const { data: base } = await admin.from("store_settings").select("value").eq("key", "best_fit.base_location").maybeSingle();
  const b = (base as { value: { lat: number | null; lng: number | null } } | null)?.value;
  if (b?.lat == null || b?.lng == null) return { ok: false };
  const r = await roadDistance({ lat: Number(b.lat), lng: Number(b.lng) }, p.data);
  if (!r.ok) return { ok: false };
  const today = new Date().toISOString().slice(0, 10);
  const { data: slabs } = await admin
    .from("inspection_slabs")
    .select("min_km, max_km, rate_paise, effective_from, effective_to")
    .eq("is_active", true)
    .lte("min_km", r.km)
    .lte("effective_from", today)
    .order("min_km", { ascending: false });
  // Same rule as the database: the active slab with the highest start at or below the distance.
  const slab = ((slabs ?? []) as { rate_paise: number; effective_to: string | null }[]).find((s) => !s.effective_to || s.effective_to >= today);
  return { ok: true, km: r.km, chargePaise: slab ? Math.round(r.km * slab.rate_paise) : null };
}
