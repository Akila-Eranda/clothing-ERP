"use client";

import { BanksSection, FinancePageShell } from "@/components/accounting/finance-hub";

export default function BanksPage() {
  return (
    <FinancePageShell title="Banks" subtitle="Bank accounts & current balances">
      <BanksSection />
    </FinancePageShell>
  );
}
