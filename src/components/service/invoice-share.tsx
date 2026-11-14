"use client";

import { Printer } from "lucide-react";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";

/** Print / Save as PDF (browser) and share on WhatsApp. Hidden when printing. */
export function InvoiceShare({ whatsappText, phone }: { whatsappText: string; phone: string }) {
  const to = phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-royal px-5 text-sm font-semibold text-white hover:bg-royal-800">
        <Printer aria-hidden className="size-4" /> Print / Save as PDF
      </button>
      <a href={`https://wa.me/${to}?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-semibold text-white hover:bg-[#1fb457]">
        <WhatsAppIcon className="size-4" /> Send to customer
      </a>
    </div>
  );
}
