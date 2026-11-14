import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { PromotionForm } from "@/components/admin/promotions/promotion-form";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { isPushConfigured } from "@/features/push/send";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Promotions" };

async function PromotionsContent() {
  let optedIn: number | null = null;
  let devices: number | null = null;
  if (isSupabaseConfigured) {
    try {
      const admin = createAdminClient();
      const [a, b] = await Promise.all([
        admin.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
        admin.from("push_subscriptions").select("id", { count: "exact", head: true }),
      ]);
      optedIn = a.count ?? 0;
      devices = b.count ?? 0;
    } catch {}
  }
  return (
    <>
      <PageHeader title="Promotions" description="Send an offer to customers who chose to receive offers. It appears in their Notifications and, if they turned it on, on their phone." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Customers opted in to offers", optedIn ?? "—"],
          ["Devices with notifications on", devices ?? "—"],
          ["Phone notifications", isPushConfigured ? "Ready" : "Not set up (keys missing)"],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border bg-white p-4 shadow-card">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 font-heading text-xl font-bold text-deep">{v}</p>
          </div>
        ))}
      </div>
      <Card className="shadow-card">
        <CardContent>
          <PromotionForm />
        </CardContent>
      </Card>
    </>
  );
}

export default function PromotionsPage() {
  return (
    <StaffOnly module="customers">
      <PromotionsContent />
    </StaffOnly>
  );
}
