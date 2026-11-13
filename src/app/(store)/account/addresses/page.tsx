import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { AddressBook } from "@/components/store/account/account-forms";
import { AccountShell } from "@/components/store/account/account-shell";
import { ComingSoon } from "@/components/store/coming-soon";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getAddresses } from "@/features/account/queries";
import { requireUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "My Addresses", robots: { index: false } };

async function AddressesContent() {
  await requireUser("/account/addresses");
  const addresses = await getAddresses();
  return (
    <AccountShell active="/account/addresses" title="Saved addresses">
      <AddressBook addresses={addresses} />
    </AccountShell>
  );
}

export default function AddressesPage() {
  if (!isSupabaseConfigured) {
    return <ComingSoon icon={MapPin} title="Saved addresses" body="Saved addresses will be available once customer accounts are connected." />;
  }
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full rounded-2xl" /></Container>}>
      <AddressesContent />
    </Suspense>
  );
}
