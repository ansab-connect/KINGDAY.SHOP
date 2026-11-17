import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AiAnalyst } from "@/components/admin/ai-analyst";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { isGeminiConfigured } from "@/lib/gemini";

export const metadata: Metadata = { title: "AI Analyst" };

function Content() {
  if (!isGeminiConfigured()) {
    return <p className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">The AI analyst needs a Gemini key in Vercel (GEMINI_API_KEY).</p>;
  }
  return (
    <>
      <PageHeader title="AI Analyst" description="Ask about your sales, orders, stock and BEST FIT service in plain words." />
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-royal/20 bg-royal-50/60 p-3 text-sm text-deep">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-royal" />
        Answers use only your store&apos;s own numbers that you are allowed to see (no customer names, phones or addresses are sent). Always double-check before acting on them.
      </p>
      <AiAnalyst />
    </>
  );
}

export default function AiAnalystPage() {
  return (
    <StaffOnly module="analytics">
      <Content />
    </StaffOnly>
  );
}
