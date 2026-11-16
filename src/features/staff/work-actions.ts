"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan, getCurrentUser, hasRole } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Task and payroll actions. Each checks the permission here and the database
 * enforces it again (RLS + security-definer functions in migration 0023).
 */

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
/** Rupees typed in a form → integer paise. Blank = 0. */
const rupees = z
  .string()
  .trim()
  .transform((v) => (v === "" ? 0 : Number(v)))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000, "Enter an amount from 0 to 10,00,000.")
  .transform((n) => Math.round(n * 100));

async function permitted(module: "staff" | "payroll", action: "view" | "create" | "edit" | "delete" | "approve"): Promise<FormState | null> {
  if (!isSupabaseConfigured) return fail("Saving needs Supabase.");
  try {
    await assertCan(module, action);
    return null;
  } catch {
    return fail("You don't have permission to do that.");
  }
}

// ---------------------------------------------------------------- Tasks (staff side)

export async function updateMyTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const me = isSupabaseConfigured ? await getCurrentUser() : null;
  if (!me || !hasRole(me, "service_staff")) return fail("Please sign in again.");
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(["todo", "in_progress", "done"]), note: z.string().trim().max(1000) })
    .safeParse({ id: str(fd, "id"), status: str(fd, "status"), note: str(fd, "note") });
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_task", { p_id: parsed.data.id, p_status: parsed.data.status, p_note: parsed.data.note || null });
  if (error) return fail(dbMessage(error, "Couldn't update the task."));
  refresh();
  return ok(parsed.data.status === "done" ? "Marked as done. Well done!" : "Task updated.");
}

// ---------------------------------------------------------------- Tasks (manager side)

const taskSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters.").max(160),
  details: z.string().trim().max(2000),
  assignedTo: z.uuid("Choose a team member."),
  priority: z.enum(["low", "normal", "high"]),
  dueDate: z.union([z.literal(""), z.iso.date("Use a valid date.")]),
});

export async function createTaskAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("staff", "edit");
  if (denied) return denied;
  const parsed = taskSchema.safeParse({
    title: str(fd, "title"),
    details: str(fd, "details"),
    assignedTo: str(fd, "assignedTo"),
    priority: str(fd, "priority") || "normal",
    dueDate: str(fd, "dueDate"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("staff_tasks").insert({
    title: v.title,
    details: v.details || null,
    assigned_to: v.assignedTo,
    priority: v.priority,
    due_date: v.dueDate || null,
  });
  if (error) return fail(dbMessage(error, "Couldn't create the task."));
  refresh();
  return ok("Task assigned. They get a notification.");
}

export async function setTaskStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("staff", "edit");
  if (denied) return denied;
  const parsed = z.object({ id: z.uuid(), status: z.enum(["todo", "in_progress", "done", "cancelled"]) }).safeParse({ id: str(fd, "id"), status: str(fd, "status") });
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.from("staff_tasks").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) return fail(dbMessage(error, "Couldn't update the task."));
  refresh();
  return ok("Task updated.");
}

// ---------------------------------------------------------------- Salary structures

export async function saveSalaryStructureAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("payroll", "edit");
  if (denied) return denied;
  const parsed = z
    .object({
      userId: z.uuid(),
      basic: rupees,
      allowances: rupees,
      deductions: rupees,
      effectiveFrom: z.iso.date("Use a valid date."),
      note: z.string().trim().max(300),
    })
    .safeParse({
      userId: str(fd, "userId"),
      basic: str(fd, "basic"),
      allowances: str(fd, "allowances"),
      deductions: str(fd, "deductions"),
      effectiveFrom: str(fd, "effectiveFrom"),
      note: str(fd, "note"),
    });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  if (v.deductions > v.basic + v.allowances) return fail("Deductions can't be more than basic + allowances.", { deductions: "Too high." });
  const supabase = await createClient();
  const me = await getCurrentUser();
  const { error } = await supabase.from("salary_structures").upsert(
    {
      user_id: v.userId,
      basic_paise: v.basic,
      allowances_paise: v.allowances,
      deductions_paise: v.deductions,
      effective_from: v.effectiveFrom,
      pay_note: v.note || null,
      updated_by: me?.id ?? null,
    },
    { onConflict: "user_id" },
  );
  if (error) return fail(dbMessage(error, "Couldn't save the salary."));
  refresh();
  return ok("Salary saved. It applies from the next payroll you generate.");
}

// ---------------------------------------------------------------- Payroll runs

export async function generatePayrollAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("payroll", "create");
  if (denied) return denied;
  const month = str(fd, "month");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Choose a month.", { month: "Choose a month." });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_payroll", { p_period: `${month}-01` });
  if (error) return fail(/finalised/i.test(error.message) ? "That month's payroll is already finalised." : dbMessage(error, "Couldn't generate payroll."));
  refresh();
  return { ...ok("Payroll ready to review. Open it to check each payslip."), data: { runId: String(data) } };
}

export async function savePayslipAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("payroll", "edit");
  if (denied) return denied;
  const parsed = z
    .object({ id: z.uuid(), bonus: rupees, deductions: rupees, leave: rupees, note: z.string().trim().max(300) })
    .safeParse({ id: str(fd, "id"), bonus: str(fd, "bonus"), deductions: str(fd, "deductions"), leave: str(fd, "leave"), note: str(fd, "note") });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("payslips")
    .update({ bonus_paise: v.bonus, deductions_paise: v.deductions, leave_deduction_paise: v.leave, note: v.note || null })
    .eq("id", v.id);
  if (error) {
    if (/finalised/i.test(error.message)) return fail("This payroll is finalised; amounts are locked.");
    if (error.code === "23514") return fail("Deductions can't be more than the pay.");
    return fail(dbMessage(error, "Couldn't save the payslip."));
  }
  refresh();
  return ok("Payslip saved.");
}

export async function finalizePayrollAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("payroll", "approve");
  if (denied) return denied;
  const id = z.uuid().safeParse(str(fd, "runId"));
  if (!id.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_payroll", { p_run: id.data });
  if (error) return fail(dbMessage(error, "Couldn't finalise the payroll."));
  refresh();
  return ok("Payroll finalised. Each person can now see their payslip.");
}

export async function markPayslipPaidAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("payroll", "edit");
  if (denied) return denied;
  const parsed = z
    .object({
      id: z.uuid(),
      paidOn: z.iso.date("Use a valid date."),
      method: z.enum(["bank_transfer", "upi", "cash", "cheque"], "Choose how it was paid."),
      ref: z.string().trim().max(80),
    })
    .safeParse({ id: str(fd, "id"), paidOn: str(fd, "paidOn"), method: str(fd, "method"), ref: str(fd, "ref") });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("payslips").update({ paid_on: v.paidOn, payment_method: v.method, payment_ref: v.ref || null }).eq("id", v.id);
  if (error) return fail(dbMessage(error, "Couldn't save the payment."));
  refresh();
  return ok("Marked as paid.");
}

export async function deleteDraftPayrollAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await permitted("payroll", "delete");
  if (denied) return denied;
  const id = z.uuid().safeParse(str(fd, "runId"));
  if (!id.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("payroll_runs").delete().eq("id", id.data).eq("status", "draft").select("id");
  if (error || !data?.length) return fail("Only a draft payroll can be deleted.");
  refresh();
  return ok("Draft payroll deleted.");
}
