import Link from "next/link";
import { Bell, Heart, LayoutDashboard, MapPin,
  ChevronDown, Sparkles, Package, Settings, ShoppingBag, ShoppingCart, Wrench } from "lucide-react";
import { Container } from "@/components/store/section";

const links = [
  { href: "/account", label: "My Profile", icon: LayoutDashboard },
  { href: "/account/orders", label: "My Orders", icon: Package },
  { href: "/cart", label: "Product Cart", icon: ShoppingBag },
  { href: "/account/service", label: "My Services", icon: Wrench },
  { href: "/cart?tab=services", label: "Service Cart", icon: ShoppingCart },
  { href: "/account/characters", label: "My Characters", icon: Sparkles },
  { href: "/account/addresses", label: "Saved Addresses", icon: MapPin },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

function AccountMenu({ active, className }: { active: string; className?: string }) {
  return (
    <nav aria-label="My account" className={className}>
      <ul className="flex flex-col gap-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active === l.href ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active === l.href ? "bg-royal text-white" : "text-deep hover:bg-royal-50"
              }`}
            >
              <l.icon aria-hidden className="size-4" /> {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shared layout for customer account pages: a vertical menu (collapsible on mobile, sidebar on desktop). */
export function AccountShell({ active, title, children }: { active: string; title: string; children: React.ReactNode }) {
  return (
    <Container className="py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-10">
        {/* Mobile: a vertical menu that opens from the current page's name. Desktop: sidebar. */}
        <details className="group rounded-2xl border bg-white lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-deep">
            {(() => {
              const current = links.find((l) => l.href === active) ?? links[0];
              return (
                <>
                  <current.icon aria-hidden className="size-4 text-royal" /> {current.label}
                </>
              );
            })()}
            <span className="ml-auto text-xs font-medium text-muted-foreground">Menu</span>
            <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <AccountMenu active={active} className="border-t p-2" />
        </details>
        <AccountMenu active={active} className="hidden lg:block" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-deep sm:text-3xl">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </Container>
  );
}

export const fieldClass =
  "h-11 w-full rounded-xl border border-input bg-white px-4 text-sm text-deep outline-none focus:border-royal-300 focus:ring-3 focus:ring-royal-100 aria-invalid:border-danger";
