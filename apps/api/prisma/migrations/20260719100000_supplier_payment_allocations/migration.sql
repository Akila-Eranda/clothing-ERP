-- AlterEnum: CLOSED for fully settled POs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PurchaseOrderStatus' AND e.enumlabel = 'CLOSED'
  ) THEN
    ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'CLOSED';
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_paymentId_idx" ON "supplier_payment_allocations"("paymentId");
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_purchaseId_idx" ON "supplier_payment_allocations"("purchaseId");
CREATE INDEX IF NOT EXISTS "supplier_payment_allocations_invoiceId_idx" ON "supplier_payment_allocations"("invoiceId");
CREATE INDEX IF NOT EXISTS "supplier_payments_tenantId_paidAt_idx" ON "supplier_payments"("tenantId", "paidAt");

DO $$ BEGIN
  ALTER TABLE "supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
