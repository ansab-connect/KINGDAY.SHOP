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
  items: z
    .array(z.object({ description: z.string().trim().min(1, "Describe each item.").max(200), quantity: z.number().int().min(1).max(999), unit_price: paise }))
    .max(40),
  payment_method: z.union([z.literal(""), z.enum(["cash", "upi", "card", "bank_transfer", "other"])]),
  payment_status: z.enum(["unpaid", "paid"]),
});

export type SaveInvoiceResult = { ok: true; number: string; id: string } | { ok: false; error: string };

/** Creates or updates the booking's service invoice. The database calculates every total. */
export async function saveServiceInvoiceAction(input: unknown): Promise<SaveInvoiceResult> {
  const me = await getCurrentUser();
  if (!me || !hasRole(me, "service_staff")) return { ok: false, error: "Please sign in again." };
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the amounts." };
  const { bookingId, ...p } = parsed.data;
  if (p.payment_status === "paid" && !p.payment_method) return { ok: false, error: "Choose how the customer paid." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_service_invoice", { p_booking: bookingId, p });
  if (error) {
    const m = error.message;
    return {
      ok: false,
      error: /not authorized/i.test(m)
        ? "You can't invoice this job."
        : /complete the service/i.test(m)
          ? "Mark the service as completed first."
          : /only be changed by the office/i.test(m)
            ? "This invoice is paid. Ask the office to change it."
            : /discount/i.test(m)
              ? "The discount is larger than the total."
              : "Couldn't save the invoice. Please try again.",
    };
  }
  const { data: inv } = await supabase.from("service_invoices").select("id").eq("booking_id", bookingId).maybeSingle();
  refresh();
  queuePushDispatch();
  return { ok: true, number: data as string, id: (inv as { id: string } | null)?.id ?? "" };
}
