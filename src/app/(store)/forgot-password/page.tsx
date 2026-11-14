import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordReset } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <>
          <p className="mb-3 text-xs">
            Registered with your mobile number only? Message us on WhatsApp at +91 94959 02904 from that number and we&apos;ll send you a secure link to reset your password.
          </p>
          <Link href="/login" className="font-medium text-royal hover:underline">Back to sign in</Link>
        </>
      }
    >
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      />
    </AuthCard>
  );
}
