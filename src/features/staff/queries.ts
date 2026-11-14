import "server-only";
import { createClient } from "@/lib/supabase/server";

/** HR profile reads. RLS limits each query to the caller's own record unless they hold the "staff" permission. */

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "probation", label: "Probation" },
  { value: "intern", label: "Intern" },
] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export type StaffRecord = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  staffCode: string | null;
  categoryName: string | null;
  categoryKind: "staff" | "service" | null;
  status: string;
  designation: string | null;
  department: string | null;
  employmentType: string;
  joiningDate: string | null;
  personal: {
    photoPath: string | null;
    photoUrl: string | null;
    dateOfBirth: string | null;
    address: string | null;
    emergencyName: string | null;
    emergencyRelation: string | null;
    emergencyPhone: string | null;
    bloodGroup: string | null;
  };
  documents: { id: string; title: string; url: string | null; createdAt: string; sizeBytes: number | null }[];
};

type StaffRow = {
  user_id: string;
  staff_code: string;
  status: string;
  designation: string | null;
  department: string | null;
  employment_type: string;
  joining_date: string | null;
  staff_categories: { name: string; kind: "staff" | "service" } | null;
};

export async function getStaffRecord(userId: string, email: string | null = null): Promise<StaffRecord | null> {
  const supabase = await createClient();
  const [{ data: staff }, { data: profile }, { data: personal }, { data: docs }] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("user_id, staff_code, status, designation, department, employment_type, joining_date, staff_categories(name, kind)")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    supabase.from("staff_personal").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("staff_documents").select("id, title, path, size_bytes, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  const s = staff as StaffRow | null;
  const p = profile as { full_name: string | null; phone: string | null } | null;
  if (!s && !p) return null;
  const per = personal as Record<string, string | null> | null;

  const files = supabase.storage.from("staff-files");
  const sign = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await files.createSignedUrl(path, 60 * 30);
    return data?.signedUrl ?? null;
  };
  const docRows = (docs ?? []) as { id: string; title: string; path: string; size_bytes: number | null; created_at: string }[];
  const [photoUrl, ...docUrls] = await Promise.all([sign(per?.photo_path), ...docRows.map((d) => sign(d.path))]);

  return {
    userId,
    fullName: p?.full_name ?? null,
    phone: p?.phone ?? null,
    email,
    staffCode: s?.staff_code ?? null,
    categoryName: s?.staff_categories?.name ?? null,
    categoryKind: s?.staff_categories?.kind ?? null,
    status: s?.status ?? "active",
    designation: s?.designation ?? null,
    department: s?.department ?? null,
    employmentType: s?.employment_type ?? "full_time",
    joiningDate: s?.joining_date ?? null,
    personal: {
      photoPath: per?.photo_path ?? null,
      photoUrl,
      dateOfBirth: per?.date_of_birth ?? null,
      address: per?.address ?? null,
      emergencyName: per?.emergency_name ?? null,
      emergencyRelation: per?.emergency_relation ?? null,
      emergencyPhone: per?.emergency_phone ?? null,
      bloodGroup: per?.blood_group ?? null,
    },
    documents: docRows.map((d, i) => ({ id: d.id, title: d.title, url: docUrls[i] ?? null, createdAt: d.created_at, sizeBytes: d.size_bytes })),
  };
}

export const employmentLabel = (v: string) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label ?? v;
