"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { InstallAppButton } from "@/components/pwa/install-app";
import { L } from "@/components/i18n/lang";
import { LanguageSwitcher, useLang } from "@/components/i18n/language-switcher";
import { Button } from "@/components/ui/button";
import { CartCount } from "@/components/store/cart-toast";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { storeNav } from "@/config/storefront";
import { cn } from "@/lib/utils";

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

function SearchForm({ id, className }: { id: string; className?: string }) {
  const ml = useLang() === "ml";
  return (
    <form role="search" action="/shop" className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">{ml ? "ഉൽപ്പന്നങ്ങൾ തിരയുക" : "Search products"}</label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id}
        name="q"
        type="search"
        placeholder={ml ? "ജീപ്പ്, ബൈക്ക്, സ്കൂട്ടർ തിരയുക…" : "Search jeeps, bikes, scooters…"}
        className="h-11 w-full rounded-full border border-input bg-canvas pr-4 pl-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-royal-300 focus:bg-white focus:ring-3 focus:ring-royal-100"
      />
    </form>
  );
}

const actions = [
  { href: "/wishlist", icon: Heart, en: "Wishlist", ml: "വിഷ്‌ലിസ്റ്റ്" },
  { href: "/my", icon: User, en: "Account", ml: "അക്കൗണ്ട്" },
  { href: "/cart", icon: ShoppingBag, en: "Cart", ml: "കാർട്ട്" },
] as const;

export function StoreHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ml = useLang() === "ml";

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label={ml ? "മെനു തുറക്കുക" : "Open menu"}>
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Store navigation and search</SheetDescription>
              <Logo showTagline />
            </SheetHeader>
            <div className="flex flex-col gap-6 p-5">
              <SearchForm id="mobile-search" />
              <nav aria-label="Main">
                <ul className="flex flex-col">
                  {[...storeNav, ...actions.map((a) => ({ title: a.en, ml: a.ml, href: a.href }))].map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive(pathname, item.href) ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between border-b border-border/60 py-3.5 font-heading text-lg font-semibold",
                          isActive(pathname, item.href) ? "text-royal" : "text-deep",
                        )}
                      >
                        <L en={item.title} ml={item.ml} />
                        {isActive(pathname, item.href) ? <span aria-hidden className="size-1.5 rounded-full bg-gold" /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <InstallAppButton className="w-full" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground"><L en="Language" ml="ഭാഷ" /></span>
                <LanguageSwitcher />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/" aria-label="KING DAY home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {storeNav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                      active ? "text-royal" : "text-deep/75 hover:text-royal",
                    )}
                  >
                    <L en={item.title} ml={item.ml} />
                    {active ? <span aria-hidden className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <SearchForm id="header-search" className="ml-auto hidden w-full max-w-60 xl:block" />

        <div className="ml-auto flex items-center gap-0.5 xl:ml-2">
          <LanguageSwitcher className="mr-1 hidden sm:inline-flex" />
          <Button variant="ghost" size="icon" className="xl:hidden" asChild>
            <Link href="/shop" aria-label={ml ? "തിരയുക" : "Search products"}><Search /></Link>
          </Button>
          {actions.map((a) => (
            <Button key={a.href} variant="ghost" size="icon" className={a.href === "/cart" ? "" : "hidden sm:inline-flex"} asChild>
              <Link href={a.href} aria-label={ml ? a.ml : a.en} aria-current={isActive(pathname, a.href) ? "page" : undefined} className="relative">
                <a.icon />
                {a.href === "/cart" ? <CartCount /> : null}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </header>
  );
}
