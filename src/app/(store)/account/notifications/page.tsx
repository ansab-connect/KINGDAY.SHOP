import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { PushToggle } from "@/components/pwa/push-toggle";
import { AccountShell } from "@/components/store/account/account-shell";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/features/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

type Note = { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

async function Notifications() {
  const user = await requireUser("/account/notifications");
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(100);
  const notes = (data ?? []) as Note[];
  // Opening the page marks everything as read (only read_at can be changed, and only on your own rows).
  if (notes.some((n) => !n.read_at)) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  }
  return (
    <AccountShell active="/account/notifications" title="Notifications">
      <PushToggle className="mb-5" />
      {notes.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <Bell aria-hidden className="size-10 text-royal-300" />
          <p className="mt-4 text-sm text-muted-foreground"><L en="Updates about your orders and services appear here." ml="ഓർഡറുകളുടെയും സർവീസുകളുടെയും വിവരങ്ങൾ ഇവിടെ കാണാം." /></p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => {
            const inner = (
              <>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-gold")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.read_at ? "text-deep" : "font-semibold text-deep")}>{n.title}</span>
                  {n.body ? <span className="block truncate text-xs text-muted-foreground">{n.body}</span> : null}
                  <span className="block text-xs text-muted-foreground">{formatDateTime(new Date(n.created_at))}</span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className="flex gap-3 rounded-xl border bg-white px-4 py-3 hover:bg-muted/40">{inner}</Link>
                ) : (
                  <div className="flex gap-3 rounded-xl border bg-white px-4 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Container className="py-10"><Skeleton className="h-64 rounded-2xl" /></Container>}>
      <Notifications />
    </Suspense>
  );
}
