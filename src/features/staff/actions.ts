"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertCan, can, getCurrentUser, hasRole, type SessionUser } from "@/features/auth/session";
import { dbMessage, fail, fieldErrorsOf, ok, type FormState } from "@/features/forms";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff HR actions. A team member may edit their own personal details; editing
 * anyone else's needs the "staff" edit permission. RLS enforces the same rules.
 */

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const phone = z.union([z.literal(""), z.string().regex(/^\+?[0-9 ]{7,20}$/, "Enter a valid phone number.")]);

/** Signed-in team member who may edit `userId` (self, or HR). */
async function editor(userId: string): Promise<SessionUser | null> {
  if (!isSupabaseConfigured) return null;
  const me = await getCurrentUser();
  if (!me || !hasRole(me, "service_staff")) return null;
  if (me.id === userId || can(me, "staff", "edit")) return me;
  return null;
}

const personalSchema = z.object({
  userId: z.uuid(),
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  phone,
  dateOfBirth: z.union([z.literal(""), z.iso.date("Use a valid date.")]),
  address: z.string().trim().max(400, "Keep the address under 400 characters."),
  emergencyName: z.string().trim().max(120),
  emergencyRelation: z.string().trim().max(60),
  emergencyPhone: phone,
  bloodGroup: z.union([z.literal(""), z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])]),
});

export async function savePersonalDetailsAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = personalSchema.safeParse({
    userId: str(fd, "userId"),
    fullName: str(fd, "fullName"),
    phone: str(fd, "phone"),
    dateOfBirth: str(fd, "dateOfBirth"),
    address: str(fd, "address"),
    emergencyName: str(fd, "emergencyName"),
    emergencyRelation: str(fd, "emergencyRelation"),
    emergencyPhone: str(fd, "emergencyPhone"),
    bloodGroup: str(fd, "bloodGroup"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const me = await editor(v.userId);
  if (!me) return fail("You can only edit your own details.");
  const supabase = await createClient();

  // Name and phone live on the profile; only the owner can change them there (RLS).
  if (me.id === v.userId) {
    const { error } = await supabase.from("profiles").update({ full_name: v.fullName, phone: v.phone || null }).eq("id", v.userId);
    if (error) return fail(dbMessage(error, "Couldn't save your name and phone."));
  }
  const { error } = await supabase.from("staff_personal").upsert(
    {
      user_id: v.userId,
      date_of_birth: v.dateOfBirth || null,
      address: v.address || null,
      emergency_name: v.emergencyName || null,
      emergency_relation: v.emergencyRelation || null,
      emergency_phone: v.emergencyPhone || null,
      blood_group: v.bloodGroup || null,
    },
    { onConflict: "user_id" },
  );
  if (error) return fail(dbMessage(error, "Couldn't save the details."));
  refresh();
  return ok("Details saved.");
}

const photoSchema = z.object({ userId: z.uuid(), path: z.string() });

export async function setStaffPhotoAction(input: { userId: string; path: string }): Promise<{ ok: boolean; error?: string }> {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid photo." };
  const { userId, path } = parsed.data;
  if (!new RegExp(`^${userId}/photo-[a-z0-9-]{6,64}\\.(webp|jpg|jpeg|png)$`).test(path)) return { ok: false, error: "Invalid photo." };
  const me = await editor(userId);
  if (!me) return { ok: false, error: "You can only change your own photo." };
  const supabase = await createClient();
  const { data: old } = await supabase.from("staff_personal").select("photo_path").eq("user_id", userId).maybeSingle();
  const { error } = await supabase.from("staff_personal").upsert({ user_id: userId, photo_path: path }, { onConflict: "user_id" });
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the photo.") };
  const oldPath = (old as { photo_path?: string | null } | null)?.photo_path;
  if (oldPath && oldPath !== path) await supabase.storage.from("staff-files").remove([oldPath]);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- HR (staff permission)
const employmentSchema = z.object({
  userId: z.uuid(),
  department: z.string().trim().max(80),
  designation: z.string().trim().max(80),
  employmentType: z.enum(["full_time", "part_time", "contract", "probation", "intern"]),
  joiningDate: z.union([z.literal(""), z.iso.date("Use a valid date.")]),
});

export async function saveEmploymentAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await assertCan("staff", "edit");
  } catch {
    return fail("You don't have permission to edit staff records.");
  }
  const parsed = employmentSchema.safeParse({
    userId: str(fd, "userId"),
    department: str(fd, "department"),
    designation: str(fd, "designation"),
    employmentType: str(fd, "employmentType"),
    joiningDate: str(fd, "joiningDate"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_staff_employment", {
    p_user_id: v.userId,
    p_department: v.department,
    p_designation: v.designation,
    p_employment_type: v.employmentType,
    p_joining_date: v.joiningDate || null,
  });
  if (error) return fail(error.code === "P0002" ? "This person has no staff profile yet. Create it from Users & Roles." : dbMessage(error, "Couldn't save."));
  refresh();
  return ok("Employment details saved.");
}

const docSchema = z.object({
  userId: z.uuid(),
  title: z.string().trim().min(2, "Give the document a name.").max(120),
  path: z.string(),
  sizeBytes: z.number().int().min(1).max(10_485_760),
});

export async function addStaffDocumentAction(input: { userId: string; title: string; path: string; sizeBytes: number }): Promise<{ ok: boolean; error?: string }> {
  let me: SessionUser;
  try {
    me = await assertCan("staff", "edit");
  } catch {
    return { ok: false, error: "You don't have permission to add documents." };
  }
  const parsed = docSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid document." };
  const v = parsed.data;
  if (!new RegExp(`^${v.userId}/docs/[a-z0-9-]{6,80}\\.(pdf|webp|jpg|jpeg|png)$`).test(v.path)) return { ok: false, error: "Invalid file." };
  const supabase = await createClient();
  const { error } = await supabase.from("staff_documents").insert({ user_id: v.userId, title: v.title, path: v.path, size_bytes: v.sizeBytes, uploaded_by: me.id });
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the document.") };
  refresh();
  return { ok: true };
}

export async function deleteStaffDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await assertCan("staff", "edit");
  } catch {
    return fail("You don't have permission to delete documents.");
  }
  const id = z.uuid().safeParse(str(fd, "id"));
  if (!id.success) return fail("Invalid request.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff_documents").delete().eq("id", id.data).select("path");
  if (error) return fail(dbMessage(error, "Couldn't delete the document."));
  const path = (data?.[0] as { path?: string } | undefined)?.path;
  if (path) await supabase.storage.from("staff-files").remove([path]);
  refresh();
  return ok("Document deleted.");
}
