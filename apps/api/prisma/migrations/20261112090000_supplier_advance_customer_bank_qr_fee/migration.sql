-- Supplier advance / overpayment, customer bank details, QR payment fee.
-- Additive only: new nullable / defaulted columns and new tables. No enum change, no existing row is changed.

-- 1. Supplier advance -----------------------------------------------------------------------------
-- No enum change on purpose: advance rows in the supplier ledger use the existing ADJUSTMENT type, so an older API
-- version can still read every ledger row after a rollback.
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "advanceBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
-- A negative advance can never exist, whatever the application does.
ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_advanceBalance_nonneg";
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_advanceBalance_nonneg" CHECK ("advanceBalance" >= 0);

ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "advanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "supplier_advance_entries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "balanceAfter" DOUBLE PRECISION NOT NULL,
  "batchId" TEXT NOT NULL,
  "paymentId" TEXT,
  "purchaseId" TEXT,
  "invoiceId" TEXT,
  "clientRequestId" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_advance_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "supplier_advance_entries_tenantId_supplierId_createdAt_idx" ON "supplier_advance_entries"("tenantId", "supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "supplier_advance_entries_tenantId_batchId_idx" ON "supplier_advance_entries"("tenantId", "batchId");
CREATE INDEX IF NOT EXISTS "supplier_advance_entries_tenantId_clientRequestId_idx" ON "supplier_advance_entries"("tenantId", "clientRequestId");
DO $$ BEGIN
  ALTER TABLE "supplier_advance_entries" ADD CONSTRAINT "supplier_advance_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "supplier_advance_entries" ADD CONSTRAINT "supplier_advance_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Customer bank details ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "customer_bank_details" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountHolderName" TEXT NOT NULL,
  "branchName" TEXT,
  "branchCode" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_bank_details_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "customer_bank_details_customerId_key" ON "customer_bank_details"("customerId");
CREATE INDEX IF NOT EXISTS "customer_bank_details_tenantId_idx" ON "customer_bank_details"("tenantId");
DO $$ BEGIN
  ALTER TABLE "customer_bank_details" ADD CONSTRAINT "customer_bank_details_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_bank_details" ADD CONSTRAINT "customer_bank_details_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. QR payment fee (stored with each QR payment; NULL on all existing payments) --------------------
ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "feePercent" DOUBLE PRECISION;
ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "feeAmount" DOUBLE PRECISION;
ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "finalAmount" DOUBLE PRECISION;
