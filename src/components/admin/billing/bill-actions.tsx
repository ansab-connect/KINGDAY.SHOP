"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { cancelBillAction } from "@/features/billing/actions";

/** Send the bill on WhatsApp to the customer's number (opens WhatsApp with the text ready). */
export function ShareBill({ phone, text }: { phone: string | null; text: string }) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  const href = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#25d366] px-3 text-sm font-semibold text-white hover:brightness-95">
      <WhatsAppIcon className="size-4" /> WhatsApp
    </a>
  );
}

/** Two-step cancel with a reason. Sale stock goes back automatically. */
export function CancelBill({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/30 bg-white px-3 text-sm font-medium text-danger hover:bg-danger-soft">
        <XCircle aria-hidden className="size-4" /> Cancel bill
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-white p-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (e.g. returned, wrong bill)" aria-label="Reason for cancelling" className="h-9 min-w-0 flex-1 rounded-md border px-2 text-sm" />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await cancelBillAction(id, reason);
            if (!r.ok) return setError(r.error);
            setOpen(false);
            router.refresh();
          })
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-danger px-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null} Confirm cancel
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-9 px-2 text-sm text-muted-foreground">Keep</button>
      {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
    </div>
  );
}
