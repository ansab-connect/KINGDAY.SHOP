import "server-only";

/**
 * Road routing through an OSRM-compatible server (self-hosted OSRM, or a hosted provider
 * that speaks the OSRM API). Set ROUTING_OSRM_URL, e.g. https://osrm.example.com.
 * Without it, no distance is invented: callers get `{ ok: false, reason: "not_configured" }`.
 * Straight-line distance is never used for billing.
 */
export type Point = { lat: number; lng: number };
export type Leg = { km: number; minutes: number };
export type RoutingError = { ok: false; reason: "not_configured" | "no_route" | "failed"; message: string };

const BASE = process.env.ROUTING_OSRM_URL?.replace(/\/+$/, "") ?? "";
export const routingProvider = BASE ? `osrm:${URL.canParse(BASE) ? new URL(BASE).host : "custom"}` : null;

const coords = (pts: Point[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
const notConfigured: RoutingError = { ok: false, reason: "not_configured", message: "No road-routing provider is configured (set ROUTING_OSRM_URL)." };

const isErr = (r: Record<string, unknown> | RoutingError): r is RoutingError => (r as RoutingError).ok === false;

async function call(path: string): Promise<Record<string, unknown> | RoutingError> {
  if (!BASE) return notConfigured;
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || json.code !== "Ok") return { ok: false, reason: "no_route", message: `Routing provider: ${String(json.message ?? json.code ?? res.status)}` };
    return json;
  } catch {
    return { ok: false, reason: "failed", message: "The routing provider did not answer. Try again." };
  }
}

/** One-way road distance between two points. */
export async function roadDistance(from: Point, to: Point): Promise<({ ok: true } & Leg) | RoutingError> {
  const r = await call(`/route/v1/driving/${coords([from, to])}?overview=false`);
  if (isErr(r)) return r;
  const route = (r.routes as { distance: number; duration: number }[])[0];
  return { ok: true, km: Math.round(route.distance / 10) / 100, minutes: Math.round(route.duration / 60) };
}

/**
 * Optimised multi-stop route from the base through every stop (OSRM "trip", start fixed at
 * the base). Returns the visiting order and each leg from the provider.
 */
export async function optimiseRoute(base: Point, stops: Point[]): Promise<({ ok: true; order: number[]; legs: Leg[]; km: number; minutes: number; geometry: unknown }) | RoutingError> {
  if (stops.length === 0) return { ok: false, reason: "no_route", message: "Add at least one stop." };
  const r = await call(`/trip/v1/driving/${coords([base, ...stops])}?source=first&roundtrip=true&overview=simplified&geometries=geojson`);
  if (isErr(r)) return r;
  const waypoints = r.waypoints as { waypoint_index: number }[];
  const trip = (r.trips as { distance: number; duration: number; legs: { distance: number; duration: number }[]; geometry: unknown }[])[0];
  // waypoints[i] is input point i; waypoint_index is its position in the trip (0 = base).
  const order = waypoints.slice(1).map((w, i) => ({ i, pos: w.waypoint_index })).sort((a, b) => a.pos - b.pos).map((x) => x.i);
  // OSRM only optimises open trips with a fixed end, so ask for a round trip and drop the
  // final leg back to the base: totals cover base → last stop only.
  const legs = trip.legs.slice(0, stops.length).map((l) => ({ km: Math.round(l.distance / 10) / 100, minutes: Math.round(l.duration / 60) }));
  return {
    ok: true,
    order,
    legs,
    km: Math.round(legs.reduce((n, l) => n + l.km, 0) * 100) / 100,
    minutes: legs.reduce((n, l) => n + l.minutes, 0),
    geometry: trip.geometry,
  };
}
