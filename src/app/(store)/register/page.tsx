import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Faster checkout, order tracking and a wishlist for your favourite rides."
      footer={<p>Already have an account? <Link href="/login" className="font-medium text-royal hover:underline">Sign in</Link></p>}
    >
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        fields={[
          { name: "fullName", label: "Full name", type: "text", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
        ]}
      />
      <p className="mt-5 text-xs text-muted-foreground">
        By creating an account you agree to our <Link href="/policies/terms" className="underline">Terms</Link> and{" "}
        <Link href="/policies/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </AuthCard>
  );
}
