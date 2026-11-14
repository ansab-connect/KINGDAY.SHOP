"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { L } from "@/components/i18n/lang";
import { signIn, signUp } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

/**
 * First purchase or booking: new customers register with name + mobile on the spot;
 * returning customers sign in with their mobile number. Then they come straight back.
 */
export function QuickAccount({ next, title }: { next: string; title?: React.ReactNode }) {
  const [tab, setTab] = useState<"new" | "returning">("new");
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-card sm:p-6">
      {title ? <h2 className="font-heading text-lg font-semibold text-deep">{title}</h2> : null}
      <div role="tablist" aria-label="Account" className="grid grid-cols-2 rounded-xl bg-muted p-1">
        {(["new", "returning"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-10 rounded-lg text-sm font-semibold", tab === t ? "bg-white text-royal shadow-sm" : "text-muted-foreground")}
          >
            {t === "new" ? <L en="New customer" ml="പുതിയ ഉപഭോക്താവ്" /> : <L en="I have an account" ml="അക്കൗണ്ട് ഉണ്ട്" />}
          </button>
        ))}
      </div>
      {tab === "new" ? (
        <AuthForm
          key="new"
          action={signUp}
          submitLabel="Create account & continue"
          hidden={{ next }}
          fields={[
            { name: "fullName", label: "Full name", type: "text", autoComplete: "name" },
            { name: "mobile", label: "Mobile number", type: "tel", autoComplete: "tel", inputMode: "tel" },
            { name: "password", label: "Create a password", type: "password", autoComplete: "new-password", hint: "At least 8 characters. You'll use your mobile number and this password to sign in." },
          ]}
        />
      ) : (
        <>
          <AuthForm
            key="returning"
            action={signIn}
            submitLabel="Sign in & continue"
            hidden={{ next }}
            fields={[
              { name: "login", label: "Mobile number or email", type: "text", autoComplete: "username", inputMode: "email" },
              { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
            ]}
          />
          <Link href="/forgot-password" className="text-sm font-medium text-royal hover:underline">Forgot your password?</Link>
        </>
      )}
    </div>
  );
}
