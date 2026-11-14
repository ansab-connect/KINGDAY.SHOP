import type { Metadata } from "next";
import Link from "next/link";
import { History, Mail, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { storeContact } from "@/config/storefront";
import { EDITABLE_SETTINGS } from "@/features/admin/settings-keys";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

async function loadValues(): Promise<Record<string, string | boolean>> {
  const out: Record<string, string | boolean> = { "store.name": "KING DAY", "store.tagline": "Every child deserves a royal ride." };
  if (!isSupabaseConfigured) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("store_settings").select("key, value").in("key", Object.keys(EDITABLE_SETTINGS));
  for (const row of (data ?? []) as { key: keyof typeof EDITABLE_SETTINGS; value: unknown }[]) {
    const def = EDITABLE_SETTINGS[row.key];
    if (!def) continue;
    if (def.kind === "boolean") out[row.key] = row.value === true;
    else if (def.kind === "rupees") out[row.key] = typeof row.value === "number" ? String(row.value / 100) : "";
    else out[row.key] = typeof row.value === "string" ? row.value : "";
  }
  return out;
}

async function SettingsPageContent() {
  const [values, me] = await Promise.all([loadValues(), getCurrentUser()]);
  const contact = [
    { icon: Mail, label: "Support email", value: storeContact.email, href: `mailto:${storeContact.email}` },
    { icon: MessageCircle, label: "WhatsApp (BUY NOW)", value: storeContact.whatsappDisplay, href: `https://wa.me/${storeContact.whatsapp}` },
    { icon: MapPin, label: "Office", value: storeContact.address },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Store configuration. Payment and API secrets stay in the hosting provider's encrypted env vars and are never stored here." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-base">Store &amp; checkout</CardTitle>
            <CardDescription>Saved to Supabase. Public values are shown on the storefront.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm values={values} disabled={!isSupabaseConfigured} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="font-heading text-base">Business information</CardTitle>
              <CardDescription>Shown in the footer, contact page and product pages.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {contact.map((c) => (
                  <li key={c.label} className="flex items-start gap-3">
                    <c.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-royal" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      {c.href ? (
                        <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="font-medium break-all text-deep hover:text-royal">{c.value}</a>
                      ) : (
                        <p className="font-medium text-deep">{c.value}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="font-heading text-base">Access</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Link href="/admin/users" className="flex items-center gap-2 font-medium text-royal hover:underline">
                <ShieldCheck aria-hidden className="size-4" /> Users &amp; roles
              </Link>
              {hasRole(me, "super_admin") || !isSupabaseConfigured ? (
                <Link href="/admin/audit-log" className="flex items-center gap-2 font-medium text-royal hover:underline">
                  <History aria-hidden className="size-4" /> Audit log
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <StaffOnly module="settings">
      <SettingsPageContent />
    </StaffOnly>
  );
}
