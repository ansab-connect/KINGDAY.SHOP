"use server";

import { z } from "zod";
import { assertCan, getCurrentUser } from "@/features/auth/session";
import { getAdminData } from "@/features/admin/source";
import {
  getCategoryPerformance,
  getDashboardSummary,
  getLowStockProducts,
  getOrderStatusBreakdown,
  getTopProducts,
} from "@/features/dashboard/metrics";
import { geminiGenerate } from "@/lib/gemini";
import { formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin AI tools on Google Gemini. Server only; every call checks the signed-in person's
 * permission, and the data sent to the AI is read with THEIR access (RLS), so nobody can
 * ask the AI about data they couldn't open themselves.
 */

type Result = { ok: true; text: string } | { ok: false; error: string };
const failMsg = (e: "not_configured" | "limit" | "failed") =>
  e === "not_configured" ? "AI isn't set up (Gemini key missing)." : e === "limit" ? "The AI's free limit is used up for now. Try again later." : "The AI didn't answer. Please try again.";

// ---------------------------------------------------------------- Writing helper (product text)

const MODES = {
  expand: "Expand the text into a fuller, clear product description of 2-4 short paragraphs. Keep every fact; add no new facts, numbers or claims.",
  improve: "Rewrite the text to read clearly and professionally. Keep the same facts and roughly the same length.",
  shorten: "Shorten the text to at most 280 characters, keeping the most important facts.",
  malayalam: "Translate the text into natural, simple Malayalam for Kerala parents. Keep product names, numbers and units as they are.",
} as const;

export async function aiWriteAction(input: { mode: keyof typeof MODES; text: string; productName?: string }): Promise<Result> {
  try {
    await assertCan("products", "edit");
  } catch {
    try {
      await assertCan("products", "create");
    } catch {
      return { ok: false, error: "You don't have permission to edit products." };
    }
  }
  const p = z
    .object({ mode: z.enum(["expand", "improve", "shorten", "malayalam"]), text: z.string().trim().min(3, "Write a few words first.").max(10000), productName: z.string().max(160).optional() })
    .safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the text." };
  const res = await geminiGenerate({
    system: [
      "You are a copywriter for KING DAY, a kids' ride-on and toy shop in Kerala, India.",
      MODES[p.data.mode],
      "Never invent specifications, prices, offers, warranty or safety certifications. No emojis. No markdown, asterisks or headings: plain text with blank lines between paragraphs.",
      "Reply with ONLY the new text.",
    ].join("\n"),
    messages: [{ role: "user", text: `${p.data.productName ? `Product: ${p.data.productName}\n\n` : ""}Text:\n${p.data.text}` }],
    maxTokens: 4096,
    temperature: 0.4,
  });
  if (!res.ok) return { ok: false, error: failMsg(res.error) };
  return { ok: true, text: res.text.replace(/\*\*/g, "").trim().slice(0, 10000) };
}

// ---------------------------------------------------------------- Business analyst

async function businessSnapshot(): Promise<string> {
  const me = await getCurrentUser();
  const data = await getAdminData();
  const s30 = getDashboardSummary(data, 30);
  const s7 = getDashboardSummary(data, 7);
  const lines: string[] = [
    `Today: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Amounts in Indian rupees.`,
    "SALES (orders that weren't cancelled or refunded)",
    `- Last 7 days: revenue ${formatPaise(s7.revenue.value)}, orders ${s7.orders.value}.`,
    `- Last 30 days: revenue ${formatPaise(s30.revenue.value)} (${s30.revenue.change >= 0 ? "+" : ""}${s30.revenue.change.toFixed(1)}% vs previous 30 days), orders ${s30.orders.value}, average order ${formatPaise(s30.averageOrderValue)}.`,
    `- Orders needing action now: ${s30.pendingOrders}. Delivered (30 days): ${s30.completedOrders}.`,
    `- Order statuses (30 days): ${getOrderStatusBreakdown(data, 30).map((b) => `${b.status} ${b.count}`).join(", ") || "none"}.`,
    `- Top products (30 days): ${getTopProducts(data, 5, 30).map((p) => `${p.name} (${p.unitsSold30d} sold, ${formatPaise(p.revenue30d)})`).join("; ") || "none"}.`,
    `- Categories (30 days): ${getCategoryPerformance(data, 30).map((c) => `${c.category} ${formatPaise(c.revenue)} (${c.units} sold)`).join("; ") || "none"}.`,
    "CATALOGUE & STOCK",
    `- Products: ${s30.products.total} total, ${s30.products.active} live. Customers: ${s30.customers.value} (${s30.customers.newThisMonth} new this month).`,
    `- Low or out of stock: ${getLowStockProducts(data).map((p) => `${p.name} (${p.stock} left)`).join("; ") || "none"}.`,
  ];
  // Service numbers only for people who may see service (the database checks again).
  if (me && me.permissions.service?.includes("view")) {
    const supabase = await createClient();
    const { data: st } = await supabase.rpc("service_dashboard_stats");
    if (st) {
      const x = st as Record<string, number>;
      lines.push(
        "BEST FIT SERVICE",
        `- Bookings ${x.total}: new ${x.new}, inspection pending ${x.inspection_pending}, inspection done ${x.inspection_completed}, in progress ${x.in_progress}, completed ${x.completed}, cancelled ${x.cancelled}.`,
        `- Service revenue ${formatPaise(x.service_revenue)}, spare parts revenue ${formatPaise(x.spare_parts_revenue)}, pending payments ${formatPaise(x.pending_payments)}.`,
        `- Bills waiting for approval ${x.bills_to_approve}, custom parts waiting ${x.parts_to_approve}, low-stock spare parts ${x.low_stock_parts}.`,
      );
    }
  }
  return lines.join("\n");
}

export async function aiAnalystAction(input: { question: string }): Promise<Result> {
  try {
    await assertCan("analytics", "view");
  } catch {
    return { ok: false, error: "You need the Analytics permission to use the AI analyst." };
  }
  const q = z.string().trim().min(3, "Type a question.").max(600).safeParse(input.question);
  if (!q.success) return { ok: false, error: q.error.issues[0]?.message ?? "Type a question." };
  const res = await geminiGenerate({
    system: [
      "You are a business analyst for KING DAY, a small kids' ride-on and toy shop with a service department (BEST FIT) in Kozhikode, Kerala.",
      "Answer the owner's question using ONLY the data below. If the data can't answer it, say exactly what is missing. Never invent numbers.",
      "Be practical: short answer first, then up to 5 bullet points with specific next steps. Plain text; bullets start with '- '. No markdown headings or bold.",
      "",
      await businessSnapshot(),
    ].join("\n"),
    messages: [{ role: "user", text: q.data }],
    maxTokens: 2048,
    temperature: 0.3,
  });
  if (!res.ok) return { ok: false, error: failMsg(res.error) };
  return { ok: true, text: res.text.replace(/\*\*/g, "").trim() };
}
