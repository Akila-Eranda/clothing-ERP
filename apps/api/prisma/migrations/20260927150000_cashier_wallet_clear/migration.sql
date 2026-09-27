-- Cashier wallet clearing into main cash (day end)
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "clearedById" TEXT;
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "clearedAmount" DOUBLE PRECISION;
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "clearedToAccountId" TEXT;

-- Shifts closed before wallets existed are treated as settled (clearedAmount stays NULL)
UPDATE "cash_registers"
SET "clearedAt" = COALESCE("closingTime", "updatedAt")
WHERE "status" = 'CLOSED' AND "clearedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "cash_registers_tenantId_clearedAt_idx" ON "cash_registers"("tenantId", "clearedAt");
