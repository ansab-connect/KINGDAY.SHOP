import Link from "next/link";
import { Heart, LayoutDashboard, MapPin, Package, Settings, Wrench } from "lucide-react";
import { Container } from "@/components/store/section";

const links = [
  { href: "/account", label: "Profile", icon: LayoutDashboard },
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/service", label: "Service", icon: Wrench },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

/** Shared layout for customer account pages: horizontal tabs on mobile, sidebar on desktop. */
export function AccountShell({ active, title, children }: { active: string; title: string; children: React.ReactNode }) {
  return (
    <Container className="py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-10">
        <nav aria-label="My account" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-2 lg:flex-col lg:gap-1">
            {links.map((l) => (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={active === l.href ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors lg:rounded-lg ${
                    active === l.href ? "bg-royal text-white" : "bg-muted/60 text-deep hover:bg-royal-50 lg:bg-transparent"
                  }`}
                >
                  <l.icon aria-hidden className="size-4" /> {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
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
