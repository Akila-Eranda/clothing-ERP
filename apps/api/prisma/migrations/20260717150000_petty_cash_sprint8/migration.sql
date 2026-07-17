-- Sprint 8 — Petty Cash funds, transactions, expense claims, reimbursements

CREATE TYPE "PettyCashTxnType" AS ENUM ('OPENING', 'DISBURSEMENT', 'REPLENISHMENT', 'ADJUSTMENT');
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED', 'CANCELLED');
CREATE TYPE "ReimbursementStatus" AS ENUM ('PAID', 'VOID');

CREATE TABLE "petty_cash_funds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glAccountId" TEXT,
    "bankAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_funds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "petty_cash_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "type" "PettyCashTxnType" NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "expenseGlAccountId" TEXT,
    "receiptRef" TEXT,
    "claimId" TEXT,
    "reimbursementId" TEXT,
    "journalEntryId" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petty_cash_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expense_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fundId" TEXT,
    "branchId" TEXT,
    "claimantName" TEXT NOT NULL,
    "employeeId" TEXT,
    "claimDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "expenseGlAccountId" TEXT,
    "receiptRef" TEXT,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "rejectionReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reimbursements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "fundId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payFromBankAccountId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "status" "ReimbursementStatus" NOT NULL DEFAULT 'PAID',
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "petty_cash_funds_tenantId_code_key" ON "petty_cash_funds"("tenantId", "code");
CREATE INDEX "petty_cash_funds_tenantId_idx" ON "petty_cash_funds"("tenantId");
CREATE INDEX "petty_cash_funds_tenantId_isActive_idx" ON "petty_cash_funds"("tenantId", "isActive");

CREATE INDEX "petty_cash_transactions_tenantId_fundId_idx" ON "petty_cash_transactions"("tenantId", "fundId");
CREATE INDEX "petty_cash_transactions_tenantId_txnDate_idx" ON "petty_cash_transactions"("tenantId", "txnDate");
CREATE INDEX "petty_cash_transactions_fundId_txnDate_idx" ON "petty_cash_transactions"("fundId", "txnDate");

CREATE INDEX "expense_claims_tenantId_idx" ON "expense_claims"("tenantId");
CREATE INDEX "expense_claims_tenantId_status_idx" ON "expense_claims"("tenantId", "status");
CREATE INDEX "expense_claims_tenantId_claimDate_idx" ON "expense_claims"("tenantId", "claimDate");

CREATE UNIQUE INDEX "reimbursements_claimId_key" ON "reimbursements"("claimId");
CREATE INDEX "reimbursements_tenantId_idx" ON "reimbursements"("tenantId");
CREATE INDEX "reimbursements_tenantId_payDate_idx" ON "reimbursements"("tenantId", "payDate");

ALTER TABLE "petty_cash_funds" ADD CONSTRAINT "petty_cash_funds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "petty_cash_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "petty_cash_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "petty_cash_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
