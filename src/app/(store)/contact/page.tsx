import type { Metadata } from "next";
import { getCompany } from "@/features/company";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";
import { whatsappLink } from "@/config/storefront";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with KING DAY for product advice, orders and support.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const company = await getCompany();
  const wa = whatsappLink("Hi KING DAY, I'd like some help choosing a product.", company.whatsapp);
  const channels = [
    wa && { icon: MessageCircle, label: "WhatsApp", value: company.whatsappDisplay, href: wa, external: true },
    company.phone && { icon: Phone, label: "Phone", value: company.phone, href: `tel:${company.phone}` },
    company.email && { icon: Mail, label: "Email", value: company.email, href: `mailto:${company.email}` },
    company.address && { icon: MapPin, label: "Visit", value: company.address },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string; external?: boolean }[];

  return (
    <>
      <PageHero
        title="Contact us"
        description="Questions about a ride, sizing or an order? We're happy to help."
        crumbs={[{ name: "Home", href: "/" }, { name: "Contact" }]}
      />
      <Container className="py-12 sm:py-16">
        {channels.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {channels.map((c) => {
              const inner = (
                <>
                  <span className="grid size-11 place-items-center rounded-xl bg-royal text-gold"><c.icon aria-hidden className="size-5" /></span>
                  <p className="mt-4 text-sm text-muted-foreground">{c.label}</p>
                  <p className="mt-1 font-heading font-semibold text-deep">{c.value}</p>
                </>
              );
              return (
                <li key={c.label}>
                  {c.href ? (
                    <a href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="block h-full rounded-2xl border p-6 transition-shadow hover:shadow-lift">{inner}</a>
                  ) : (
                    <div className="h-full rounded-2xl border p-6">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="max-w-xl rounded-2xl border border-dashed p-8">
            <Clock aria-hidden className="size-7 text-royal" />
            <p className="mt-4 font-heading text-lg font-semibold text-deep">Contact details are on their way</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Our phone, WhatsApp and email details will be published here before launch.
            </p>
          </div>
        )}
      </Container>
    </>
  );
}
