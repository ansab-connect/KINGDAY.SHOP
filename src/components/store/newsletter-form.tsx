"use client";

import { useState } from "react";
import { Check } from "lucide-react";

/**
 * Newsletter sign-up UI. No data is sent anywhere yet: the subscriber list and
 * consent storage arrive with Supabase (Phase 4/7).
 */
export function NewsletterForm() {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm text-white">
        <Check aria-hidden className="size-4 text-gold" />
        Thank you. Newsletter sign-ups open at launch.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
      className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
    >
      <label htmlFor="newsletter-email" className="sr-only">Email address</label>
      <input
        id="newsletter-email"
        type="email"
        required
        autoComplete="email"
        placeholder="Your email address"
        className="h-12 flex-1 rounded-full border border-white/15 bg-white/10 px-5 text-sm text-white outline-none placeholder:text-white/50 focus:border-gold focus:ring-3 focus:ring-gold/25"
      />
      <button
        type="submit"
        className="h-12 rounded-full bg-gold px-6 text-sm font-semibold text-deep transition-colors hover:bg-gold-300 focus-visible:ring-3 focus-visible:ring-gold/40 focus-visible:outline-none"
      >
        Subscribe
      </button>
    </form>
  );
}
