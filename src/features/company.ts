import { cacheLife, cacheTag } from "next/cache";
import { companyFallback, displayWa, type Company } from "@/features/company-shared";
import { isSupabaseConfigured } from "@/lib/env";

export type { Company };
export { companyFallback };
export const COMPANY_TAG = "company";

/** The company profile (cached; refreshed the moment the Super Admin saves it). */
export async function getCompany(): Promise<Company> {
  "use cache";
  cacheTag(COMPANY_TAG);
  cacheLife("hours");
  const base = companyFallback();
  if (!isSupabaseConfigured) return base;
  try {
    const { createPublicClient } = await import("@/lib/supabase/public");
    const { data } = await createPublicClient().from("store_settings").select("value").eq("key", "best_fit.company").maybeSingle();
    const v = ((data as { value: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
    const s = (k: keyof Company) => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim() : (base[k] as string));
    const wa = s("whatsapp").replace(/\D/g, "") || base.whatsapp;
    return {
      name: s("name"), division: s("division"), gstin: s("gstin"), phone: s("phone"), email: s("email"),
      whatsapp: wa, whatsappDisplay: displayWa(wa), address: s("address"), logo_url: s("logo_url"), terms: s("terms"),
      payment_instructions: s("payment_instructions"), instagram: s("instagram"), facebook: s("facebook"), youtube: s("youtube"),
    };
  } catch {
    return base;
  }
}
