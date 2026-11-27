"use client";

import { createContext, useContext } from "react";
import { companyFallback, type Company } from "@/features/company-shared";

const Ctx = createContext<Company | null>(null);

/** Gives client components the Super Admin's company details (WhatsApp number etc.). */
export function CompanyProvider({ company, children }: { company: Company; children: React.ReactNode }) {
  return <Ctx.Provider value={company}>{children}</Ctx.Provider>;
}

export function useCompany(): Company {
  return useContext(Ctx) ?? companyFallback();
}
