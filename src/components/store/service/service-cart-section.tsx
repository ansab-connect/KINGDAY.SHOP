import { L } from "@/components/i18n/lang";
import { QuickAccount } from "@/components/store/quick-account";
import { ServiceCartView, type ServiceCartLine } from "@/components/store/service/service-cart-view";
import { getCurrentUser } from "@/features/auth/session";
import { categoryLabel, preferredDateText, preferredTimeLabel, serviceTypeLabel } from "@/features/service/constants";
import { getDefaultBasicCharge } from "@/features/service/invoices";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  category: string;
  service_type: string;
  product_name: string;
  complaint: string | null;
  voice_path: string | null;
  photo_paths: string[];
  address: string;
  preferred_date: string | null;
  preferred_time: string | null;
};

/** Services tab of the cart: the signed-in customer's service bookings waiting to be sent. */
export async function ServiceCartSection() {
  if (!isSupabaseConfigured) return <p className="text-sm text-muted-foreground">Service booking opens soon.</p>;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-md">
        <QuickAccount next="/cart?tab=services" title={<L en="Sign in to see your service cart" ml="സർവീസ് കാർട്ട് കാണാൻ സൈൻ ഇൻ ചെയ്യുക" />} />
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data }, basic] = await Promise.all([
    supabase.from("service_cart_items").select("*").eq("user_id", user.id).order("created_at"),
    getDefaultBasicCharge(),
  ]);
  const lines: ServiceCartLine[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    category: categoryLabel(r.category),
    serviceType: serviceTypeLabel(r.service_type),
    product: r.product_name,
    complaint: r.complaint,
    hasVoice: Boolean(r.voice_path),
    photos: r.photo_paths.length,
    address: r.address,
    date: preferredDateText(r.preferred_date),
    time: preferredTimeLabel(r.preferred_time),
  }));
  return <ServiceCartView lines={lines} basicCharge={basic} />;
}
