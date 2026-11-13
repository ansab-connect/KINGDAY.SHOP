import { Skeleton } from "@/components/ui/skeleton";

export function ListingSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-10" aria-busy="true" aria-label="Loading products">
      <div className="hidden flex-col gap-3 lg:flex">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
      <div>
        <Skeleton className="h-10 w-48 rounded-full" />
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
