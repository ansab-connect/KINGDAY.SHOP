import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHero } from "@/components/store/page-hero";
import { Container } from "@/components/store/section";

/*
 * Policy pages. The legal text must be written and approved by KING DAY before
 * launch; nothing here is a commitment to customers yet.
 */
const policies = {
  shipping: { title: "Shipping Policy", summary: "Delivery areas, timelines and charges." },
  returns: { title: "Returns & Refunds", summary: "How returns, replacements and refunds work." },
  privacy: { title: "Privacy Policy", summary: "How we collect, use and protect your personal information." },
  terms: { title: "Terms of Service", summary: "The terms that apply when you use kingday.in." },
} as const;

type PolicySlug = keyof typeof policies;
const isPolicy = (s: string): s is PolicySlug => s in policies;

export function generateStaticParams() {
  return Object.keys(policies).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicy(slug)) return { title: "Not found" };
  return { title: policies[slug].title, description: policies[slug].summary, alternates: { canonical: `/policies/${slug}` } };
}

async function PolicyContent({ params }: Pick<PageProps<"/policies/[slug]">, "params">) {
  const { slug } = await params;
  if (!isPolicy(slug)) notFound();
  const policy = policies[slug];
  return (
    <>
      <PageHero title={policy.title} description={policy.summary} crumbs={[{ name: "Home", href: "/" }, { name: policy.title }]} />
      <Container className="py-12">
        <div className="max-w-2xl rounded-2xl border border-dashed p-8 text-muted-foreground">
          <p className="font-medium text-deep">This policy is being finalised.</p>
          <p className="mt-2 text-sm">
            The full {policy.title.toLowerCase()} will be published here before online ordering opens. If you have a
            question in the meantime, please contact us.
          </p>
        </div>
      </Container>
    </>
  );
}

export default function PolicyPage(props: PageProps<"/policies/[slug]">) {
  return (
    <Suspense fallback={null}>
      <PolicyContent params={props.params} />
    </Suspense>
  );
}
