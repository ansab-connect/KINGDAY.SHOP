import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { L } from "@/components/i18n/lang";
import { Container } from "@/components/store/section";
import { productCategories, siteConfig } from "@/config/site";
import { storeContact, whatsappLink } from "@/config/storefront";

const companyLinks = [
  { title: <L en="About Us" ml="ഞങ്ങളെക്കുറിച്ച്" />, href: "/about" },
  { title: <L en="Contact" ml="ബന്ധപ്പെടുക" />, href: "/contact" },
  { title: <L en="Offers" ml="ഓഫറുകൾ" />, href: "/offers" },
  { title: <L en="Book a Service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />, href: "/book-service" },
  { title: <L en="My Account" ml="എന്റെ അക്കൗണ്ട്" />, href: "/account" },
  { title: <L en="Track Order" ml="ഓർഡർ ട്രാക്ക് ചെയ്യുക" />, href: "/account/orders" },
];

const policyLinks = [
  { title: <L en="Shipping Policy" ml="ഷിപ്പിംഗ് നയം" />, href: "/policies/shipping" },
  { title: <L en="Returns & Refunds" ml="റിട്ടേൺ & റീഫണ്ട്" />, href: "/policies/returns" },
  { title: <L en="Privacy Policy" ml="സ്വകാര്യതാ നയം" />, href: "/policies/privacy" },
  { title: <L en="Terms of Service" ml="സേവന നിബന്ധനകൾ" />, href: "/policies/terms" },
];

export function StoreFooter() {
  const wa = whatsappLink("Hi KING DAY, I have a question.");
  const social = [
    storeContact.instagram && { label: "Instagram", href: `https://instagram.com/${storeContact.instagram.replace(/^@/, "")}` },
    storeContact.facebook && { label: "Facebook", href: storeContact.facebook },
    storeContact.youtube && { label: "YouTube", href: storeContact.youtube },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <footer className="mt-auto bg-deep text-white">
      <div aria-hidden className="gold-rule h-px" />
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:py-16">
        <div>
          <Logo tone="light" showTagline />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/65">{siteConfig.description}</p>
          <ul className="mt-6 flex flex-col gap-2.5 text-sm text-white/75">
            {storeContact.phone ? (
              <li className="flex items-center gap-2.5"><Phone aria-hidden className="size-4 text-gold" /><a href={`tel:${storeContact.phone}`} className="hover:text-white">{storeContact.phone}</a></li>
            ) : null}
            {storeContact.email ? (
              <li className="flex items-center gap-2.5"><Mail aria-hidden className="size-4 text-gold" /><a href={`mailto:${storeContact.email}`} className="hover:text-white">{storeContact.email}</a></li>
            ) : null}
            {wa ? (
              <li className="flex items-center gap-2.5"><MessageCircle aria-hidden className="size-4 text-gold" /><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-white"><L en="Chat on WhatsApp" ml="WhatsApp-ൽ ചാറ്റ് ചെയ്യുക" /></a></li>
            ) : null}
            {storeContact.address ? (
              <li className="flex items-start gap-2.5"><MapPin aria-hidden className="mt-0.5 size-4 text-gold" /><span>{storeContact.address}</span></li>
            ) : null}
          </ul>
        </div>

        <FooterColumn title={<L en="Shop" ml="ഷോപ്പ്" />} links={productCategories.map((c) => ({ title: c.name, href: `/categories/${c.slug}` }))} />
        <FooterColumn title={<L en="Company" ml="കമ്പനി" />} links={companyLinks} />
        <div>
          <FooterColumn title={<L en="Policies" ml="നയങ്ങൾ" />} links={policyLinks} />
          {social.length ? (
            <div className="mt-8">
              <p className="font-heading text-sm font-semibold tracking-wide text-gold"><L en="Follow us" ml="ഞങ്ങളെ പിന്തുടരൂ" /></p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {social.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:border-gold hover:text-white">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-6 text-xs text-white/50 lg:flex-row lg:items-center lg:justify-between">
          <p>© {siteConfig.copyrightYear} {siteConfig.legalName}. <L en="All rights reserved." ml="എല്ലാ അവകാശങ്ങളും നിക്ഷിപ്തം." /></p>
          <p>Secure payments by Razorpay · Cash on delivery where available</p>
          <p className="tracking-[0.18em] text-white/40 uppercase">Powered by <span className="font-semibold text-white/60">MotherBits Technologies LLP</span></p>
        </Container>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: React.ReactNode; links: { title: React.ReactNode; href: string }[] }) {
  return (
    <div>
      <p className="font-heading text-sm font-semibold tracking-wide text-gold">{title}</p>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-white/70 transition-colors hover:text-white">{l.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
