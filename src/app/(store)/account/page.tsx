import type { Metadata } from "next";
import { User } from "lucide-react";
import { ComingSoon } from "@/components/store/coming-soon";

export const metadata: Metadata = { title: "My Account", robots: { index: false } };

export default function AccountPage() {
  return (
    <ComingSoon
      icon={User}
      title="My account"
      body="Sign in, saved addresses, order history and tracking will be available here once customer accounts are live."
    />
  );
}
