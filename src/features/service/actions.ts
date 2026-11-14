"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

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
  })
  .refine((v) => v.complaint.length >= 5 || v.voice_path, { path: ["complaint"], message: "Describe the problem or record a voice note." })
  .refine((v) => v.purchase_source === "external" || v.order_id, { path: ["order_id"], message: "Choose the order, or pick “Bought elsewhere”." });

export type BookingResult = { ok: true; code: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createServiceBookingAction(input: unknown): Promise<BookingResult> {
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
