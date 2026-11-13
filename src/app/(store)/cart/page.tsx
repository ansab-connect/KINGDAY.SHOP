import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { ComingSoon } from "@/components/store/coming-soon";

export const metadata: Metadata = { title: "Cart", robots: { index: false } };

export default function CartPage() {
  return (
    <ComingSoon
      icon={ShoppingBag}
      title="Your cart"
      body="Online ordering opens at launch. Until then, enquire on WhatsApp from any product page and our team will help you order."
    />
  );
}
