-- Persist return request identity so retries cannot create another refund, stock movement, or journal.
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "returns_tenantId_clientRequestId_key"
  ON "returns" ("tenantId", "clientRequestId");
