"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, LogOut, Menu, Search, Settings, ShieldCheck, User } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AdminNavLinks } from "@/components/admin/admin-sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { signOut } from "@/features/auth/actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type AdminAlert = { id: string; title: string; detail: string; href: string };

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
  customer: "Customer",
};

export type AdminHeaderUser = { name: string; email: string | null; role: string } | null;

export function AdminHeader({ user, alerts = [] }: { user: AdminHeaderUser; alerts?: AdminAlert[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const name = user?.name ?? "Preview Admin";
  const role = user ? (roleLabel[user.role] ?? user.role) : "Development preview";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "KD";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-none bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="h-16 justify-center border-b border-sidebar-border px-6">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            <SheetDescription className="sr-only">Navigate between admin modules</SheetDescription>
            <Logo tone="light" />
          </SheetHeader>
          <div className="overflow-y-auto px-3 py-6">
            <AdminNavLinks role={user?.role ?? null} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <form role="search" className="relative max-w-md flex-1" action="/admin/orders">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="admin-search" className="sr-only">Search orders by number, name, phone or city</label>
        <Input
          id="admin-search"
          name="q"
          type="search"
          placeholder="Search orders…"
          className="h-10 bg-muted/60 pl-9"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={`Alerts (${alerts.length})`}>
              <Bell />
              {alerts.length ? <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-gold ring-2 ring-background" /> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Alerts
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {alerts.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">All caught up. Nothing needs attention.</p>
            ) : null}
            {alerts.map((n) => (
              <DropdownMenuItem key={n.id} asChild>
                <Link href={n.href} className="flex flex-col items-start gap-0.5 py-2">
                  <span className="font-medium">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{n.detail}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Account menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-royal text-xs font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-36 truncate text-sm font-medium">{name}</span>
                <span className="block text-xs text-muted-foreground">{role}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate">{name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{user?.email ?? role}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/account">
                  <User /> My profile
                </Link>
              </DropdownMenuItem>
              {!user || user.role === "admin" || user.role === "super_admin" ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/settings">
                      <Settings /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/users">
                      <ShieldCheck /> Users &amp; roles
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {user ? (
              <form action={signOut}>
                <input type="hidden" name="next" value="/admin/login" />
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut /> Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            ) : (
              <DropdownMenuItem disabled>
                <LogOut /> Sign out
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
