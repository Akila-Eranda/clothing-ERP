-- Sprint 6: AP Debit Notes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SupplierLedgerEntryType' AND e.enumlabel = 'DEBIT_NOTE'
  ) THEN
    ALTER TYPE "SupplierLedgerEntryType" ADD VALUE 'DEBIT_NOTE';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplierDebitNoteStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "supplier_debit_notes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "noteNumber" TEXT NOT NULL,
  "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DOUBLE PRECISION NOT NULL,
  "appliedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "SupplierDebitNoteStatus" NOT NULL DEFAULT 'POSTED',
  "reason" TEXT,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "invoiceId" TEXT,
  "purchaseId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_debit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_debit_notes_tenantId_noteNumber_key"
  ON "supplier_debit_notes"("tenantId", "noteNumber");
CREATE INDEX IF NOT EXISTS "supplier_debit_notes_tenantId_supplierId_idx"
  ON "supplier_debit_notes"("tenantId", "supplierId");
CREATE INDEX IF NOT EXISTS "supplier_debit_notes_supplierId_idx"
  ON "supplier_debit_notes"("supplierId");

DO $$ BEGIN
  ALTER TABLE "supplier_debit_notes"
    ADD CONSTRAINT "supplier_debit_notes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_debit_notes"
    ADD CONSTRAINT "supplier_debit_notes_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_debit_notes"
    ADD CONSTRAINT "supplier_debit_notes_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
