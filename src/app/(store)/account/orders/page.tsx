import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { ComingSoon } from "@/components/store/coming-soon";

export const metadata: Metadata = { title: "Track Order", robots: { index: false } };

export default function OrdersPage() {
  return (
    <ComingSoon
      icon={PackageSearch}
      title="Track your order"
      body="Order tracking will be available here once online ordering is live. For an existing enquiry, contact us and we'll update you."
    />
  );
}
