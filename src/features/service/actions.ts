"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { formatMobile, normalizeMobile } from "@/features/customer/mobile";

const phone = z.string().trim().regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid mobile number.");
const mediaPath = z.string().regex(/^[0-9a-f-]{36}\/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png|webm|ogg|mp4|m4a|mp3)$/);

const bookingSchema = z
  .object({
    customer_name: z.string().trim().min(2, "Enter your name.").max(120),
    mobile: phone,
    email: z.union([z.literal(""), z.email("Enter a valid email.").max(254)]),
    category: z.enum(["jeep", "bike", "scooter", "cycle", "toys"], "Choose a category."),
    purchase_source: z.enum(["kingday", "external"]),
    order_id: z.union([z.literal(""), z.uuid()]),
    product_name: z.string().trim().min(2, "Enter the product name.").max(200),
    purchase_date: z.union([z.literal(""), z.iso.date()]),
    purchase_details: z.string().trim().max(500),
    complaint: z.string().trim().max(3000),
    voice_path: z.union([z.literal(""), mediaPath]),
    photo_paths: z.array(mediaPath).max(4),
    address: z.string().trim().min(5, "Enter the service address.").max(500),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    preferred_date: z.iso.date("Choose a date."),
    service_type: z.enum(["repair", "general_service", "battery", "installation", "inspection", "other"]).default("repair"),
    preferred_time: z.union([z.literal(""), z.enum(["morning", "afternoon", "evening"])]).default(""),
  })
  .refine((v) => v.complaint.length >= 5 || v.voice_path, { path: ["complaint"], message: "Describe the problem or record a voice note." })
  .refine((v) => v.purchase_source === "external" || v.order_id, { path: ["order_id"], message: "Choose the order, or pick “Bought elsewhere”." });

export type BookingResult = { ok: true; code: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Parsed = z.infer<typeof bookingSchema>;

/**
 * Validates the booking and makes sure the customer's profile holds their name and
 * mobile (saved once, never asked again). Returns the validated data or an error.
 */
async function prepare(input: unknown): Promise<{ ok: true; v: Parsed; userId: string } | Extract<BookingResult, { ok: false }>> {
  if (!isSupabaseConfigured) return { ok: false, error: "Booking opens soon." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please sign in to book a service." };
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "_")] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const own = (p: string) => p.startsWith(`${user.id}/`);
  if (!v.photo_paths.every(own) || (v.voice_path && !own(v.voice_path))) return { ok: false, error: "Invalid upload. Please try again." };
  const mobile = normalizeMobile(v.mobile);
  if (!mobile) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { mobile: "Enter a valid mobile number." } };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
  const p = profile as { full_name: string | null; phone: string | null } | null;
  if (!p?.full_name || !p.phone) {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: p?.full_name || v.customer_name, phone: p?.phone || formatMobile(mobile) })
      .eq("id", user.id);
    if (error?.code === "23505") {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { mobile: "This mobile number belongs to another account. Sign in with it instead." } };
    }
  }
  return { ok: true, v: { ...v, customer_name: p?.full_name || v.customer_name, mobile: p?.phone || formatMobile(mobile) }, userId: user.id };
}

export async function createServiceBookingAction(input: unknown): Promise<BookingResult> {
  const prep = await prepare(input);
  if (!prep.ok) return prep;
  const v = prep.v;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_service_booking", {
    p: { ...v, latitude: v.latitude ?? "", longitude: v.longitude ?? "" },
  });
  if (error) {
    const msg = /too many open/i.test(error.message)
      ? "You already have 5 open bookings. Please wait for them to be completed."
      : /preferred date/i.test(error.message)
        ? "Choose a date within the next 90 days."
        : /order not found/i.test(error.message)
          ? "That order wasn't found on your account."
          : "Couldn't save the booking. Please try again.";
    return { ok: false, error: msg };
  }
  refresh();
  return { ok: true, code: data as string };
}

export async function cancelServiceBookingAction(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid booking." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_service_booking", { p_id: id });
  if (error) return { ok: false, error: "This booking can no longer be cancelled. Please call us." };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- Service cart (independent of the product cart)
export async function addToServiceCartAction(input: unknown): Promise<BookingResult> {
  const prep = await prepare(input);
  if (!prep.ok) return prep;
  const v = prep.v;
  const supabase = await createClient();
  const { error } = await supabase.from("service_cart_items").insert({
    user_id: prep.userId,
    category: v.category,
    service_type: v.service_type,
    purchase_source: v.order_id ? "kingday" : v.purchase_source,
    order_id: v.order_id || null,
    product_name: v.product_name,
    purchase_date: v.purchase_date || null,
    purchase_details: v.purchase_details || null,
    complaint: v.complaint || null,
    voice_path: v.voice_path || null,
    photo_paths: v.photo_paths,
    address: v.address,
    latitude: v.latitude,
    longitude: v.longitude,
    preferred_date: v.preferred_date,
    preferred_time: v.preferred_time || null,
  });
  if (error) return { ok: false, error: /full/i.test(error.message) ? "Your service cart holds up to 5 items. Book them first." : "Couldn't add to the service cart." };
  refresh();
  return { ok: true, code: "" };
}

export async function removeServiceCartItemAction(id: string): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("service_cart_items").delete().eq("id", id);
  refresh();
  return { ok: !error };
}

export async function checkoutServiceCartAction(): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Booking opens soon." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("checkout_service_cart");
  if (error) {
    const m = error.message;
    return {
      ok: false,
      error: /too many open/i.test(m)
        ? "You can have up to 5 open bookings. Remove some items or wait for current jobs to finish."
        : /preferred date/i.test(m)
          ? "One item's date has passed. Remove it and add it again with a new date."
          : /name and mobile/i.test(m)
            ? "Add your name and mobile number in My Profile first."
            : /empty/i.test(m)
              ? "Your service cart is empty."
              : "Couldn't book. Please try again.",
    };
  }
  refresh();
  return { ok: true, codes: (data ?? []) as string[] };
}
