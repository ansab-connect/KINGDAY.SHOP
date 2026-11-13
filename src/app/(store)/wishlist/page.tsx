import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { ComingSoon } from "@/components/store/coming-soon";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <ComingSoon
      icon={Heart}
      title="Your wishlist"
      body="Save your favourite rides once customer accounts are live."
    />
  );
}
