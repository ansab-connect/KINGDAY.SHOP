import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clock, MapPin, ShieldCheck, Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { Container } from "@/components/store/section";
import { BookingForm } from "@/components/store/service/booking-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/features/auth/session";
import { getBookingPrefill } from "@/features/service/queries";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: "Book a Service",
  description: "Book doorstep service and repair for kids' electric jeeps, bikes, scooters, cycles and toys in Kozhikode.",
  alternates: { canonical: "/book-service" },
};

async function BookingContent() {
  if (!isSupabaseConfigured) {
    return <p className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">Service booking opens soon.</p>;
  }
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-card">
        <Wrench aria-hidden className="size-10 text-royal" />
        <h2 className="text-xl font-bold text-deep"><L en="Sign in to book a service" ml="സർവീസ് ബുക്ക് ചെയ്യാൻ സൈൻ ഇൻ ചെയ്യുക" /></h2>
        <p className="text-sm text-muted-foreground">
          <L en="Signing in lets us show your KING DAY purchases and keep you updated on the repair." ml="നിങ്ങളുടെ പർച്ചേസുകൾ കാണിക്കാനും റിപ്പയർ വിവരങ്ങൾ അറിയിക്കാനും ഇത് സഹായിക്കും." />
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/login?next=/book-service" className="inline-flex h-11 items-center rounded-full bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800"><L en="Sign in" ml="സൈൻ ഇൻ" /></Link>
          <Link href="/register?next=/book-service" className="inline-flex h-11 items-center rounded-full border px-6 text-sm font-semibold text-deep hover:bg-muted"><L en="Create account" ml="അക്കൗണ്ട് ഉണ്ടാക്കുക" /></Link>
        </div>
      </div>
    );
  }
  const prefill = await getBookingPrefill(user.id);
  return (
    <BookingForm
      userId={user.id}
      defaults={{ name: prefill.name || user.fullName || "", mobile: prefill.mobile, email: user.email ?? "", address: prefill.address }}
      purchases={prefill.purchases}
    />
  );
}

export default function BookServicePage() {
  return (
    <>
      <section className="bg-deep text-white">
        <Container className="py-10 sm:py-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase"><L en="KING DAY Service" ml="KING DAY സർവീസ്" /></p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl"><L en="Book a service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" /></h1>
          <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
            <L
              en="Repairs and servicing for jeeps, bikes, scooters, cycles and toys, bought from us or anywhere else."
              ml="ജീപ്പ്, ബൈക്ക്, സ്കൂട്ടർ, സൈക്കിൾ, കളിപ്പാട്ടങ്ങൾ എന്നിവയുടെ റിപ്പയറും സർവീസും."
            />
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
            <li className="flex items-center gap-2"><MapPin aria-hidden className="size-4 text-gold" /> <L en="Doorstep visits" ml="വീട്ടിലെത്തി സർവീസ്" /></li>
            <li className="flex items-center gap-2"><Clock aria-hidden className="size-4 text-gold" /> <L en="Pick your date" ml="തീയതി തിരഞ്ഞെടുക്കൂ" /></li>
            <li className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-4 text-gold" /> <L en="Trained technicians" ml="പരിശീലനം ലഭിച്ച ടെക്നീഷ്യൻമാർ" /></li>
          </ul>
        </Container>
      </section>
      <Container className="py-8 sm:py-12">
        <Suspense fallback={<div className="flex flex-col gap-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>}>
          <BookingContent />
        </Suspense>
      </Container>
    </>
  );
}
