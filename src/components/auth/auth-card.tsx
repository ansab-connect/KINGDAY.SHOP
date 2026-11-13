import { Crown } from "lucide-react";
import { Container } from "@/components/store/section";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="bg-[linear-gradient(180deg,var(--color-royal-50)_0%,#fff_60%)]">
      <Container className="flex justify-center py-12 sm:py-20">
        <div className="w-full max-w-md rounded-3xl border bg-white p-6 shadow-card sm:p-10">
          <span className="grid size-12 place-items-center rounded-xl bg-royal text-gold">
            <Crown aria-hidden className="size-6" />
          </span>
          <h1 className="mt-6 text-2xl font-extrabold text-deep sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </Container>
    </section>
  );
}
