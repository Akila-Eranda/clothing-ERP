-- POS upgrade (Nov 2026), additive only.
-- 1) cash_handovers: audit trail of cashier handovers on a counter (outgoing wallet cleared to main cash,
--    same amount issued as the incoming cashier's opening float, so the counter's cash never resets).
-- 2) cash_movements.authorizedById: who authorised a transfer / handover (nullable; old rows unchanged).
-- 3) sales.cashRegisterId: the cashier wallet / shift a sale was taken on, for exact day-end collections by
--    payment method (nullable; older sales are matched by cashier and time instead). No FK, index only.
-- 4) ReceiptPrintType DAY_END for the thermal day-end report print log.

CREATE TABLE IF NOT EXISTS "cash_handovers" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "branchId"       TEXT NOT NULL,
  "counterId"      TEXT NOT NULL,
  "fromRegisterId" TEXT NOT NULL,
  "toRegisterId"   TEXT NOT NULL,
  "fromCashierId"  TEXT NOT NULL,
  "toCashierId"    TEXT NOT NULL,
  "expectedCash"   DOUBLE PRECISION NOT NULL,
  "countedCash"    DOUBLE PRECISION NOT NULL,
  "variance"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "counted"        BOOLEAN NOT NULL DEFAULT false,
  "performedById"  TEXT NOT NULL,
  "authorizedById" TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_handovers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cash_handovers_tenantId_counterId_createdAt_idx" ON "cash_handovers"("tenantId", "counterId", "createdAt");
CREATE INDEX IF NOT EXISTS "cash_handovers_tenantId_branchId_createdAt_idx" ON "cash_handovers"("tenantId", "branchId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_fromRegisterId_fkey"
    FOREIGN KEY ("fromRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_toRegisterId_fkey"
    FOREIGN KEY ("toRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "authorizedById" TEXT;

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT;
CREATE INDEX IF NOT EXISTS "sales_cashRegisterId_idx" ON "sales"("cashRegisterId");

ALTER TYPE "ReceiptPrintType" ADD VALUE IF NOT EXISTS 'DAY_END';
