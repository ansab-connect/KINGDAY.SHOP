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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const previewNotifications = [
  { id: 1, title: "New order KD-1452", detail: "Thunder 12V Ride-on Jeep · Kochi", time: "5 min ago" },
  { id: 2, title: "Low stock", detail: "Roadster Mini Electric Car — 2 left", time: "1 hr ago" },
  { id: 3, title: "Payment received", detail: "KD-1449 · Razorpay", time: "3 hrs ago" },
];

export function AdminHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

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
            <AdminNavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <form role="search" className="relative max-w-md flex-1" action="/admin/orders">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="admin-search" className="sr-only">Search orders, products, customers</label>
        <Input
          id="admin-search"
          name="q"
          type="search"
          placeholder="Search orders, products, customers…"
          className="h-10 bg-muted/60 pl-9"
        />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${previewNotifications.length} new)`}>
              <Bell />
              <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-gold ring-2 ring-background" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications <span className="text-xs font-normal text-muted-foreground">Preview</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {previewNotifications.map((n) => (
              <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                <span className="font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.detail}</span>
                <span className="text-[0.7rem] text-muted-foreground/80">{n.time}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Account menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-royal text-xs font-semibold text-white">KD</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium">Store Admin</span>
                <span className="block text-xs text-muted-foreground">Super Admin</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block">Store Admin</span>
              <span className="block text-xs font-normal text-muted-foreground">Sign-in arrives in Phase 4</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled>
                <User /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <ShieldCheck /> Admin users
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
