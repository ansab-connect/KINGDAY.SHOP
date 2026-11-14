"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatMobile, isMobileLoginEmail, mobileLoginEmail, normalizeMobile } from "@/features/customer/mobile";

/**
 * Customer self-service actions. Every write runs as the signed-in user, so RLS
 * restricts it to their own profile, addresses and wishlist.
 */

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid phone number.");

async function me() {
  if (!isSupabaseConfigured) return null;
  return getCurrentUser();
}

const SIGN_IN = fail("Please sign in again.");

export async function updateProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await me();
  if (!user) return SIGN_IN;
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "Enter your name.").max(120),
      phone: z.union([phone, z.literal("")]),
      marketing_opt_in: z.boolean(),
    })
    .safeParse({ full_name: fd.get("full_name"), phone: fd.get("phone") ?? "", marketing_opt_in: fd.get("marketing_opt_in") === "on" });
  if (!parsed.success) return fail("Please check the highlighted fields.", fieldErrorsOf(parsed.error));
  const mobile = parsed.data.phone ? normalizeMobile(parsed.data.phone) : null;
  if (parsed.data.phone && !mobile) return fail("Please check the highlighted fields.", { phone: "Enter a valid mobile number." });
  if (!mobile && isMobileLoginEmail(user.email)) {
    return fail("Please check the highlighted fields.", { phone: "Your mobile number is how you sign in, so it can't be removed." });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, phone: mobile ? formatMobile(mobile) : null })
    .eq("id", user.id);
  if (error?.code === "23505") return fail("Please check the highlighted fields.", { phone: "This mobile number is already used by another account." });
  if (error) return fail(dbMessage(error, "Couldn't save your profile."));
  if (mobile && isMobileLoginEmail(user.email)) {
    // Mobile-only accounts sign in with their number: keep the sign-in address in step.
    try {
      await createAdminClient().auth.admin.updateUserById(user.id, { email: mobileLoginEmail(mobile), email_confirm: true });
    } catch {}
  }
  revalidatePath("/account");
  return ok("Profile saved.");
}

const addressSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).optional(),
  label: z.string().trim().max(40).optional(),
  full_name: z.string().trim().min(2, "Enter the recipient's name.").max(120),
  phone,
  line1: z.string().trim().min(3, "Enter the address.").max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  state: z.string().trim().min(2, "Enter the state.").max(80),
  postal_code: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code."),
  is_default: z.boolean(),
});

export async function saveAddressAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await me();
  if (!user) return SIGN_IN;
  const parsed = addressSchema.safeParse({
    ...Object.fromEntries(["id", "label", "full_name", "phone", "line1", "line2", "landmark", "city", "state", "postal_code"].map((k) => [k, (fd.get(k) as string | null) ?? ""])),
    is_default: fd.get("is_default") === "on",
  });
  if (!parsed.success) return fail("Please check the highlighted fields.", fieldErrorsOf(parsed.error));

  const { id, ...values } = parsed.data;
  const row = { ...values, label: values.label || null, line2: values.line2 || null, landmark: values.landmark || null, user_id: user.id };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("addresses").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("addresses").insert(row);
  if (error) return fail(dbMessage(error, "Couldn't save the address."));
  revalidatePath("/account/addresses");
  return ok(id ? "Address updated." : "Address added.");
}

export async function deleteAddressAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await me();
  if (!user) return SIGN_IN;
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid address.");
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").delete().eq("id", id.data).eq("user_id", user.id);
  if (error) return fail(dbMessage(error, "Couldn't delete the address."));
  revalidatePath("/account/addresses");
  return ok("Address removed.");
}

/** Adds or removes a product from the signed-in customer's wishlist. */
export async function toggleWishlistAction(productId: string): Promise<{ ok: boolean; saved?: boolean; error?: string }> {
  const user = await me();
  if (!user) return { ok: false, error: "signin" };
  if (!z.uuid().safeParse(productId).success) return { ok: false, error: "Wishlist isn't available for sample products." };

  const supabase = await createClient();
  let { data: list } = await supabase.from("wishlists").select("id").eq("user_id", user.id).maybeSingle();
  if (!list) {
    const created = await supabase.from("wishlists").insert({ user_id: user.id }).select("id").single();
    if (created.error) return { ok: false, error: "Couldn't update your wishlist." };
    list = created.data;
  }
  const { data: existing } = await supabase
    .from("wishlist_items")
    .select("product_id")
    .eq("wishlist_id", list.id)
    .eq("product_id", productId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("wishlist_items").delete().eq("wishlist_id", list.id).eq("product_id", productId)
    : await supabase.from("wishlist_items").insert({ wishlist_id: list.id, product_id: productId });
  if (error) return { ok: false, error: "Couldn't update your wishlist." };
  revalidatePath("/wishlist");
  return { ok: true, saved: !existing };
}

export async function removeWishlistItemAction(_: FormState, fd: FormData): Promise<FormState> {
  const productId = String(fd.get("product_id") ?? "");
  const r = await toggleWishlistAction(productId);
  return r.ok ? ok("Removed from your wishlist.") : fail(r.error === "signin" ? "Please sign in again." : (r.error ?? "Failed."));
}
