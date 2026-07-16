"use client";

import { ChequesSection, FinancePageShell } from "@/components/accounting/finance-hub";

export default function ChequesPage() {
  return (
    <FinancePageShell title="Cheques" subtitle="Register, deposit & clear cheques">
      <ChequesSection />
    </FinancePageShell>
  );
}
