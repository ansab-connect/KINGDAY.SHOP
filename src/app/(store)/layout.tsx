import { L } from "@/components/i18n/lang";
import { InstallBanner } from "@/components/pwa/install-app";
import { CartSync } from "@/components/store/cart-sync";
import { MobileTabBar } from "@/components/store/mobile-tab-bar";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { isSupabaseConfigured } from "@/lib/env";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-royal focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <p role="note" className="bg-gold-100 px-4 py-1.5 text-center text-xs font-medium text-gold-800">
        {isSupabaseConfigured ? (
          <L
            en="Pre-launch: online ordering opens soon. Enquire on WhatsApp in the meantime."
            ml="ഓൺലൈൻ ഓർഡർ ഉടൻ ആരംഭിക്കും. അതുവരെ WhatsApp-ൽ അന്വേഷിക്കൂ."
          />
        ) : (
          "Preview store: products, prices and reviews are sample data. Ordering opens at launch."
        )}
      </p>
      <div className="bg-deep px-4 py-2 text-center text-[0.7rem] font-semibold tracking-[0.2em] text-gold uppercase">
        <L en="Every child deserves a royal ride" ml="ഓരോ കുഞ്ഞിനും ഒരു രാജകീയ യാത്ര" />
      </div>
      <StoreHeader />
      <main id="main" className="flex-1">{children}</main>
      <StoreFooter />
      {isSupabaseConfigured ? <CartSync /> : null}
      <MobileTabBar />
      <InstallBanner />
    </div>
  );
}
