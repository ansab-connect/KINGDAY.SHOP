import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Purchase } from "@/components/store/service/booking-form";

export type BookingRow = {
  id: string;
  booking_code: string;
  customer_id: string | null;
  customer_name: string;
  mobile: string;
  email: string | null;
  category: string;
  purchase_source: string;
  order_id: string | null;
  product_name: string;
  purchase_date: string | null;
  purchase_details: string | null;
  complaint: string | null;
  voice_path: string | null;
  photo_paths: string[];
  address: string;
  latitude: number | null;
  longitude: number | null;
  preferred_date: string;
  status: string;
  assigned_to: string | null;
  assigned_at: string | null;
  created_at: string;
};

/** Prefill for the booking form: profile, default address and the customer's own KING DAY purchases. */
export async function getBookingPrefill(userId: string) {
  const supabase = await createClient();
  const [{ data: profile }, { data: address }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, customer_code").eq("id", userId).maybeSingle(),
    supabase
      .from("addresses")
      .select("line1, line2, landmark, city, state, postal_code")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, order_number, placed_at, status, order_items(id, product_name, variant_name)")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .order("placed_at", { ascending: false })
      .limit(30),
  ]);
  const p = profile as { full_name: string | null; phone: string | null; customer_code: string | null } | null;
  const a = address as { line1: string; line2: string | null; landmark: string | null; city: string; state: string; postal_code: string } | null;
  const purchases: Purchase[] = [];
  for (const o of (orders ?? []) as { id: string; order_number: string; placed_at: string; order_items: { id: string; product_name: string; variant_name: string | null }[] }[]) {
    for (const it of o.order_items ?? []) {
      purchases.push({
        key: it.id,
        orderId: o.id,
        orderNumber: o.order_number,
        productName: it.variant_name ? `${it.product_name} (${it.variant_name})` : it.product_name,
        placedAt: o.placed_at,
      });
    }
  }
  return {
    name: p?.full_name ?? "",
    mobile: p?.phone ?? "",
    code: p?.customer_code ?? "",
    address: a ? [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.postal_code}`].filter(Boolean).join(", ") : "",
    purchases,
  };
}

export async function getMyBookings(): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_bookings").select("*").order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as BookingRow[];
}

/** Signed URLs for a booking's photos and voice note (RLS decides who may read them). */
export async function bookingMedia(b: Pick<BookingRow, "photo_paths" | "voice_path">) {
  const supabase = await createClient();
  const store = supabase.storage.from("service-media");
  const sign = async (p: string) => (await store.createSignedUrl(p, 60 * 30)).data?.signedUrl ?? null;
  const [voice, ...photos] = await Promise.all([b.voice_path ? sign(b.voice_path) : Promise.resolve(null), ...b.photo_paths.map(sign)]);
  return { voice, photos: photos.filter(Boolean) as string[] };
}

export type JobEvent = { id: number; status: string; note: string | null; actor_code: string | null; actor_id: string | null; created_at: string };

export async function getJobEvents(bookingId: string): Promise<JobEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_job_events")
    .select("id, status, note, actor_code, actor_id, created_at")
    .eq("booking_id", bookingId)
    .order("created_at");
  return (data ?? []) as JobEvent[];
}

export type Inspection = {
  problem_found: string | null;
  work_performed: string | null;
  spare_parts: string | null;
  notes: string | null;
  before_photos: string[];
  after_photos: string[];
  confirmed_by: string | null;
  signature_path: string | null;
  confirmed_at: string | null;
  updated_at: string;
};

/** Inspection report with signed URLs for its photos and signature. */
export async function getInspection(bookingId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("service_inspections").select("*").eq("booking_id", bookingId).maybeSingle();
  const i = data as Inspection | null;
  if (!i) return null;
  const store = supabase.storage.from("service-media");
  const sign = async (p: string) => ({ path: p, url: (await store.createSignedUrl(p, 60 * 30)).data?.signedUrl ?? null });
  const [before, after, sig] = await Promise.all([
    Promise.all(i.before_photos.map(sign)),
    Promise.all(i.after_photos.map(sign)),
    i.signature_path ? sign(i.signature_path) : Promise.resolve(null),
  ]);
  return { ...i, before, after, signature: sig };
}

export type Technician = { user_id: string; full_name: string | null; staff_code: string | null; phone: string | null; open_jobs: number; completed_30d: number; completed_total: number };

export async function listTechnicians(): Promise<Technician[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_service_technicians");
  return ((data ?? []) as Technician[]).map((t) => ({ ...t, open_jobs: Number(t.open_jobs), completed_30d: Number(t.completed_30d), completed_total: Number(t.completed_total) }));
}
