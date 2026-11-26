import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeCheck, ClipboardCheck, Clock3, HardHat, MapPinned, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Container } from "@/components/store/section";
import { QuickAccount } from "@/components/store/quick-account";
import { BookingForm, type CentreChoice, type ModeChoice } from "@/components/store/service/booking-form";
import { BestFitHowItWorks } from "@/components/store/service/best-fit-how-it-works";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_WHATSAPP } from "@/config/storefront";
import { isMobileLoginEmail } from "@/features/customer/mobile";
import { getCurrentUser } from "@/features/auth/session";
import { getServiceCatalog } from "@/features/service/catalog";
import { getBookingPrefill } from "@/features/service/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "BEST FIT – Service Booking",
  description: "BEST FIT by Motherbits Technologies: support, warranty and paid service for bicycles, e-cycles and ride-ons in Kozhikode — at home or at a nearby service centre.",
  alternates: { canonical: "/book-service" },
};

async function BestFit() {
  if (!isSupabaseConfigured) return <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">Service booking opens soon.</p>;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <p className="text-center text-sm text-muted-foreground">
          <L en="First time here? Create your account with your name and mobile number, then book." ml="ആദ്യമായാണോ? പേരും മൊബൈൽ നമ്പറും നൽകി അക്കൗണ്ട് ഉണ്ടാക്കി ബുക്ക് ചെയ്യൂ." />
        </p>
        <QuickAccount next="/book-service" title={<L en="Your account" ml="നിങ്ങളുടെ അക്കൗണ്ട്" />} />
        <BestFitHowItWorks />
      </div>
    );
  }
  const supabase = await createClient();
  const [{ categories, types }, prefill, { data: modes }, { data: centres }] = await Promise.all([
    getServiceCatalog(),
    getBookingPrefill(user.id),
    supabase.from("service_modes").select("slug, title, title_ml, description, kind").eq("is_active", true).order("sort_order"),
    supabase.from("service_centres").select("id, name, address, town, phone, working_hours, latitude, longitude").eq("is_active", true).order("sort_order"),
  ]);
  const activeCats = categories.filter((c) => c.is_active);
  return (
    <BookingForm
      userId={user.id}
      defaults={{ name: prefill.name || user.fullName || "", mobile: prefill.mobile, email: isMobileLoginEmail(user.email) ? "" : (user.email ?? ""), address: prefill.address, code: prefill.code }}
      purchases={prefill.purchases}
      categories={activeCats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, name_ml: c.name_ml, parent: c.parent_id }))}
      types={types.filter((t) => t.is_active).map((t) => ({ slug: t.slug, name: t.name, name_ml: t.name_ml, description: t.description }))}
      modes={(modes ?? []) as ModeChoice[]}
      centres={(centres ?? []) as CentreChoice[]}
    />
  );
}

/** Decorative hero art: a technician badge with service tools (pure SVG/CSS, no stock photo). */
function HeroArt() {
  return (
    <div aria-hidden className="relative mx-auto hidden size-72 lg:block">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(212,175,55,0.35),transparent_60%)]" />
      <div className="absolute inset-6 rounded-full border border-[#D4AF37]/40" />
      <div className="absolute inset-14 grid place-items-center rounded-full bg-gradient-to-br from-[#4B0082] to-[#1A0F2E] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]">
        <HardHat className="size-24 text-[#D4AF37]" strokeWidth={1.4} />
      </div>
      {[[Wrench, "top-2 left-10"], [ShieldCheck, "top-16 right-0"], [MapPinned, "bottom-6 left-2"], [Sparkles, "right-8 bottom-2"]].map(([Icon, pos], i) => {
        const I = Icon as typeof Wrench;
        return <span key={i} className={`absolute ${pos as string} grid size-14 place-items-center rounded-2xl border border-[#D4AF37]/50 bg-[#1A0F2E]/80 backdrop-blur`}><I className="size-6 text-[#D4AF37]" /></span>;
      })}
    </div>
  );
}

export default function BookServicePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[#1A0F2E] text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(75,0,130,0.9),transparent_60%)]" />
        <Container className="relative grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-[#D4AF37] uppercase">By Motherbits Technologies</p>
            <h1 className="mt-2 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">BEST <span className="text-[#D4AF37]">FIT</span></h1>
            <p className="mt-4 max-w-xl text-base text-white/80">
              <L en="Trusted service for bicycles, e-cycles and ride-ons — at your home or at a nearby service centre." ml="സൈക്കിൾ, ഇ-സൈക്കിൾ, റൈഡ്-ഓണുകൾ എന്നിവയ്ക്ക് വിശ്വസ്ത സർവീസ് — വീട്ടിലോ അടുത്തുള്ള സർവീസ് സെന്ററിലോ." />
            </p>
            <ul className="mt-6 grid max-w-xl gap-3 text-sm text-white/85 sm:grid-cols-2">
              <li className="flex items-center gap-2"><ClipboardCheck aria-hidden className="size-5 text-[#D4AF37]" /> <L en="We inspect first" ml="ആദ്യം പരിശോധന" /></li>
              <li className="flex items-center gap-2"><BadgeCheck aria-hidden className="size-5 text-[#D4AF37]" /> <L en="Trained technicians" ml="പരിശീലനം ലഭിച്ച ടെക്നീഷ്യൻമാർ" /></li>
              <li className="flex items-center gap-2"><Clock3 aria-hidden className="size-5 text-[#D4AF37]" /> <L en="Track every step" ml="ഓരോ ഘട്ടവും അറിയാം" /></li>
              <li className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-5 text-[#D4AF37]" /> <L en="Clear, fair charges" ml="വ്യക്തമായ നിരക്കുകൾ" /></li>
            </ul>
          </div>
          <HeroArt />
        </Container>
      </section>
      <Container className="py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <Suspense fallback={<div className="flex flex-col gap-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}</div>}>
            <BestFit />
          </Suspense>
          <a href={`https://wa.me/${OFFICIAL_WHATSAPP}?text=${encodeURIComponent("Hi BEST FIT, I need help with a service.")}`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#4B0082]">
            <WhatsAppIcon className="size-5 text-success" /> <L en="Need help? Chat with us on WhatsApp" ml="സഹായം വേണോ? വാട്സ്ആപ്പിൽ ചോദിക്കൂ" />
          </a>
        </div>
      </Container>
    </>
  );
}
