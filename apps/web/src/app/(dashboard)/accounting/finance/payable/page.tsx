"use client";

import { FinancePageShell, PayableSection } from "@/components/accounting/finance-hub";

export default function PayablePage() {
  return (
    <FinancePageShell title="Payable" subtitle="Supplier balances & accounts payable aging">
      <PayableSection />
    </FinancePageShell>
  );
}
