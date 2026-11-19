"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { openRazorpayCheckout } from "@/components/store/checkout/razorpay-checkout";
import { retryPaymentAction } from "@/features/orders/checkout-actions";
import { formatPaise } from "@/lib/format";

/** "Pay now" for an unpaid online order. A new Razorpay order is created by the server for each attempt. */
export function PayAgainButton({ orderNumber, amount, initialError }: { orderNumber: string; amount: number; initialError?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, start] = useTransition();

  const pay = () =>
    start(async () => {
      setError(null);
      const res = await retryPaymentAction(orderNumber);
      if (!res.ok) {
        if (res.paid) router.push(`/checkout/success?order=${orderNumber}`);
        else setError(res.error);
        return;
      }
      try {
        const outcome = await openRazorpayCheckout(res.payment);
        if (outcome.kind === "paid") router.push(`/checkout/success?order=${orderNumber}`);
        else if (outcome.kind === "pending") setError(outcome.message);
        else if (outcome.lastError) setError(`${outcome.lastError} You can try again.`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open the payment window.");
      }
    });

  return (
    <div className="flex w-full flex-col gap-3">
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-danger-soft p-3 text-left text-sm text-danger">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-bold tracking-wide text-deep uppercase hover:bg-gold-300 disabled:opacity-60"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Lock aria-hidden className="size-4" />}
        {pending ? "Opening secure payment…" : `Pay ${formatPaise(amount)}`}
      </button>
    </div>
  );
}
