-- Sprint 7: VAT & Tax Master
DO $$ BEGIN
  CREATE TYPE "TaxDirection" AS ENUM ('OUTPUT', 'INPUT', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VatReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "tax_rates" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "direction" "TaxDirection" NOT NULL DEFAULT 'BOTH',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isInclusive" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "outputGlAccountId" TEXT,
  "inputGlAccountId" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_rates_tenantId_code_key" ON "tax_rates"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "tax_rates_tenantId_idx" ON "tax_rates"("tenantId");
CREATE INDEX IF NOT EXISTS "tax_rates_tenantId_isActive_idx" ON "tax_rates"("tenantId", "isActive");

DO $$ BEGIN
  ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "vat_returns" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" "VatReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "outputVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "inputVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "salesNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchasesNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "salesGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchasesGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "journalEntryId" TEXT,
  "notes" TEXT,
  "filedAt" TIMESTAMP(3),
  "filedBy" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vat_returns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vat_returns_tenantId_idx" ON "vat_returns"("tenantId");
CREATE INDEX IF NOT EXISTS "vat_returns_tenantId_periodStart_periodEnd_idx"
  ON "vat_returns"("tenantId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "vat_returns_tenantId_status_idx" ON "vat_returns"("tenantId", "status");

DO $$ BEGIN
  ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
