import { Suspense } from "react";
import { AnnouncementBar, AnnouncementBarView } from "@/components/store/announcement-bar";
import { DEFAULT_ANNOUNCEMENTS } from "@/features/marketing/announcements";
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
      <Suspense fallback={<AnnouncementBarView items={DEFAULT_ANNOUNCEMENTS} />}>
        <AnnouncementBar />
      </Suspense>
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
