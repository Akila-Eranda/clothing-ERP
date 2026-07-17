-- Phase 01 Sprint 2: Financial Periods
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

CREATE TABLE IF NOT EXISTS "fiscal_years" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "closingNotes" TEXT,
  "retainedEarningsAccountId" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "accounting_periods" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fiscalYearId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedBy" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_years_tenantId_name_key" ON "fiscal_years"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "fiscal_years_tenantId_status_idx" ON "fiscal_years"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "fiscal_years_tenantId_isCurrent_idx" ON "fiscal_years"("tenantId", "isCurrent");

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_fiscalYearId_sequence_key" ON "accounting_periods"("fiscalYearId", "sequence");
CREATE INDEX IF NOT EXISTS "accounting_periods_tenantId_status_idx" ON "accounting_periods"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "accounting_periods_tenantId_startDate_endDate_idx" ON "accounting_periods"("tenantId", "startDate", "endDate");

DO $$ BEGIN
  ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_fiscalYearId_fkey"
    FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
