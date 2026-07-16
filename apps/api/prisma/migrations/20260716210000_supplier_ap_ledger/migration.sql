-- Supplier AP ledger for outstanding audit trail
CREATE TYPE "SupplierLedgerEntryType" AS ENUM ('GRN', 'INVOICE', 'PAYMENT', 'RETURN', 'ADJUSTMENT', 'SYNC');

CREATE TABLE IF NOT EXISTS "supplier_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "entryType" "SupplierLedgerEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_ledger_entries_tenantId_supplierId_createdAt_idx"
  ON "supplier_ledger_entries"("tenantId", "supplierId", "createdAt");

CREATE INDEX IF NOT EXISTS "supplier_ledger_entries_referenceType_referenceId_idx"
  ON "supplier_ledger_entries"("referenceType", "referenceId");

DO $$ BEGIN
  ALTER TABLE "supplier_ledger_entries"
    ADD CONSTRAINT "supplier_ledger_entries_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_ledger_entries"
    ADD CONSTRAINT "supplier_ledger_entries_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
