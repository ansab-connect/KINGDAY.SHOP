"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { L } from "@/components/i18n/lang";
import { signIn, signUp } from "@/features/auth/actions";
import { cn } from "@/lib/utils";
import { useCompany } from "@/components/company-provider";

/**
 * First purchase or booking: new customers register with name + mobile on the spot;
 * returning customers sign in with their mobile number. Then they come straight back.
 */
export function QuickAccount({ next, title, initialTab = "new" }: { next: string; title?: React.ReactNode; initialTab?: "new" | "returning" }) {
  const [tab, setTab] = useState<"new" | "returning">(initialTab);
  const [useEmail, setUseEmail] = useState(false);
  const company = useCompany();
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
            {t === "new" ? <L en="New customer" ml="പുതിയ ഉപഭോക്താവ്" /> : <L en="Sign in" ml="ലോഗിൻ" />}
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
            { name: "password", label: "Create a password", type: "password", autoComplete: "new-password", hint: "At least 8 characters. Next time, sign in with just your mobile number and this password." },
          ]}
        />
      ) : (
        <>
          <AuthForm
            key={useEmail ? "returning-email" : "returning"}
            action={signIn}
            submitLabel="Sign in & continue"
            hidden={{ next }}
            fields={[
              useEmail
                ? { name: "login", label: "Email", type: "email", autoComplete: "username", inputMode: "email" }
                : { name: "login", label: "Mobile number", type: "tel", autoComplete: "username", inputMode: "tel", hint: "The number you registered with. +91, spaces or a leading 0 are fine." },
              { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link href="/forgot-password" className="font-medium text-royal hover:underline">Forgot your password?</Link>
            <button type="button" onClick={() => setUseEmail((v) => !v)} className="text-muted-foreground hover:text-deep">{useEmail ? "Use mobile number" : "Use email instead"}</button>
          </div>
          <a href={`https://wa.me/${company.whatsapp}?text=${encodeURIComponent("Hi KING DAY, I need help signing in.")}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366]/10 px-4 py-3 text-center text-sm font-semibold text-[#128C7E]">
            <L en="Trouble signing in? Message us on WhatsApp" ml="ലോഗിൻ ചെയ്യാൻ പ്രശ്നമുണ്ടോ? WhatsApp-ൽ മെസേജ് ചെയ്യൂ" />
          </a>
        </>
      )}
    </div>
  );
}
