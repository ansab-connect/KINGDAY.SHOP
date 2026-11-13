import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/admin/module-placeholder";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";

export const metadata: Metadata = { title: "Settings" };

function SettingsPageContent() {
  return (
    <>
      <PageHeader title="Settings" description="Store configuration and admin users" />
      <ModulePlaceholder
        icon={Settings}
        phase={4}
        summary="Settings are stored in Supabase and editable only by Super Admins. Payment and API secrets stay in Cloudflare secrets and are never stored here."
        features={[
          "Store information & logo",
          "Contact details & WhatsApp",
          "Social media links",
          "Shipping zones & charges",
          "Payment methods (Razorpay, COD)",
          "Tax / GST settings",
          "Admin & staff users with roles",
        ]}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <StaffOnly minimum="admin">
      <SettingsPageContent />
    </StaffOnly>
  );
}
