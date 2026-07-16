"use client";

import { FinancePageShell, ReceivableSection } from "@/components/accounting/finance-hub";

export default function ReceivablePage() {
  return (
    <FinancePageShell title="Receivable" subtitle="Customer credit balances & AR aging">
      <ReceivableSection />
    </FinancePageShell>
  );
}
