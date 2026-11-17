-- Stock-adjustment idempotency: POST /inventory/adjust may carry a clientRequestId; a retry with the same key
-- returns the first result and posts nothing. Additive only: two nullable columns + a unique index.
-- Existing rows stay NULL; PostgreSQL treats NULLs as distinct, so the unique index cannot clash with any existing row.
ALTER TABLE "inventory_logs" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "inventory_logs" ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_logs_tenantId_clientRequestId_key"
  ON "inventory_logs"("tenantId", "clientRequestId");
