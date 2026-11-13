import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";

const showPreviewBanner = process.env.NEXT_PUBLIC_USE_PREVIEW_DATA !== "false";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-royal focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      {showPreviewBanner ? (
        <p role="note" className="bg-gold-100 px-4 py-1.5 text-center text-xs font-medium text-gold-800">
          Preview store: products, prices and reviews are sample data. Ordering opens at launch.
        </p>
      ) : null}
      <div className="bg-deep px-4 py-2 text-center text-[0.7rem] font-semibold tracking-[0.2em] text-gold uppercase">
        Every child deserves a royal ride
      </div>
      <StoreHeader />
      <main id="main" className="flex-1">{children}</main>
      <StoreFooter />
    </div>
  );
}
