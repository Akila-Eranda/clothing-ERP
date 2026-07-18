-- Accounting Full Align: preferences flags, AccountMapping, AccountingOutboxEvent

ALTER TABLE "accounting_preferences"
  ADD COLUMN IF NOT EXISTS "autoPostEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "repairVatEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "AccountingOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'POSTED', 'FAILED', 'SKIPPED');

CREATE TABLE IF NOT EXISTS "account_mappings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_mappings_tenantId_key_key"
  ON "account_mappings"("tenantId", "key");
CREATE INDEX IF NOT EXISTS "account_mappings_tenantId_idx"
  ON "account_mappings"("tenantId");
CREATE INDEX IF NOT EXISTS "account_mappings_accountId_idx"
  ON "account_mappings"("accountId");

ALTER TABLE "account_mappings"
  ADD CONSTRAINT "account_mappings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_mappings"
  ADD CONSTRAINT "account_mappings_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "accounting_outbox_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "AccountingOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "journalEntryId" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_outbox_events_tenantId_sourceType_sourceId_key"
  ON "accounting_outbox_events"("tenantId", "sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "accounting_outbox_events_tenantId_status_idx"
  ON "accounting_outbox_events"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "accounting_outbox_events_tenantId_createdAt_idx"
  ON "accounting_outbox_events"("tenantId", "createdAt");

ALTER TABLE "accounting_outbox_events"
  ADD CONSTRAINT "accounting_outbox_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
