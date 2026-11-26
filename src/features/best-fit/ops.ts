"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { queuePushDispatch } from "@/features/push/send";
import { isSupabaseConfigured } from "@/lib/env";
import { optimiseRoute, roadDistance, routingProvider, type Point } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * One server action for the Service Management / BEST FIT / Accounts screens.
 * Every operation is whitelisted here; the database enforces who may do it
 * (RLS + security-definer functions), validates the numbers and writes the audit log.
 */
export type OpResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };
type V = Record<string, unknown>;

type TableOp = { table: string; cols: string[]; key?: string };
const TABLES: Record<string, TableOp> = {
  centre: { table: "service_centres", cols: ["name", "address", "town", "latitude", "longitude", "phone", "email", "working_hours", "sort_order", "is_active"] },
  mode: { table: "service_modes", key: "slug", cols: ["slug", "title", "title_ml", "description", "icon", "kind", "sort_order", "is_active"] },
  slab: { table: "inspection_slabs", cols: ["code", "min_km", "max_km", "rate_paise", "description", "effective_from", "effective_to", "is_active"] },
  payslab: { table: "technician_payment_slabs", cols: ["name", "mode", "min_km", "max_km", "fixed_paise", "per_km_paise", "scope", "technician_id", "group_id", "description", "effective_from", "effective_to", "is_active"] },
  charge: { table: "service_charge_settings", cols: ["name", "amount_paise", "technician_pct", "company_pct", "effective_from", "effective_to", "is_active"] },
  group: { table: "technician_groups", cols: ["name", "kind", "leader_id", "service_area", "skills", "notes", "is_active"] },
  member: { table: "technician_group_members", cols: ["group_id", "user_id"], key: "*" },
  centrestaff: { table: "service_centre_staff", cols: ["centre_id", "user_id"], key: "*" },
  techsettings: { table: "technician_settings", key: "user_id", cols: ["user_id", "skills", "service_areas", "max_daily_tasks", "is_available", "base_latitude", "base_longitude"] },
  route: { table: "route_plans", cols: ["notes", "plan_date"] },
};

type RpcOp = { fn: string; args: (v: V) => V; push?: boolean; ok?: string };
const RPCS: Record<string, RpcOp> = {
  "setting.save": { fn: "save_best_fit_setting", args: (v) => ({ p_key: v.key, p_value: v.value }) },
  "distance.verify": { fn: "set_verified_distance", args: (v) => ({ p_booking: v.booking_id, p_km: v.km, p_reason: v.reason ?? null }) },
  "preinvoice.create": { fn: "create_inspection_pre_invoice", args: (v) => ({ p_booking: v.booking_id }), push: true, ok: "Pre-invoice created." },
  "preinvoice.void": { fn: "void_inspection_pre_invoice", args: (v) => ({ p_id: v.id, p_reason: v.reason }) },
  "payment.record": { fn: "record_service_payment", args: (v) => ({ p: v }), push: true, ok: "Payment recorded." },
  "wo.assign": { fn: "assign_work_order", args: (v) => ({ p: v }), push: true, ok: "Work order created." },
  "wo.schedule": { fn: "schedule_work_order", args: (v) => ({ p_id: v.id, p_date: v.scheduled_date, p_slot: v.scheduled_slot ?? null }), push: true },
  "route.review": { fn: "review_route_plan", args: (v) => ({ p_id: v.id, p_action: v.action }), push: true },
  "rule.save": { fn: "save_commission_rule", args: (v) => ({ p: v }), ok: "Commission rule saved." },
  "rule.active": { fn: "set_commission_rule_active", args: (v) => ({ p_id: v.id, p_active: v.active }) },
  "earnings.finalize": { fn: "finalize_service_earnings", args: (v) => ({ p_invoice: v.invoice_id, p_custom_travel: v.custom_travel_paise ?? null }), push: true, ok: "Earnings finalised and assigned." },
  "earnings.reverse": { fn: "reverse_service_earnings", args: (v) => ({ p_invoice: v.invoice_id, p_reason: v.reason }), push: true, ok: "Earnings reversed." },
  claim: { fn: "claim_technician_invoice", args: (v) => ({ p_id: v.id }), push: true, ok: "Claimed. Your wallet is credited." },
  payout: { fn: "record_staff_payout", args: (v) => ({ p: v }), push: true, ok: "Payout recorded." },
  "reclaim.save": { fn: "save_reclaim", args: (v) => ({ p: v }), push: true, ok: "Reclaim saved." },
  "reclaim.review": { fn: "review_reclaim", args: (v) => ({ p_id: v.id, p_decision: v.decision, p_amount: v.amount_paise ?? null, p_note: v.note ?? null }), push: true },
  "reclaim.pay": { fn: "mark_reclaim_paid", args: (v) => ({ p_id: v.id, p_method: v.method, p_reference: v.reference ?? null }), push: true },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function message(e: { code?: string; message: string }): string {
  // Messages raised by our own functions/triggers are written for people; show them.
  if (["P0001", "22023", "23514", "42501", "23505", "P0002"].includes(e.code ?? "")) {
    if (e.code === "42501" && /row-level security|permission denied/i.test(e.message)) return "You don't have permission to do that.";
    if (e.code === "23505" && /duplicate key/i.test(e.message)) return "That already exists.";
    if (e.code === "23514" && /violates check constraint/i.test(e.message)) return "Some values aren't allowed. Check the numbers and dates.";
    return e.message.replace(/^ERROR:\s*/, "");
  }
  if (e.code === "23503") return "This record is in use. Deactivate it instead of deleting.";
  return "Couldn't save. Please try again.";
}

const pick = (v: V, cols: string[]) => Object.fromEntries(cols.filter((c) => c in v).map((c) => [c, v[c] === "" ? null : v[c]]));

export async function runOp(op: string, values: V): Promise<OpResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "The database isn't connected." };
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  const supabase = await createClient();
  const v = values ?? {};

  // ---- generic table writes: "<name>.create" | "<name>.update" | "<name>.delete"
  const [name, action] = op.split(".");
  const t = TABLES[name];
  if (t && ["create", "update", "delete"].includes(action)) {
    const key = t.key ?? "id";
    // Link tables ("*"): the row is identified by all its columns, and can only be added or removed.
    if (key === "*") {
      if (!t.cols.every((c) => typeof v[c] === "string" && UUID.test(v[c] as string))) return { ok: false, error: "Choose who to add." };
      let q;
      if (action === "create") q = await supabase.from(t.table).insert(pick(v, t.cols));
      else if (action === "delete") {
        let d = supabase.from(t.table).delete();
        for (const c of t.cols) d = d.eq(c, v[c] as string);
        q = await d;
      } else return { ok: false, error: "Unknown action." };
      if (q.error) return { ok: false, error: message(q.error) };
      refresh();
      return { ok: true, message: action === "delete" ? "Removed." : "Added." };
    }
    if (action !== "create" && (typeof v[key] !== "string" || !v[key])) return { ok: false, error: "Missing record." };
    if (key === "id" && action !== "create" && !UUID.test(String(v.id))) return { ok: false, error: "Invalid record." };
    let res;
    if (action === "create") res = await supabase.from(t.table).insert(pick(v, t.cols));
    else if (action === "update") res = await supabase.from(t.table).update(pick(v, t.cols.filter((c) => c !== key))).eq(key, v[key] as string);
    else res = await supabase.from(t.table).delete().eq(key, v[key] as string);
    if (res.error) return { ok: false, error: message(res.error) };
    refresh();
    return { ok: true, message: action === "delete" ? "Deleted." : "Saved." };
  }
  if (op === "techsettings.upsert") {
    const { error } = await supabase.from("technician_settings").upsert(pick(v, TABLES.techsettings.cols));
    if (error) return { ok: false, error: message(error) };
    refresh();
    return { ok: true, message: "Saved." };
  }

  // ---- road distance from the configured provider (never invented)
  if (op === "distance.estimate") {
    const booking = String(v.booking_id ?? "");
    if (!UUID.test(booking)) return { ok: false, error: "Invalid booking." };
    const [{ data: b }, base] = await Promise.all([
      supabase.from("service_bookings").select("latitude, longitude").eq("id", booking).maybeSingle(),
      baseLocation(),
    ]);
    const bk = b as { latitude: number | null; longitude: number | null } | null;
    if (!bk?.latitude || !bk.longitude) return { ok: false, error: "The customer did not share a map location. Enter the verified distance manually." };
    if (!base) return { ok: false, error: "Set the exact KING DAY base coordinates in Service Configuration first." };
    const r = await roadDistance(base, { lat: bk.latitude, lng: bk.longitude });
    if (!r.ok) return { ok: false, error: r.message };
    const { error } = await supabase.rpc("set_estimated_distance", { p_booking: booking, p_km: r.km, p_source: routingProvider });
    if (error) return { ok: false, error: message(error) };
    refresh();
    return { ok: true, message: `Estimated road distance: ${r.km} km (about ${r.minutes} min).` };
  }

  // ---- route plan: stops in the optimised order, legs from the provider
  if (op === "route.build") return buildRoute(v);

  const rpc = RPCS[op];
  if (!rpc) return { ok: false, error: "Unknown action." };
  const { data, error } = await supabase.rpc(rpc.fn, rpc.args(v));
  if (error) return { ok: false, error: message(error) };
  if (rpc.push) queuePushDispatch();
  refresh();
  return { ok: true, message: rpc.ok ?? (typeof data === "string" ? `Done: ${data}` : "Saved."), data };
}

async function baseLocation(): Promise<Point | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("store_settings").select("value").eq("key", "best_fit.base_location").maybeSingle();
  const b = (data as { value: { lat: number | null; lng: number | null } } | null)?.value;
  return b?.lat != null && b?.lng != null ? { lat: Number(b.lat), lng: Number(b.lng) } : null;
}

async function buildRoute(v: V): Promise<OpResult> {
  const supabase = await createClient();
  const ids = (Array.isArray(v.booking_ids) ? v.booking_ids : []).map(String).filter((x) => UUID.test(x));
  if (!ids.length) return { ok: false, error: "Choose at least one booking." };
  if (ids.length > 30) return { ok: false, error: "A route can have up to 30 stops." };
  const tech = typeof v.technician_id === "string" && UUID.test(v.technician_id) ? v.technician_id : null;
  const group = typeof v.group_id === "string" && UUID.test(v.group_id) ? v.group_id : null;
  if (!tech && !group) return { ok: false, error: "Choose a technician or a group." };
  const date = typeof v.plan_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.plan_date) ? v.plan_date : null;
  if (!date) return { ok: false, error: "Choose the route date." };

  const { data } = await supabase
    .from("service_bookings")
    .select("id, booking_code, customer_name, address, town, latitude, longitude, work_orders(id, status)")
    .in("id", ids);
  const rows = (data ?? []) as { id: string; booking_code: string; customer_name: string; address: string | null; town: string | null; latitude: number | null; longitude: number | null; work_orders: { id: string; status: string }[] }[];
  const mapped = rows.filter((r) => r.latitude != null && r.longitude != null);
  const base = await baseLocation();

  let stops = rows.map((r, i) => ({ booking_id: r.id, booking_code: r.booking_code, work_order_id: r.work_orders?.find((w) => !["cancelled", "reassigned"].includes(w.status))?.id ?? null, seq: i + 1, label: `${r.customer_name} · ${r.town ?? r.address ?? ""}`.slice(0, 160), lat: r.latitude, lng: r.longitude, leg_km: null as number | null, leg_minutes: null as number | null }));
  let total: { km: number | null; minutes: number | null; provider: string | null; geometry: unknown } = { km: null, minutes: null, provider: null, geometry: null };
  let note = "Saved as a draft. No routing provider is configured, so distances and the stop order were not calculated.";
  if (base && mapped.length === rows.length) {
    const r = await optimiseRoute(base, mapped.map((m) => ({ lat: m.latitude as number, lng: m.longitude as number })));
    if (r.ok) {
      stops = r.order.map((idx, i) => ({ ...stops[idx], seq: i + 1, leg_km: r.legs[i]?.km ?? null, leg_minutes: r.legs[i]?.minutes ?? null }));
      total = { km: r.km, minutes: r.minutes, provider: routingProvider, geometry: r.geometry };
      note = `Draft saved: ${r.km} km, about ${r.minutes} min, stops in optimised order.`;
    } else note = `Draft saved without distances: ${r.message}`;
  } else if (!base) note = "Draft saved without distances: set the base coordinates in Service Configuration.";
  else note = "Draft saved without distances: some bookings have no map location.";

  const { error } = await supabase.from("route_plans").insert({
    plan_date: date, technician_id: tech, group_id: group, stops, total_km: total.km, total_minutes: total.minutes,
    provider: total.provider, geometry: total.geometry, notes: typeof v.notes === "string" ? v.notes.slice(0, 500) || null : null,
    start_label: "KING DAY base", start_lat: base?.lat ?? null, start_lng: base?.lng ?? null,
  });
  if (error) return { ok: false, error: message(error) };

  // Optional: create the work orders for every stop (admin's explicit choice, never automatic).
  if (v.assign === true && tech) {
    for (const s of stops) {
      const { error: e } = await supabase.rpc("assign_work_order", { p: { booking_id: s.booking_id, technician_id: tech, group_id: group, scheduled_date: date } });
      if (e) return { ok: false, error: `Route saved, but ${s.booking_code}: ${message(e)}` };
    }
    queuePushDispatch();
  }
  refresh();
  return { ok: true, message: note };
}
