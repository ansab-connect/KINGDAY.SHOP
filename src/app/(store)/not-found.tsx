import Link from "next/link";
import { Compass } from "lucide-react";
import { Container } from "@/components/store/section";

export default function StoreNotFound() {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-royal text-gold">
        <Compass aria-hidden className="size-7" />
      </span>
      <p className="mt-6 text-xs font-semibold tracking-[0.2em] text-gold-600 uppercase">404</p>
      <h1 className="mt-2 text-3xl font-extrabold text-deep">This page took a different road</h1>
      <p className="mt-3 max-w-md text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-royal px-6 text-sm font-semibold text-white">Go home</Link>
        <Link href="/shop" className="inline-flex h-11 items-center rounded-full border px-6 text-sm font-semibold text-deep">Shop all</Link>
      </div>
    </Container>
  );
}
