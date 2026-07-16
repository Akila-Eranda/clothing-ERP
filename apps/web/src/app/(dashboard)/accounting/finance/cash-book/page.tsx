"use client";

import { CashBookSection, FinancePageShell } from "@/components/accounting/finance-hub";

export default function CashBookPage() {
  return (
    <FinancePageShell title="Cash Book" subtitle="Daily cash movements & closing balance">
      <CashBookSection />
    </FinancePageShell>
  );
}
