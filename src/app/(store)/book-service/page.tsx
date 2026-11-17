import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Battery, ClipboardCheck, Cog, Package, Phone, Search, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Container } from "@/components/store/section";
import { QuickAccount } from "@/components/store/quick-account";
import { BookingForm } from "@/components/store/service/booking-form";
import { BestFitHowItWorks } from "@/components/store/service/best-fit-how-it-works";
import { WhatsAppIcon } from "@/components/store/whatsapp-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFICIAL_WHATSAPP } from "@/config/storefront";
import { isMobileLoginEmail } from "@/features/customer/mobile";
import { getCurrentUser } from "@/features/auth/session";
import { getServiceCatalog, type ServiceOption } from "@/features/service/catalog";
import { getBookingPrefill } from "@/features/service/queries";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "BEST FIT – Service & Fitting",
  description: "BEST FIT by KING DAY: service, repair and fitting for kids' electric jeeps, bikes, scooters, cycles and toys in Kozhikode. We inspect first, then share the cost.",
  alternates: { canonical: "/book-service" },
};

const ICONS = { wrench: Wrench, cog: Cog, battery: Battery, search: Search, package: Package, sparkles: Sparkles, phone: Phone } as const;

function OptionCard({ o }: { o: ServiceOption }) {
  const Icon = ICONS[o.icon] ?? Wrench;
  const body = (
    <>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-royal-50 text-royal">
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-lg font-semibold text-deep"><L en={o.title} ml={o.title_ml ?? o.title} /></span>
        {o.description ? <span className="mt-0.5 block text-sm text-muted-foreground"><L en={o.description} ml={o.description_ml ?? o.description} /></span> : null}
      </span>
      {o.workflow === "enquiry" ? <WhatsAppIcon className="size-5 shrink-0 text-success" /> : <ArrowRight aria-hidden className="size-5 shrink-0 text-royal" />}
    </>
  );
  const cls = "flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-card transition-shadow hover:border-royal/40 hover:shadow-lift";
  if (o.workflow === "enquiry") {
    const text = `Hi KING DAY BEST FIT, I need help with: ${o.title}`;
    return (
      <a href={`https://wa.me/${OFFICIAL_WHATSAPP}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={`/book-service?option=${o.slug}`} className={cls}>
      {body}
    </Link>
  );
}

async function BestFit({ searchParams }: PageProps<"/book-service">) {
  if (!isSupabaseConfigured) {
    return <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">Service booking opens soon.</p>;
  }
  const raw = (await searchParams).option;
  const { options, categories, types } = await getServiceCatalog();
  const active = options.filter((o) => o.is_active);
  const chosen = active.find((o) => o.slug === raw && o.workflow === "booking");

  if (!chosen) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-heading text-xl font-semibold text-deep"><L en="What do you need?" ml="എന്താണ് വേണ്ടത്?" /></h2>
        {active.length === 0 ? (
          <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">Booking options will appear here soon. Please contact us on WhatsApp.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {active.map((o) => <OptionCard key={o.id} o={o} />)}
          </div>
        )}
        <BestFitHowItWorks />
      </div>
    );
  }

  const user = await getCurrentUser();
  const back = (
    <Link href="/book-service" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-royal hover:underline">
      <ArrowLeft aria-hidden className="size-4" /> <L en="All BEST FIT options" ml="എല്ലാ ഓപ്ഷനുകളും" />
    </Link>
  );
  if (!user) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        {back}
        <p className="text-center text-sm text-muted-foreground">
          <L en="First time here? Create your account with your name and mobile number, then book." ml="ആദ്യമായാണോ? പേരും മൊബൈൽ നമ്പറും നൽകി അക്കൗണ്ട് ഉണ്ടാക്കി ബുക്ക് ചെയ്യൂ." />
        </p>
        <QuickAccount next={`/book-service?option=${chosen.slug}`} title={<L en="Your KING DAY account" ml="നിങ്ങളുടെ KING DAY അക്കൗണ്ട്" />} />
      </div>
    );
  }
  const prefill = await getBookingPrefill(user.id);
  const activeCats = categories.filter((c) => c.is_active);
  return (
    <div className="flex flex-col gap-4">
      {back}
      <h2 className="font-heading text-xl font-semibold text-deep"><L en={chosen.title} ml={chosen.title_ml ?? chosen.title} /></h2>
      <BookingForm
        userId={user.id}
        defaults={{ name: prefill.name || user.fullName || "", mobile: prefill.mobile, email: isMobileLoginEmail(user.email) ? "" : (user.email ?? ""), address: prefill.address, code: prefill.code }}
        purchases={prefill.purchases}
        option={{ slug: chosen.slug, title: chosen.title, title_ml: chosen.title_ml, defaultType: chosen.default_service_type }}
        categories={activeCats.map((c) => ({ slug: c.slug, name: c.name, name_ml: c.name_ml, parent: c.parent_id }))}
        types={types.filter((t) => t.is_active).map((t) => ({ slug: t.slug, name: t.name, name_ml: t.name_ml }))}
      />
    </div>
  );
}

export default function BookServicePage(props: PageProps<"/book-service">) {
  return (
    <>
      <section className="bg-deep text-white">
        <Container className="py-8 sm:py-12">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase"><L en="KING DAY Service & Fitting" ml="KING DAY സർവീസ് & ഫിറ്റിംഗ്" /></p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">BEST FIT</h1>
          <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
            <L
              en="Service, repair and fitting for jeeps, bikes, scooters, cycles and toys, bought from us or anywhere else."
              ml="ജീപ്പ്, ബൈക്ക്, സ്കൂട്ടർ, സൈക്കിൾ, കളിപ്പാട്ടങ്ങൾ എന്നിവയുടെ സർവീസ്, റിപ്പയർ, ഫിറ്റിംഗ്."
            />
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
            <li className="flex items-center gap-2"><ClipboardCheck aria-hidden className="size-4 text-gold" /> <L en="We inspect first" ml="ആദ്യം പരിശോധന" /></li>
            <li className="flex items-center gap-2"><Search aria-hidden className="size-4 text-gold" /> <L en="Track every step" ml="ഓരോ ഘട്ടവും അറിയാം" /></li>
            <li className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-4 text-gold" /> <L en="Trained technicians" ml="പരിശീലനം ലഭിച്ച ടെക്നീഷ്യൻമാർ" /></li>
          </ul>
        </Container>
      </section>
      <Container className="py-8 sm:py-12">
        <Suspense fallback={<div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}>
          <BestFit {...props} />
        </Suspense>
      </Container>
    </>
  );
}
