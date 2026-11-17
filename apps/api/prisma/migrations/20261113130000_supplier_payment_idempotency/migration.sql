-- Persist supplier payment request identity so retries cannot create another cash, allocation, or journal effect.
ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "supplier_payments" ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_tenantId_clientRequestId_key"
  ON "supplier_payments" ("tenantId", "clientRequestId");
