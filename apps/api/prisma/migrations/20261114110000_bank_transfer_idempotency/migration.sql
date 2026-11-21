-- Store the same tenant-scoped request identity on each transfer leg; the leg type distinguishes the two rows.
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_tenantId_clientRequestId_type_key"
  ON "bank_transactions" ("tenantId", "clientRequestId", "type");
