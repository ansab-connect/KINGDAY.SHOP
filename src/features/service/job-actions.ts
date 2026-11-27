"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan, can, getCurrentUser, hasRole } from "@/features/auth/session";
import { fail, ok, type FormState } from "@/features/forms";
import { createClient } from "@/lib/supabase/server";
import { queuePushDispatch } from "@/features/push/send";

/** Service job actions. The database functions re-check every rule (who, which job, which step). */

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const id = z.uuid();
const note = z.string().trim().max(1000);

function friendly(message: string, fallback: string): string {
  if (/not authorized/i.test(message)) return "You don't have permission to do that.";
  if (/active service staff/i.test(message)) return "Choose an active service staff member.";
  if (/reassigned/i.test(message)) return "This job can't be reassigned any more.";
  if (/cancelled/i.test(message)) return "This job can't be cancelled any more.";
  if (/already answered|not available|not found/i.test(message)) return "This step isn't available now. Refresh the page.";
  if (/invalid file/i.test(message)) return "A photo couldn't be attached. Please upload it again.";
  return fallback;
}

async function manager(): Promise<FormState | null> {
  try {
    await assertCan("service", "edit");
    return null;
  } catch {
    return fail("You don't have permission to manage service jobs.");
  }
}

export async function assignJobAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await manager();
  if (denied) return denied;
  const parsed = z.object({ bookingId: id, staffId: z.uuid("Choose a technician."), note }).safeParse({ bookingId: str(fd, "bookingId"), staffId: str(fd, "staffId"), note: str(fd, "note") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_service_booking", { p_id: parsed.data.bookingId, p_staff: parsed.data.staffId, p_note: parsed.data.note || null });
  if (error) return fail(friendly(error.message, "Couldn't assign the job."));
  refresh();
  queuePushDispatch();
  return ok("Job assigned. The technician sees it in their app now.");
}

export async function cancelJobAction(_: FormState, fd: FormData): Promise<FormState> {
  const denied = await manager();
  if (denied) return denied;
  const parsed = z.object({ bookingId: id, note: note.min(3, "Give a short reason.") }).safeParse({ bookingId: str(fd, "bookingId"), note: str(fd, "note") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_service_booking", { p_id: parsed.data.bookingId, p_note: parsed.data.note });
  if (error) return fail(friendly(error.message, "Couldn't cancel the job."));
  refresh();
  queuePushDispatch();
  return ok("Job cancelled.");
}

async function technician() {
  const me = await getCurrentUser();
  return me && hasRole(me, "service_staff") && me.roles.includes("service_staff") ? me : null;
}

export async function respondJobAction(input: { bookingId: string; accept: boolean; note?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await technician())) return { ok: false, error: "Only service staff can do this." };
  const parsed = z.object({ bookingId: id, accept: z.boolean(), note: note.optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_service_job", { p_id: parsed.data.bookingId, p_accept: parsed.data.accept, p_note: parsed.data.note || null });
  if (error) return { ok: false, error: friendly(error.message, "Couldn't update the job.") };
  refresh();
  queuePushDispatch();
  return { ok: true };
}

export async function advanceJobAction(input: { bookingId: string; status: string; note?: string }): Promise<{ ok: boolean; error?: string }> {
  // Technicians move their own jobs; service managers (service edit) may move any job.
  const me = await getCurrentUser();
  if (!me || !(me.roles.includes("service_staff") || (hasRole(me, "staff") && can(me, "service", "edit")))) {
    return { ok: false, error: "Only service staff can do this." };
  }
  const parsed = z
    .object({
      bookingId: id,
      status: z.enum(["accepted", "on_the_way", "reached", "inspection_started", "inspection_completed", "started", "awaiting_parts", "completed", "ready_for_delivery"]),
      note: note.optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_service_job", { p_id: parsed.data.bookingId, p_status: parsed.data.status, p_note: parsed.data.note || null });
  if (error) return { ok: false, error: friendly(error.message, "Couldn't update the job.") };
  refresh();
  queuePushDispatch();
  return { ok: true };
}

const path = z.string().regex(/^[0-9a-f-]{36}\/[a-z0-9-]{6,80}\.(webp|jpg|jpeg|png)$/);
const inspectionSchema = z.object({
  bookingId: id,
  problem_found: z.string().trim().max(2000),
  work_performed: z.string().trim().max(2000),
  spare_parts: z.string().trim().max(1000),
  notes: z.string().trim().max(2000),
  before_photos: z.array(path).max(6),
  after_photos: z.array(path).max(6),
  confirmed_by: z.string().trim().max(120),
  signature_path: z.union([z.literal(""), path]),
});

export async function saveInspectionAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentUser();
  if (!me || !hasRole(me, "service_staff")) return { ok: false, error: "Please sign in again." };
  const parsed = inspectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some fields are too long or a photo is invalid." };
  const { bookingId, ...p } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_service_inspection", { p_id: bookingId, p });
  if (error) return { ok: false, error: friendly(error.message, "Couldn't save the report.") };
  refresh();
  queuePushDispatch();
  return { ok: true };
}
