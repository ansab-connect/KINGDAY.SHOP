import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Container } from "@/components/store/section";

export type Crumb = { name: string; href?: string };

export function Breadcrumbs({ items, tone = "light" }: { items: Crumb[]; tone?: "light" | "dark" }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={`flex flex-wrap items-center gap-1 text-xs ${tone === "dark" ? "text-white/60" : "text-muted-foreground"}`}>
        {items.map((c, i) => (
          <li key={c.name} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden className="size-3" /> : null}
            {c.href ? (
              <Link href={c.href} className={tone === "dark" ? "hover:text-white" : "hover:text-royal"}>{c.name}</Link>
            ) : (
              <span aria-current="page" className={tone === "dark" ? "text-white" : "text-deep"}>{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({ title, description, crumbs }: { title: string; description?: string; crumbs: Crumb[] }) {
  return (
    <section className="border-b bg-[linear-gradient(180deg,var(--color-royal-50)_0%,#fff_100%)]">
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={crumbs} />
        <h1 className="mt-4 text-3xl font-extrabold text-deep sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
      </Container>
    </section>
  );
}
