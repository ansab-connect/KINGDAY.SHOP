"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, Search, ShoppingBag, User, Wrench } from "lucide-react";
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
        className="h-10 w-full rounded-full border border-input bg-canvas pr-4 pl-10 text-base outline-none sm:text-sm lg:h-11 transition-colors placeholder:text-muted-foreground focus:border-royal-300 focus:bg-white focus:ring-3 focus:ring-royal-100"
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:h-[4.25rem] lg:gap-6 lg:px-8">
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
              <nav aria-label="Main">
                <ul className="flex flex-col">
                  {[...storeNav, ...actions.map((a) => ({ title: a.en, ml: a.ml, href: a.href }))].map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive(pathname, item.href) ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between border-b border-border/60 py-3.5 text-base font-semibold",
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

        <SearchForm id="header-search" className="hidden flex-1 lg:block lg:max-w-xl" />

        <div className="ml-auto flex items-center gap-0.5 lg:gap-1">
          <LanguageSwitcher className="mr-1 hidden sm:inline-flex" />
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              aria-label={ml ? a.ml : a.en}
              aria-current={isActive(pathname, a.href) ? "page" : undefined}
              className={cn(
                "relative inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-deep transition-colors hover:bg-royal-50 hover:text-royal",
                a.href === "/cart" ? "" : "hidden sm:inline-flex",
                isActive(pathname, a.href) && "text-royal",
              )}
            >
              <span className="relative">
                <a.icon aria-hidden className="size-5" />
                {a.href === "/cart" ? <CartCount /> : null}
              </span>
              <span className="hidden xl:inline">
                <L en={a.en} ml={a.ml} />
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile: search always at hand. Desktop: the main navigation. */}
      {pathname.startsWith("/checkout") ? null : (
        <div className="px-4 pb-2.5 sm:px-6 lg:hidden">
          <SearchForm id="mobile-search" />
        </div>
      )}
      <nav aria-label="Main" className="hidden border-t border-border/60 lg:block">
        <ul className="mx-auto flex h-11 max-w-7xl items-center gap-1 px-6 lg:px-8">
          {storeNav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-11 items-center px-3 text-sm font-medium whitespace-nowrap transition-colors",
                    active ? "text-royal" : "text-deep/70 hover:text-royal",
                  )}
                >
                  <L en={item.title} ml={item.ml} />
                  {active ? <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold" /> : null}
                </Link>
              </li>
            );
          })}
          <li className="ml-auto">
            <Link href="/book-service" className="flex h-11 items-center gap-1.5 px-3 text-sm font-semibold text-royal hover:underline">
              <Wrench aria-hidden className="size-4 text-gold-600" /> <L en="Book Service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
