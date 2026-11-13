import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/store/section";
import { productCategories, siteConfig } from "@/config/site";
import { storeContact, whatsappLink } from "@/config/storefront";

const companyLinks = [
  { title: "About Us", href: "/about" },
  { title: "Contact", href: "/contact" },
  { title: "Offers", href: "/offers" },
  { title: "My Account", href: "/account" },
  { title: "Track Order", href: "/account/orders" },
];

const policyLinks = [
  { title: "Shipping Policy", href: "/policies/shipping" },
  { title: "Returns & Refunds", href: "/policies/returns" },
  { title: "Privacy Policy", href: "/policies/privacy" },
  { title: "Terms of Service", href: "/policies/terms" },
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
              <li className="flex items-center gap-2.5"><MessageCircle aria-hidden className="size-4 text-gold" /><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-white">Chat on WhatsApp</a></li>
            ) : null}
            {storeContact.address ? (
              <li className="flex items-start gap-2.5"><MapPin aria-hidden className="mt-0.5 size-4 text-gold" /><span>{storeContact.address}</span></li>
            ) : null}
          </ul>
        </div>

        <FooterColumn title="Shop" links={productCategories.map((c) => ({ title: c.name, href: `/categories/${c.slug}` }))} />
        <FooterColumn title="Company" links={companyLinks} />
        <div>
          <FooterColumn title="Policies" links={policyLinks} />
          {social.length ? (
            <div className="mt-8">
              <p className="font-heading text-sm font-semibold tracking-wide text-gold">Follow us</p>
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
          <p>© {siteConfig.copyrightYear} {siteConfig.legalName}. All rights reserved.</p>
          <p>Secure payments by Razorpay · Cash on delivery where available</p>
          <p className="tracking-[0.18em] text-white/40 uppercase">Powered by <span className="font-semibold text-white/60">MotherBits Technologies LLP</span></p>
        </Container>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { title: string; href: string }[] }) {
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
