"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, IndianRupee, LayoutDashboard, LayoutGrid, LogOut, Receipt, Route, UserRound, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { L } from "@/components/i18n/lang";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { signOut } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

type Item = { href: string; en: string; ml: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/staff", en: "Dashboard", ml: "ഡാഷ്ബോർഡ്", icon: LayoutDashboard },
  { href: "/staff/tasks", en: "Tasks", ml: "ജോലികൾ", icon: ClipboardList },
  { href: "/staff/earnings", en: "Earnings", ml: "വരുമാനം", icon: Wallet },
  { href: "/staff/profile", en: "Profile", ml: "പ്രൊഫൈൽ", icon: UserRound },
  { href: "/staff/salary", en: "Salary", ml: "ശമ്പളം", icon: IndianRupee },
];
const ADMIN_ITEM: Item = { href: "/admin", en: "Admin panel", ml: "അഡ്മിൻ", icon: LayoutGrid };

const active = (path: string, href: string) => (href === "/staff" ? path === "/staff" : path.startsWith(href));

/** Staff portal chrome: sidebar on desktop, bottom tab bar on phones. */
export function StaffShell({ name, subtitle, adminLink, jobsLink, children }: { name: string; subtitle: string; adminLink: boolean; jobsLink: boolean; children: React.ReactNode }) {
  const path = usePathname();
  // Phone tab bar: at most 5 items. The admin panel link lives in the desktop sidebar
  // and as an icon in the phone header.
  const jobs: Item[] = jobsLink ? [{ href: "/staff/jobs", en: "Jobs", ml: "സർവീസ്", icon: Wrench }] : [];
  const extra: Item[] = [
    ...(jobsLink ? [{ href: "/staff/routes", en: "Routes", ml: "റൂട്ടുകൾ", icon: Route }] : []),
    { href: "/staff/reclaims", en: "Reclaims", ml: "ചെലവ് ക്ലെയിം", icon: Receipt },
  ];
  // Phone tab bar keeps 5 items; routes and reclaims are in the desktop sidebar and on the dashboard.
  const tabs: Item[] = [ITEMS[0], ...jobs, ...ITEMS.slice(1)].slice(0, 5);
  const items: Item[] = [ITEMS[0], ...jobs, ...ITEMS.slice(1), ...extra, ...(adminLink ? [ADMIN_ITEM] : [])];

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-deep text-white lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/staff" aria-label="Staff dashboard"><Logo tone="light" /></Link>
        </div>
        <nav aria-label="Staff" className="flex flex-1 flex-col gap-1 px-3 py-4">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(path, i.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                active(path, i.href) ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <i.icon aria-hidden className={cn("size-[18px]", active(path, i.href) ? "text-gold" : "text-white/50")} />
              <L en={i.en} ml={i.ml} />
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-3 border-t border-white/10 p-4">
          <LanguageSwitcher tone="dark" className="w-fit" />
          <form action={signOut}>
            <input type="hidden" name="next" value="/admin/login" />
            <button type="submit" className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
              <LogOut aria-hidden className="size-4" /> <L en="Sign out" ml="സൈൻ ഔട്ട്" />
            </button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6">
          <Link href="/staff" className="lg:hidden" aria-label="Staff dashboard"><Logo /></Link>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <LanguageSwitcher className="lg:hidden" />
            {adminLink ? (
              <Link href="/admin" aria-label="Admin panel" className="grid size-10 shrink-0 place-items-center rounded-lg text-deep hover:bg-muted lg:hidden">
                <LayoutGrid className="size-5" />
              </Link>
            ) : null}
            <div className="min-w-0 text-right">
              <p className="max-w-32 truncate text-sm font-semibold text-deep sm:max-w-none">{name}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <form action={signOut} className="lg:hidden">
              <input type="hidden" name="next" value="/admin/login" />
              <button type="submit" aria-label="Sign out" className="grid size-10 place-items-center rounded-lg text-deep hover:bg-muted">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:pb-10">{children}</main>
      </div>

      <nav aria-label="Staff" className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active(path, i.href) ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[0.7rem] font-semibold", active(path, i.href) ? "text-royal" : "text-muted-foreground")}
          >
            <i.icon aria-hidden className="size-5" />
            <L en={i.en} ml={i.ml} />
          </Link>
        ))}
      </nav>
    </div>
  );
}
