import { BadgeCheck, ShieldCheck, Truck, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { InstallBanner } from "@/components/pwa/install-app";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { CartSync } from "@/components/store/cart-sync";
import { CartToast } from "@/components/store/cart-toast";
import { MobileTabBar } from "@/components/store/mobile-tab-bar";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { isSupabaseConfigured } from "@/lib/env";
import { isGeminiConfigured } from "@/lib/gemini";
import { AiChat } from "@/components/store/ai-chat";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-royal focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      {/* Local preview only (no database): warn that the data is sample data. */}
      {isSupabaseConfigured ? null : (
        <p role="note" className="bg-gold-100 px-4 py-1.5 text-center text-xs font-medium text-gold-800">
          Preview store: products, prices and reviews are sample data.
        </p>
      )}
      <div className="bg-royal text-white">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-6 px-4 text-[0.7rem] font-medium sm:justify-between sm:text-xs lg:h-11 lg:px-8 lg:text-sm">
          <span className="flex items-center gap-2"><Truck aria-hidden className="size-4 text-gold" /> <L en="Free delivery on prepaid orders" ml="പ്രീപെയ്ഡിന് സൗജന്യ ഡെലിവറി" /></span>
          <span className="hidden items-center gap-2 sm:flex"><ShieldCheck aria-hidden className="size-4 text-gold" /> <L en="Trusted & Safe Shopping" ml="സുരക്ഷിത ഷോപ്പിംഗ്" /></span>
          <span className="hidden items-center gap-2 md:flex"><BadgeCheck aria-hidden className="size-4 text-gold" /> <L en="Genuine Products" ml="യഥാർത്ഥ ഉൽപ്പന്നങ്ങൾ" /></span>
          <a href="/book-service" className="hidden items-center gap-1.5 rounded-full bg-gold px-4 py-1 font-semibold text-deep hover:bg-gold-300 lg:inline-flex">
            <Wrench aria-hidden className="size-3.5" /> <L en="Book a Service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />
          </a>
        </div>
      </div>
      <StoreHeader />
      <main id="main" className="flex-1">{children}</main>
      <StoreFooter />
      {isSupabaseConfigured ? <CartSync /> : null}
      <MobileTabBar />
      <CartToast />
      <MetaPixel />
      {isGeminiConfigured() ? <AiChat /> : null}
      <InstallBanner />
    </div>
  );
}
