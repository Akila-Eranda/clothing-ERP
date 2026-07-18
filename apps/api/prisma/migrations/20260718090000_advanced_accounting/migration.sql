-- Advanced accounting: cost centers, budgets, recurring journals, and FX rates

CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "manager" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_tenantId_code_key"
  ON "cost_centers"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "cost_centers_tenantId_isActive_idx"
  ON "cost_centers"("tenantId", "isActive");
ALTER TABLE "cost_centers"
  ADD CONSTRAINT "cost_centers_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "accounting_budgets" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_budgets_tenantId_name_fiscalYear_key"
  ON "accounting_budgets"("tenantId", "name", "fiscalYear");
CREATE INDEX IF NOT EXISTS "accounting_budgets_tenantId_fiscalYear_status_idx"
  ON "accounting_budgets"("tenantId", "fiscalYear", "status");
ALTER TABLE "accounting_budgets"
  ADD CONSTRAINT "accounting_budgets_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "accounting_budget_lines" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "costCenterId" TEXT,
  "month" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_budget_lines_budgetId_accountId_costCenterId_month_key"
  ON "accounting_budget_lines"("budgetId", "accountId", "costCenterId", "month");
CREATE INDEX IF NOT EXISTS "accounting_budget_lines_budgetId_month_idx"
  ON "accounting_budget_lines"("budgetId", "month");
CREATE INDEX IF NOT EXISTS "accounting_budget_lines_accountId_idx"
  ON "accounting_budget_lines"("accountId");
ALTER TABLE "accounting_budget_lines"
  ADD CONSTRAINT "accounting_budget_lines_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "accounting_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_budget_lines"
  ADD CONSTRAINT "accounting_budget_lines_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_budget_lines"
  ADD CONSTRAINT "accounting_budget_lines_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "recurring_journals" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "nextRunDate" TIMESTAMP(3) NOT NULL,
  "lastRunDate" TIMESTAMP(3),
  "autoPost" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "branchId" TEXT,
  "lines" JSONB NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurring_journals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recurring_journals_tenantId_isActive_nextRunDate_idx"
  ON "recurring_journals"("tenantId", "isActive", "nextRunDate");
ALTER TABLE "recurring_journals"
  ADD CONSTRAINT "recurring_journals_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_tenantId_fromCurrency_toCurrency_effectiveAt_key"
  ON "exchange_rates"("tenantId", "fromCurrency", "toCurrency", "effectiveAt");
CREATE INDEX IF NOT EXISTS "exchange_rates_tenantId_effectiveAt_idx"
  ON "exchange_rates"("tenantId", "effectiveAt");
ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
