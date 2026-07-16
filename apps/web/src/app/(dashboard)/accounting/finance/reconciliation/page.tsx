"use client";

import { FinancePageShell, ReconciliationSection } from "@/components/accounting/finance-hub";

export default function ReconciliationPage() {
  return (
    <FinancePageShell title="Reconciliation" subtitle="Match bank statements with system balances">
      <ReconciliationSection />
    </FinancePageShell>
  );
}
