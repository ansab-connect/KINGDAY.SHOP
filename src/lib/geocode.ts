import "server-only";

/** Indian PIN code (optionally with a place name) → map point, via OpenStreetMap. Null if not found. */
export async function geocodePin(pin: string, place = ""): Promise<{ lat: number; lng: number; label: string } | null> {
  const code = String(pin ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const q = place.trim().slice(0, 80);
  const urls = [
    ...(q ? [`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(`${q} ${code}`)}`] : []),
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&postalcode=${code}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "KingDayStore/1.0" }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
      const [hit] = ((await res.json()) as { lat: string; lon: string; display_name: string }[]) ?? [];
      if (hit) return { lat: Number(Number(hit.lat).toFixed(6)), lng: Number(Number(hit.lon).toFixed(6)), label: hit.display_name };
    } catch {
      /* try the next one */
    }
  }
  return null;
}
