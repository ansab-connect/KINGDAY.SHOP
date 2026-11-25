"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCan } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  expense_date: z.iso.date("Choose the date."),
  category: z.string().trim().min(2, "Choose a category.").max(40),
  amount: z.coerce.number().positive("Enter the amount.").max(10_000_000),
  payment_mode: z.enum(["cash", "upi", "card", "bank", "other"]),
  paid_to: z.string().trim().max(120).default(""),
  note: z.string().trim().max(500).default(""),
  receipt_path: z.union([z.literal(""), z.string().regex(/^expenses\/[a-z0-9-]{8,80}\.(jpe?g|png|webp|pdf)$/)]).default(""),
});
export type ExpenseInput = z.input<typeof schema>;

export async function addExpenseAction(input: ExpenseInput): Promise<Result> {
  try {
    await assertCan("expenses", "create");
  } catch {
    return { ok: false, error: "You don't have permission to add expenses." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    expense_date: v.expense_date,
    category: v.category,
    amount_paise: Math.round(v.amount * 100),
    payment_mode: v.payment_mode,
    paid_to: v.paid_to || null,
    note: v.note || null,
    receipt_path: v.receipt_path || null,
    created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  if (error) return { ok: false, error: "Couldn't save the expense. Please try again." };
  revalidatePath("/admin/expenses");
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<Result> {
  try {
    await assertCan("expenses", "delete");
  } catch {
    return { ok: false, error: "You don't have permission to delete expenses." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Invalid expense." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("expenses").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "Couldn't delete the expense." };
  revalidatePath("/admin/expenses");
  return { ok: true };
}
