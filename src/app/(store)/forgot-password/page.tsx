import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordResetApproval } from "@/features/auth/password-reset";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

/**
 * Forgot password: the customer proposes a new password; our team confirms it's them
 * (a call to the registered mobile) and approves it. The old password works until then.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your registered mobile number or email and choose a new password. Our team confirms it's you before it is switched on."
      footer={
        <>
          <p className="mb-3 text-xs">
            For your safety, a KING DAY team member approves every password reset. Need it faster? Message us on WhatsApp at +91 94959 02904 from your registered number.
          </p>
          <Link href="/login" className="font-medium text-royal hover:underline">Back to sign in</Link>
        </>
      }
    >
      <AuthForm
        action={requestPasswordResetApproval}
        submitLabel="Send reset request"
        fields={[
          { name: "login", label: "Registered mobile number or email", type: "text", autoComplete: "username", inputMode: "email" },
          { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
          { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthCard>
  );
}
