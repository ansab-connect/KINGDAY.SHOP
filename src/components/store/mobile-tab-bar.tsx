"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBag, User, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { useCart } from "@/features/cart/cart-store";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", en: "Home", ml: "ഹോം", icon: Home, match: (p: string) => p === "/" },
  { href: "/shop", en: "Shop", ml: "ഷോപ്പ്", icon: LayoutGrid, match: (p: string) => p.startsWith("/shop") || p.startsWith("/categories") || p.startsWith("/products") || p.startsWith("/offers") },
  { href: "/book-service", en: "Service", ml: "സർവീസ്", icon: Wrench, match: (p: string) => p.startsWith("/book-service") },
  { href: "/cart", en: "Cart", ml: "കാർട്ട്", icon: ShoppingBag, match: (p: string) => p.startsWith("/cart") || p.startsWith("/checkout") },
  { href: "/account", en: "Account", ml: "അക്കൗണ്ട്", icon: User, match: (p: string) => p.startsWith("/account") || p.startsWith("/wishlist") || p === "/login" || p === "/register" },
] as const;

/** App-style bottom tab bar on phones and tablets (hidden on desktop, where the header has everything). */
export function MobileTabBar() {
  const path = usePathname();
  const count = useCart().reduce((n, i) => n + i.quantity, 0);
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[0.68rem] font-semibold", active ? "text-royal" : "text-muted-foreground")}
              >
                {active ? <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" /> : null}
                <span className="relative">
                  <t.icon aria-hidden className="size-6" strokeWidth={active ? 2.2 : 1.8} />
                  {t.href === "/cart" && count > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[0.6rem] font-bold text-deep tabular" aria-label={`${count} in cart`}>
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </span>
                <L en={t.en} ml={t.ml} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
