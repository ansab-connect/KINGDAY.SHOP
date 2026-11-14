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
    supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
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
  const p = profile as { full_name: string | null; phone: string | null } | null;
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
