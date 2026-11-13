import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Container } from "@/components/store/section";

/** Friendly placeholder for storefront pages whose functionality lands in a later phase. */
export function ComingSoon({
  icon: Icon,
  title,
  body,
  primary = { label: "Continue shopping", href: "/shop" },
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  primary?: { label: string; href: string };
}) {
  return (
    <Container className="flex flex-col items-center py-20 text-center sm:py-28">
      <span className="grid size-16 place-items-center rounded-2xl bg-royal text-gold">
        <Icon aria-hidden className="size-7" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold text-deep">{title}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={primary.href} className="inline-flex h-11 items-center rounded-full bg-royal px-6 text-sm font-semibold text-white hover:bg-royal-800">
          {primary.label}
        </Link>
        <Link href="/contact" className="inline-flex h-11 items-center rounded-full border px-6 text-sm font-semibold text-deep hover:bg-muted">
          Contact us
        </Link>
      </div>
    </Container>
  );
}
