import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Person = { user_id: string; full_name: string; staff_code: string | null; role: string; is_technician: boolean };

export const getPeople = cache(async (): Promise<Person[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("best_fit_people");
  return (data ?? []) as Person[];
});

export const personName = (people: Person[], id: string | null | undefined) => {
  if (!id) return "—";
  const p = people.find((x) => x.user_id === id);
  return p ? `${p.full_name}${p.staff_code ? ` (${p.staff_code})` : ""}` : "Former staff";
};
export const techOptions = (people: Person[]) => people.filter((p) => p.is_technician).map((p) => ({ value: p.user_id, label: `${p.full_name}${p.staff_code ? ` · ${p.staff_code}` : ""}` }));
export const staffOptions = (people: Person[]) => people.map((p) => ({ value: p.user_id, label: `${p.full_name}${p.staff_code ? ` · ${p.staff_code}` : ""}${p.is_technician ? " · Technician" : ""}` }));

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase.from("store_settings").select("value").eq("key", key).maybeSingle();
  return ((data as { value: T } | null)?.value ?? fallback) as T;
}

export type Group = { id: string; name: string; kind: string; leader_id: string | null; service_area: string | null; skills: string[]; notes: string | null; is_active: boolean; technician_group_members: { user_id: string }[] };
export async function getGroups(): Promise<Group[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("technician_groups").select("*, technician_group_members(user_id)").order("name");
  return (data ?? []) as Group[];
}

export type BfBooking = {
  id: string; booking_code: string; customer_id: string | null; customer_name: string; mobile: string; category: string; category_label: string | null;
  service_type: string; service_type_label: string | null; service_mode: string; service_centre_id: string | null; town: string | null; address: string | null;
  latitude: number | null; longitude: number | null; status: string; assigned_to: string | null; created_at: string; priority: string;
  estimated_distance_km: number | null; verified_distance_km: number | null; preferred_date: string | null; voice_path: string | null; photo_paths: string[];
};
export const BOOKING_COLS =
  "id, booking_code, customer_id, customer_name, mobile, category, category_label, service_type, service_type_label, service_mode, service_centre_id, town, address, latitude, longitude, status, assigned_to, created_at, priority, estimated_distance_km, verified_distance_km, preferred_date, voice_path, photo_paths";
