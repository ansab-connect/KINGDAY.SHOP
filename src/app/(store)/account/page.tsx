import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, Heart, LogOut, MapPin, Package, User } from "lucide-react";
import { ComingSoon } from "@/components/store/coming-soon";
import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "My Account", robots: { index: false } };

const sections = [
  { icon: Package, title: "Orders", body: "Track and review your orders.", href: "/account/orders" },
  { icon: MapPin, title: "Addresses", body: "Saved delivery addresses arrive in Phase 7.", href: null },
  { icon: Heart, title: "Wishlist", body: "Your saved rides.", href: "/wishlist" },
];

async function AccountContent({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const user = await requireUser("/account");
  const params = await searchParams;
  return (
    <>
      {params.password === "updated" ? (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 aria-hidden className="size-4" /> Your password has been updated.
        </p>
      ) : null}
      <div className="flex flex-col gap-6 rounded-3xl bg-deep p-6 text-white sm:flex-row sm:items-center sm:p-8">
        <span className="grid size-14 place-items-center rounded-2xl bg-gold text-deep"><User aria-hidden className="size-6" /></span>
        <div className="flex-1">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">My account</p>
          <h1 className="mt-1 text-2xl font-bold">{user.fullName ?? "Welcome"}</h1>
          <p className="text-sm text-white/70">{user.email}</p>
        </div>
        <form action={signOut}>
          <input type="hidden" name="next" value="/" />
          <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold hover:bg-white/10">
            <LogOut aria-hidden className="size-4" /> Sign out
          </button>
        </form>
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {sections.map((s) => {
          const inner = (
            <>
              <s.icon aria-hidden className="size-6 text-royal" />
              <p className="mt-4 font-heading font-semibold text-deep">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </>
          );
          return (
            <li key={s.title}>
              {s.href ? (
                <Link href={s.href} className="block h-full rounded-2xl border p-6 transition-shadow hover:shadow-lift">{inner}</Link>
              ) : (
                <div className="h-full rounded-2xl border border-dashed p-6">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  if (!isSupabaseConfigured) {
    return (
      <ComingSoon
        icon={User}
        title="My account"
        body="Sign in, saved addresses, order history and tracking will be available here once customer accounts are live."
      />
    );
  }
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-3xl" />}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}
