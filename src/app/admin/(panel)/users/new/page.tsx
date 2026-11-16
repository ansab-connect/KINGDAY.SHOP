import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { AccountForm, type StaffCategory } from "@/components/admin/users/account-forms";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser, hasRole } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New account" };

const PRESET_ROLES = ["super_admin", "admin", "staff", "service_staff"];

async function NewAccountContent({ searchParams }: PageProps<"/admin/users/new">) {
  const raw = (await searchParams).role;
  const defaultRole = PRESET_ROLES.find((r) => r === (Array.isArray(raw) ? raw[0] : raw));
  const me = await getCurrentUser();
  if (isSupabaseConfigured && !hasRole(me, "super_admin")) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">Only a Super Admin can create accounts.</p>;
  }
  let categories: StaffCategory[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("staff_categories").select("id, name, kind, is_system").order("sort_order").order("name");
    categories = (data ?? []) as StaffCategory[];
  }
  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Users &amp; Roles
      </Link>
      <PageHeader title="New account" description="A unique staff ID (KD-STF-0001, KD-SRV-0001…) is created automatically." />
      <Card className="max-w-3xl shadow-card">
        <CardContent>
          <AccountForm categories={categories} defaultRole={defaultRole} />
        </CardContent>
      </Card>
    </>
  );
}

export default function NewAccountPage(props: PageProps<"/admin/users/new">) {
  return (
    <StaffOnly module="users">
      <NewAccountContent {...props} />
    </StaffOnly>
  );
}
