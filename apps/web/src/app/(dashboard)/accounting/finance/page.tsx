"use client";

import { FinanceOverviewContent, FinancePageShell } from "@/components/accounting/finance-hub";

export default function FinanceHubPage() {
  return (
    <FinancePageShell title="Finance Hub" subtitle="Overview · AP / AR, cash book, banks, cheques & reconciliation">
      <FinanceOverviewContent />
    </FinancePageShell>
  );
}
