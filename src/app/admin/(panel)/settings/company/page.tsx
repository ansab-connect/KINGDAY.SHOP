import type { Metadata } from "next";
import { OpForm } from "@/components/best-fit/op-form";
import { Panel } from "@/components/best-fit/ui";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { getSetting } from "@/features/best-fit/queries";
import { companyFallback } from "@/features/company";

export const metadata: Metadata = { title: "Company Details" };

async function Content() {
  const saved = await getSetting<Record<string, string>>("best_fit.company", {});
  const base = companyFallback();
  const initial = { ...base, ...saved };
  return (
    <Panel title="Company details" description="Used on the website (footer, contact page, WhatsApp buttons) and on new invoices. Invoices already issued keep what they printed.">
      <OpForm
        op="setting.save"
        transform="settingValue"
        hidden={{ key: "best_fit.company", base: saved }}
        initial={initial}
        columns={2}
        submitLabel="Save company details"
        fields={[
          { name: "name", label: "Company name", required: true },
          { name: "division", label: "Division / tagline" },
          { name: "gstin", label: "GSTIN" },
          { name: "phone", label: "Phone (shown)" },
          { name: "whatsapp", label: "WhatsApp number (digits with 91, e.g. 919495902904)", required: true },
          { name: "email", label: "Email" },
          { name: "address", label: "Address", wide: true },
          { name: "logo_url", label: "Logo URL (optional)", wide: true },
          { name: "instagram", label: "Instagram handle" },
          { name: "facebook", label: "Facebook page link" },
          { name: "youtube", label: "YouTube link" },
          { name: "terms", label: "Invoice terms", type: "textarea" },
          { name: "payment_instructions", label: "Payment instructions", type: "textarea" },
        ]}
      />
    </Panel>
  );
}

export default function CompanyDetailsPage() {
  return (
    <StaffOnly minimum="super_admin" module="settings">
      <PageHeader title="Company Details" description="Super Admin only. One place for the company's name, contact numbers, address and invoice details." />
      <Content />
    </StaffOnly>
  );
}
