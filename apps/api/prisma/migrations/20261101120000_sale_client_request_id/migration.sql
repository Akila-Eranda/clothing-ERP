-- POS sale idempotency: the POS sends one clientRequestId per checkout attempt and re-sends it
-- on retry, so a double click or a lost response cannot create a second sale.
-- Existing rows stay NULL; PostgreSQL treats NULLs as distinct, so the unique index does not
-- affect old sales or clients that do not send the key.

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_tenantId_clientRequestId_key"
  ON "sales"("tenantId", "clientRequestId");
