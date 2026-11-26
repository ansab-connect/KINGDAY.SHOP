type Point = { lat: number; lng: number };

/** Straight-line km — ONLY for grouping suggestions, never for billing or route totals. */
export function crowFliesKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Smart grouping suggestions for unassigned home bookings. Bookings are clustered by map
 * position (a straight-line heuristic used ONLY to propose groups — routes and billing use
 * road distances), split to fit a technician's daily capacity, ordered by priority and age,
 * and matched to the best available technician (service area, skills, current workload).
 * Suggestions are never applied automatically.
 */
export type GBooking = { id: string; code: string; lat: number | null; lng: number | null; town: string | null; category: string; priority: string; createdAt: string; label: string };
export type GTech = { id: string; name: string; areas: string[]; skills: string[]; capacity: number; available: boolean; open: number; base: Point | null };
export type GSuggestion = { key: string; bookings: GBooking[]; techId: string | null; reason: string };

const PRIORITY: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function suggestGroups(bookings: GBooking[], techs: GTech[], radiusKm = 12): GSuggestion[] {
  const located = bookings.filter((b) => b.lat != null && b.lng != null);
  const sorted = [...located].sort((a, b) => (PRIORITY[a.priority] ?? 2) - (PRIORITY[b.priority] ?? 2) || a.createdAt.localeCompare(b.createdAt));
  const used = new Set<string>();
  const clusters: GBooking[][] = [];
  for (const seed of sorted) {
    if (used.has(seed.id)) continue;
    const c = [seed];
    used.add(seed.id);
    for (const o of sorted) {
      if (used.has(o.id)) continue;
      if (crowFliesKm({ lat: seed.lat!, lng: seed.lng! }, { lat: o.lat!, lng: o.lng! }) <= radiusKm) {
        c.push(o);
        used.add(o.id);
      }
    }
    clusters.push(c);
  }

  const load = new Map(techs.map((t) => [t.id, t.open]));
  const out: GSuggestion[] = [];
  clusters.forEach((c, ci) => {
    const towns = [...new Set(c.map((b) => (b.town ?? "").toLowerCase()).filter(Boolean))];
    const ranked = techs
      .filter((t) => t.available)
      .map((t) => {
        const areaHit = towns.some((tw) => t.areas.some((a) => a.toLowerCase() === tw));
        const skillHit = c.filter((b) => t.skills.some((s) => b.category.includes(s.toLowerCase()))).length;
        const free = t.capacity - (load.get(t.id) ?? 0);
        const near = t.base ? crowFliesKm(t.base, { lat: c[0].lat!, lng: c[0].lng! }) : 50;
        return { t, free, score: (areaHit ? 30 : 0) + skillHit * 5 + Math.min(free, 10) * 2 - near / 5, areaHit };
      })
      .filter((x) => x.free > 0)
      .sort((a, b) => b.score - a.score);
    // Split big clusters into day-sized chunks for the chosen technician.
    let rest = c;
    let part = 0;
    while (rest.length) {
      const best = ranked.find((r) => r.free > 0);
      const size = Math.max(1, best ? Math.min(best.free, rest.length) : Math.min(6, rest.length));
      const chunk = rest.slice(0, size);
      rest = rest.slice(size);
      if (best) {
        best.free -= chunk.length;
        load.set(best.t.id, (load.get(best.t.id) ?? 0) + chunk.length);
      }
      out.push({
        key: `${ci}-${part++}`,
        bookings: chunk,
        techId: best?.t.id ?? null,
        reason: [
          `${chunk.length} booking(s) within ~${radiusKm} km of each other`,
          towns.length ? `area: ${towns.join(", ")}` : null,
          best ? `suggested: ${best.t.name}${best.areaHit ? " (covers this area)" : ""}, ${best.free + chunk.length} slot(s) free` : "no technician has free capacity",
        ].filter(Boolean).join(" · "),
      });
    }
  });
  return out;
}
