import { Container } from "@/components/store/section";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductSkeleton() {
  return (
    <Container className="pt-8 pb-16" >
      <div aria-busy="true" aria-label="Loading product" className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-4 h-9 w-40" />
          <Skeleton className="mt-6 h-20 w-full" />
          <Skeleton className="mt-4 h-13 w-full rounded-full" />
        </div>
      </div>
    </Container>
  );
}
