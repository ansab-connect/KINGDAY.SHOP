import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, Boxes, ClipboardList, PackageCheck, PackageOpen, ShoppingBag, Truck, UserRound } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Skeleton } from "@/components/ui/skeleton";
import { can, requireTeam, type SessionUser } from "@/features/auth/session";
import { getStaffRecord } from "@/features/staff/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

type Stat = { key: string; en: string; ml: string; value: number; href: string; icon: typeof ShoppingBag; tone?: "warn" | "danger" };

/** Which numbers matter most for each staff category (shown first). */
const FOCUS: Record<string, string[]> = {
  "Sales Staff": ["today", "pending"],
  "Billing Staff": ["pending", "today"],
  "Product Management Staff": ["drafts", "active"],
  "Inventory Staff": ["out", "low"],
  "Packing & Dispatch Staff": ["toPack", "packed"],
  "Customer Support Staff": ["pending", "today"],
};

async function loadStats(user: SessionUser): Promise<Stat[]> {
  const supabase = await createClient();
  const stats: Stat[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  if (can(user, "orders")) {
    const orders = () => supabase.from("orders").select("id", { count: "exact", head: true });
    const [todayN, pending, toPack, packed] = await Promise.all([
      count(orders().gte("placed_at", today.toISOString())),
      count(orders().in("status", ["new", "pending"])),
      count(orders().in("status", ["confirmed", "processing"])),
      count(orders().eq("status", "packed")),
    ]);
    stats.push(
      { key: "today", en: "Orders today", ml: "ഇന്നത്തെ ഓർഡറുകൾ", value: todayN, href: "/admin/orders", icon: ShoppingBag },
      { key: "pending", en: "New / pending orders", ml: "പുതിയ ഓർഡറുകൾ", value: pending, href: "/admin/orders?status=new", icon: ClipboardList, tone: pending ? "warn" : undefined },
      { key: "toPack", en: "To pack", ml: "പാക്ക് ചെയ്യാൻ", value: toPack, href: "/admin/orders?status=confirmed", icon: PackageOpen },
      { key: "packed", en: "Packed, to ship", ml: "അയയ്ക്കാൻ തയ്യാർ", value: packed, href: "/admin/orders?status=packed", icon: Truck },
    );
  }
  if (can(user, "inventory")) {
    const { data } = await supabase.from("inventory").select("on_hand, reorder_level").limit(5000);
    const rows = (data ?? []) as { on_hand: number; reorder_level: number }[];
    const out = rows.filter((r) => r.on_hand <= 0).length;
    const low = rows.filter((r) => r.on_hand > 0 && r.on_hand <= r.reorder_level).length;
    stats.push(
      { key: "out", en: "Out of stock", ml: "സ്റ്റോക്ക് ഇല്ല", value: out, href: "/admin/inventory", icon: AlertTriangle, tone: out ? "danger" : undefined },
      { key: "low", en: "Low stock", ml: "സ്റ്റോക്ക് കുറവ്", value: low, href: "/admin/inventory", icon: Boxes, tone: low ? "warn" : undefined },
    );
  }
  if (can(user, "products")) {
    const products = () => supabase.from("products").select("id", { count: "exact", head: true });
    const [drafts, active] = await Promise.all([count(products().eq("status", "draft")), count(products().eq("status", "active"))]);
    stats.push(
      { key: "drafts", en: "Draft products", ml: "ഡ്രാഫ്റ്റ് ഉൽപ്പന്നങ്ങൾ", value: drafts, href: "/admin/products", icon: PackageCheck },
      { key: "active", en: "Live products", ml: "ലൈവ് ഉൽപ്പന്നങ്ങൾ", value: active, href: "/admin/products", icon: PackageCheck },
    );
  }
  return stats;
}

async function Dashboard() {
  const user = await requireTeam();
  const [record, stats] = await Promise.all([getStaffRecord(user.id, user.email), loadStats(user)]);
  const focus = FOCUS[record?.categoryName ?? ""] ?? [];
  const ordered = [...stats].sort((a, b) => {
    const ia = focus.indexOf(a.key);
    const ib = focus.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const missing = [
    !record?.personal.photoUrl && "photo",
    !record?.personal.emergencyPhone && "emergency contact",
    !record?.personal.address && "address",
  ].filter(Boolean) as string[];
  const first = (user.fullName ?? "").split(/\s+/)[0] || "there";

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-2xl bg-deep p-6 text-white sm:p-8">
        <div aria-hidden className="absolute -top-20 -right-20 size-64 rounded-full bg-royal/60 blur-3xl" />
        <p className="relative text-xs font-semibold tracking-[0.18em] text-gold uppercase">{record?.staffCode ?? "KING DAY team"}</p>
        <h1 className="relative mt-2 text-2xl font-bold sm:text-3xl">
          <L en={`Hello, ${first}`} ml={`നമസ്കാരം, ${first}`} />
        </h1>
        <p className="relative mt-1 text-sm text-white/70">
          {[record?.designation, record?.categoryName].filter(Boolean).join(" · ") || <L en="Welcome to your dashboard." ml="നിങ്ങളുടെ ഡാഷ്ബോർഡിലേക്ക് സ്വാഗതം." />}
        </p>
      </section>

      {missing.length ? (
        <Link href="/staff/profile" className="flex items-center gap-3 rounded-2xl border border-gold-300 bg-gold-50 p-4 text-sm text-gold-800 hover:bg-gold-100">
          <UserRound aria-hidden className="size-5 shrink-0" />
          <span className="flex-1">
            <L en={`Complete your profile: add your ${missing.join(", ")}.`} ml="നിങ്ങളുടെ പ്രൊഫൈൽ പൂർത്തിയാക്കൂ." />
          </span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}

      {ordered.length ? (
        <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ordered.map((s) => (
            <Link key={s.key} href={s.href} className="group flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card transition-shadow hover:shadow-lift">
              <span className={cn("grid size-9 place-items-center rounded-xl", s.tone === "danger" ? "bg-danger-soft text-danger" : s.tone === "warn" ? "bg-warning-soft text-warning" : "bg-royal-50 text-royal")}>
                <s.icon aria-hidden className="size-4" />
              </span>
              <span>
                <span className="block font-heading text-2xl font-bold text-deep tabular">{s.value.toLocaleString("en-IN")}</span>
                <span className="block text-xs text-muted-foreground"><L en={s.en} ml={s.ml} /></span>
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground shadow-card">
          <L
            en="Your work items appear here as your access is set up. Keep your profile up to date."
            ml="നിങ്ങളുടെ ജോലികൾ ഇവിടെ കാണാം. പ്രൊഫൈൽ പുതുക്കി വയ്ക്കൂ."
          />
        </section>
      )}
    </div>
  );
}

export default function StaffDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-36 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
