"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function FilterSheet({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-10 rounded-full lg:hidden">
          <SlidersHorizontal aria-hidden /> Filters
          {activeCount ? <span className="rounded-full bg-royal px-1.5 text-xs text-white tabular">{activeCount}</span> : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
        <SheetHeader className="border-b">
          <SheetTitle className="font-heading">Filters</SheetTitle>
          <SheetDescription className="sr-only">Narrow down products</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
