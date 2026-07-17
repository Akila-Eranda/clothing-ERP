-- Phase 06 Sprint 13 — Accounting Settings (number series + preferences)

CREATE TYPE "NumberSeriesResetPolicy" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY', 'DAILY');

CREATE TABLE IF NOT EXISTS "document_number_series" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "includeYear" BOOLEAN NOT NULL DEFAULT true,
    "includeMonth" BOOLEAN NOT NULL DEFAULT false,
    "padLength" INTEGER NOT NULL DEFAULT 5,
    "resetPolicy" "NumberSeriesResetPolicy" NOT NULL DEFAULT 'YEARLY',
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "lastResetKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_number_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_number_series_tenantId_key_key"
  ON "document_number_series"("tenantId", "key");
CREATE INDEX IF NOT EXISTS "document_number_series_tenantId_idx"
  ON "document_number_series"("tenantId");

ALTER TABLE "document_number_series"
  ADD CONSTRAINT "document_number_series_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "accounting_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requireJournalApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowPostDraft" BOOLEAN NOT NULL DEFAULT false,
    "blockPostingClosedPeriod" BOOLEAN NOT NULL DEFAULT true,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "defaultCashAccountId" TEXT,
    "defaultArAccountId" TEXT,
    "defaultApAccountId" TEXT,
    "defaultSalesAccountId" TEXT,
    "defaultPurchaseAccountId" TEXT,
    "defaultRetainedEarningsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_preferences_tenantId_key"
  ON "accounting_preferences"("tenantId");

ALTER TABLE "accounting_preferences"
  ADD CONSTRAINT "accounting_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
