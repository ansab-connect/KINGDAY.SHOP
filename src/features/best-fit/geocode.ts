"use server";

import { assertCan } from "@/features/auth/session";

/** PIN code or place name → map point (OpenStreetMap), for the shop base location. */
export async function findPlaceAction(input: { pin: string; place?: string }): Promise<{ ok: true; lat: number; lng: number; label: string } | { ok: false; error: string }> {
  try {
    await assertCan("settings", "edit");
  } catch {
    return { ok: false, error: "Only Super Admin can change this." };
  }
  const pin = String(input.pin ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(pin)) return { ok: false, error: "Enter a 6-digit PIN code." };
  const place = String(input.place ?? "").trim().slice(0, 80);
  const urls = [
    ...(place ? [`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(`${place} ${pin}`)}`] : []),
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&postalcode=${pin}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "KingDayStore/1.0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
      const [hit] = ((await res.json()) as { lat: string; lon: string; display_name: string }[]) ?? [];
      if (hit) return { ok: true, lat: Number(Number(hit.lat).toFixed(6)), lng: Number(Number(hit.lon).toFixed(6)), label: hit.display_name };
    } catch {
      /* try the next one */
    }
  }
  return { ok: false, error: "Couldn't find that PIN code. Check it, or use the location button." };
}
