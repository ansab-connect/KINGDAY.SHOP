"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { queuePushDispatch } from "@/features/push/send";

const paise = z.number().int().min(0).max(10_000_000);

const invoiceSchema = z.object({
  bookingId: z.uuid(),
  service_description: z.string().trim().max(2000),
  basic_charge: paise,
  labour_charge: paise,
  discount: paise,
  tax_percent: z.number().min(0).max(28),
  // Additional charges. Spare parts come from the booking's Replaced Items.
  items: z
    .array(z.object({ description: z.string().trim().min(1, "Describe each charge.").max(200), quantity: z.number().int().min(1).max(999), unit_price: paise }))
    .max(40),
  amount_paid: paise,
  payment_method: z.union([z.literal(""), z.enum(["cash", "upi", "card", "bank_transfer", "other"])]),
  approve: z.boolean().default(false),
});

export type SaveInvoiceResult = { ok: true; number: string; id: string } | { ok: false; error: string };

/**
 * Creates or updates the booking's service bill. The database calculates every total
 * (service + labour + spare parts + additional − discount + tax), the balance, and
 * whether the person saving may approve it (billing approve permission).
 */
export async function saveServiceInvoiceAction(input: unknown): Promise<SaveInvoiceResult> {
  const me = await getCurrentUser();
  if (!me || !hasRole(me, "service_staff")) return { ok: false, error: "Please sign in again." };
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the amounts." };
  const { bookingId, ...p } = parsed.data;
  if (p.amount_paid > 0 && !p.payment_method) return { ok: false, error: "Choose how the customer paid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_service_invoice", { p_booking: bookingId, p });
  if (error) {
    const m = error.message;
    return {
      ok: false,
      error: /not authorized/i.test(m)
        ? "You can't bill this job."
        : /complete the service/i.test(m)
          ? "Mark the service as completed first."
          : /only be changed by the office/i.test(m)
            ? "This bill is approved or paid. Ask the office to change it."
            : /custom parts first/i.test(m)
              ? "Approve or reject the custom parts first."
              : /discount/i.test(m)
                ? "The discount is larger than the total."
                : "Couldn't save the bill. Please try again.",
    };
  }
  const { data: inv } = await supabase.from("service_invoices").select("id").eq("booking_id", bookingId).maybeSingle();
  refresh();
  queuePushDispatch();
  return { ok: true, number: data as string, id: (inv as { id: string } | null)?.id ?? "" };
}
