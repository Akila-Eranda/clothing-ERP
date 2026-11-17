import { ReconciliationReport } from "@/components/accounting/reconciliation-report";
import { CashBankHub } from "@/components/accounting/cash-bank-hub";

export default function ReconciliationPage() {
  return (
    <>
      <ReconciliationReport />
      <CashBankHub initialTab="recon" />
    </>
  );
}
