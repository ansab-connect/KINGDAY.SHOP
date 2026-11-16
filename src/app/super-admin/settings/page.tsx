import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { SystemSettingsForm } from "@/components/admin/system-settings-form";
import { Card, CardContent } from "@/components/ui/card";
import { SYSTEM_SETTINGS } from "@/features/admin/settings-keys";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System Settings" };

async function SystemSettingsContent() {
  if (!isSupabaseConfigured) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">System settings need Supabase.</p>;
  }
  const supabase = await createClient();
  const { data } = await supabase.from("store_settings").select("key, value").in("key", Object.keys(SYSTEM_SETTINGS));
  const values: Record<string, string> = {};
  for (const r of (data ?? []) as { key: string; value: unknown }[]) values[r.key] = String(r.value);

  return (
    <>
      <PageHeader title="System Settings" description="System-wide rules. Only a Super Admin can see or change these." />
      <Card className="max-w-3xl shadow-card">
        <CardContent>
          <SystemSettingsForm values={values} />
        </CardContent>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">
        Store details, shipping, COD and tax are on{" "}
        <Link href="/admin/settings" className="font-semibold text-royal hover:underline">Store settings</Link>.
      </p>
    </>
  );
}

export default function SystemSettingsPage() {
  return (
    <StaffOnly minimum="super_admin" module="settings">
      <SystemSettingsContent />
    </StaffOnly>
  );
}
