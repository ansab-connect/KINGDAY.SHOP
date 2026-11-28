"use server";

import { assertCan } from "@/features/auth/session";
import { geocodePin } from "@/lib/geocode";

/** PIN code or place name → map point (OpenStreetMap), for the shop base location. */
export async function findPlaceAction(input: { pin: string; place?: string }): Promise<{ ok: true; lat: number; lng: number; label: string } | { ok: false; error: string }> {
  try {
    await assertCan("settings", "edit");
  } catch {
    return { ok: false, error: "Only Super Admin can change this." };
  }
  if (!/^\d{6}$/.test(String(input.pin ?? "").replace(/\D/g, ""))) return { ok: false, error: "Enter a 6-digit PIN code." };
  const hit = await geocodePin(input.pin, input.place ?? "");
  return hit ? { ok: true, ...hit } : { ok: false, error: "Couldn't find that PIN code. Check it, or use the location button." };
}
