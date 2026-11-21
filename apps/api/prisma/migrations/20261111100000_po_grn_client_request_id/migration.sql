-- PO / GRN idempotency: the web sends one clientRequestId per submit attempt (Create PO, Create PO + GRN,
-- PO receive, Quick GRN, direct GRN) and re-sends it on retry, so a double click, a timeout retry or a
-- lost response cannot post the same stock twice.
-- Additive only. Existing rows stay NULL; PostgreSQL treats NULLs as distinct, so the unique indexes do not
-- affect existing purchase orders / GRNs or older clients that do not send the key.

ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_tenantId_clientRequestId_key"
  ON "purchase_orders"("tenantId", "clientRequestId");

CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_tenantId_clientRequestId_key"
  ON "goods_receipts"("tenantId", "clientRequestId");
