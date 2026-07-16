"use client";

import { FinanceHubProvider } from "@/components/accounting/finance-hub";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <FinanceHubProvider>{children}</FinanceHubProvider>;
}
