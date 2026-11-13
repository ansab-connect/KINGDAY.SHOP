"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { navForRole } from "@/config/admin-nav";
import { cn } from "@/lib/utils";

export function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavLinks({ onNavigate, role }: { onNavigate?: () => void; role: string | null }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      {navForRole(role).map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-[0.68rem] font-semibold tracking-[0.16em] text-white/40 uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
                      active
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-white",
                    )}
                  >
                    {active ? (
                      <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold" />
                    ) : null}
                    <item.icon
                      aria-hidden
                      className={cn("size-[18px] shrink-0", active ? "text-gold" : "text-white/50 group-hover:text-white/80")}
                    />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({ role }: { role: string | null }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <Link href="/admin" aria-label="KING DAY admin home">
          <Logo tone="light" />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6">
        <AdminNavLinks role={role} />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition-colors hover:bg-sidebar-accent hover:text-white"
        >
          <ExternalLink aria-hidden className="size-4" /> View store
        </Link>
      </div>
    </aside>
  );
}
