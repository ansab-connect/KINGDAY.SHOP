import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata: Metadata = { title: "You're offline", robots: { index: false, follow: false } };

/** Static page the service worker shows when there is no connection. No data, no account details. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-deep px-6 text-center text-white">
      <div className="flex max-w-sm flex-col items-center gap-5">
        <Logo tone="light" />
        <span className="grid size-16 place-items-center rounded-2xl bg-white/10 text-gold">
          <WifiOff aria-hidden className="size-8" />
        </span>
        <h1 className="text-2xl font-bold">You&apos;re offline</h1>
        <p className="text-sm text-white/70">
          Check your internet connection and try again. Your cart and account are safe.
          <span className="mt-2 block" lang="ml">ഇന്റർനെറ്റ് കണക്ഷൻ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കൂ.</span>
        </p>
        <RetryButton />
      </div>
    </main>
  );
}
