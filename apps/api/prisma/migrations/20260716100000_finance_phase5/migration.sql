-- Phase 5 Finance: banking, cheques, cash book, AP/AR aging support

DO $$ BEGIN
  ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CHEQUE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "BankAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'CASH_IN_HAND', 'PETTY_CASH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BankTxnType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'INTEREST', 'ADJUSTMENT', 'CHEQUE_CLEAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BankTxnStatus" AS ENUM ('PENDING', 'CLEARED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChequeDirection" AS ENUM ('RECEIVED', 'ISSUED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChequeStatus" AS ENUM ('RECEIVED', 'ISSUED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "supplier_invoices_dueDate_idx" ON "supplier_invoices"("dueDate");

CREATE TABLE IF NOT EXISTS "bank_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BankAccountType" NOT NULL DEFAULT 'CURRENT',
    "bankName" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DOUBLE PRECISION NOT NULL,
    "systemBalance" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bank_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "type" "BankTxnType" NOT NULL,
    "status" "BankTxnStatus" NOT NULL DEFAULT 'CLEARED',
    "amount" DOUBLE PRECISION NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valueDate" TIMESTAMP(3),
    "reference" TEXT,
    "description" TEXT,
    "expenseId" TEXT,
    "chequeId" TEXT,
    "reconciliationId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cheques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "direction" "ChequeDirection" NOT NULL,
    "status" "ChequeStatus" NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "bankName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "partyType" TEXT,
    "partyId" TEXT,
    "partyName" TEXT,
    "bankAccountId" TEXT,
    "notes" TEXT,
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cash_book_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "paymentMethod" "PaymentMethod",
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_book_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_tenantId_code_key" ON "bank_accounts"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "bank_accounts_tenantId_idx" ON "bank_accounts"("tenantId");
CREATE INDEX IF NOT EXISTS "bank_transactions_tenantId_bankAccountId_idx" ON "bank_transactions"("tenantId", "bankAccountId");
CREATE INDEX IF NOT EXISTS "bank_transactions_txnDate_idx" ON "bank_transactions"("txnDate");
CREATE INDEX IF NOT EXISTS "cheques_tenantId_idx" ON "cheques"("tenantId");
CREATE INDEX IF NOT EXISTS "cheques_tenantId_status_idx" ON "cheques"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "cheques_dueDate_idx" ON "cheques"("dueDate");
CREATE INDEX IF NOT EXISTS "bank_reconciliations_tenantId_idx" ON "bank_reconciliations"("tenantId");
CREATE INDEX IF NOT EXISTS "bank_reconciliations_bankAccountId_idx" ON "bank_reconciliations"("bankAccountId");
CREATE INDEX IF NOT EXISTS "cash_book_entries_tenantId_entryDate_idx" ON "cash_book_entries"("tenantId", "entryDate");
CREATE INDEX IF NOT EXISTS "cash_book_entries_tenantId_branchId_idx" ON "cash_book_entries"("tenantId", "branchId");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_reconciliationId_fkey"
  FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_book_entries" ADD CONSTRAINT "cash_book_entries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
