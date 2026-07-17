-- Phase 01 Sprint 1: Chart of Accounts foundation
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "openingBalanceDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "accounts_tenantId_type_idx" ON "accounts"("tenantId", "type");
CREATE INDEX IF NOT EXISTS "accounts_tenantId_parentId_idx" ON "accounts"("tenantId", "parentId");
