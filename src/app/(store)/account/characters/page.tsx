import type { Metadata } from "next";
import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { AccountShell } from "@/components/store/account/account-shell";
import { CharactersEditor } from "@/components/store/account/characters-editor";
import { ComingSoon } from "@/components/store/coming-soon";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/features/auth/session";
import { charactersFromMetadata } from "@/features/marketing/hero-theme-config";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Characters", robots: { index: false } };

async function CharactersContent() {
  await requireUser("/account/characters");
  const { data } = await (await createClient()).auth.getUser();
  return (
    <AccountShell active="/account/characters" title="My Characters">
      <CharactersEditor initial={charactersFromMetadata(data.user?.user_metadata)} />
    </AccountShell>
  );
}

export default function CharactersPage() {
  if (!isSupabaseConfigured) {
    return <ComingSoon icon={Sparkles} title="My Characters" body="Characters will be available once customer accounts are connected." />;
  }
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-72 w-full rounded-2xl" /></Container>}>
      <CharactersContent />
    </Suspense>
  );
}
