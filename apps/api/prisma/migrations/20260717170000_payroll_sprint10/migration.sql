-- Sprint 10 — Payroll runs, EPF/ETF, components, payslips

CREATE TYPE "PayrollComponentType" AS ENUM ('ALLOWANCE', 'DEDUCTION');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "PayrollEntryStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PAID', 'CANCELLED');

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "epfNumber" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "etfNumber" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "nicNumber" TEXT;

CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "epfEmployeeRate" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "epfEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "etfEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "epfWageCap" DOUBLE PRECISION,
    "salaryExpenseGlId" TEXT,
    "epfExpenseGlId" TEXT,
    "etfExpenseGlId" TEXT,
    "epfPayableGlId" TEXT,
    "etfPayableGlId" TEXT,
    "bankGlId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "isEpfApplicable" BOOLEAN NOT NULL DEFAULT true,
    "isPercent" BOOLEAN NOT NULL DEFAULT false,
    "defaultAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentOfBasic" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_components_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEpfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEpfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEtf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "componentId" TEXT,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payslipNumber" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "payrollRunId" TEXT;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "epfWage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "epfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "epfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "etfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "status" "PayrollEntryStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
ALTER TABLE "payrolls" ADD COLUMN IF NOT EXISTS "payslipNumber" TEXT;

CREATE UNIQUE INDEX "payroll_settings_tenantId_key" ON "payroll_settings"("tenantId");
CREATE UNIQUE INDEX "payroll_components_tenantId_code_key" ON "payroll_components"("tenantId", "code");
CREATE INDEX "payroll_components_tenantId_idx" ON "payroll_components"("tenantId");
CREATE UNIQUE INDEX "payroll_runs_tenantId_month_year_key" ON "payroll_runs"("tenantId", "month", "year");
CREATE INDEX "payroll_runs_tenantId_idx" ON "payroll_runs"("tenantId");
CREATE INDEX "payroll_runs_tenantId_status_idx" ON "payroll_runs"("tenantId", "status");
CREATE INDEX "payroll_lines_payrollId_idx" ON "payroll_lines"("payrollId");
CREATE UNIQUE INDEX "payslips_payrollId_key" ON "payslips"("payrollId");
CREATE INDEX "payslips_tenantId_idx" ON "payslips"("tenantId");
CREATE INDEX "payslips_tenantId_periodLabel_idx" ON "payslips"("tenantId", "periodLabel");
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");
CREATE INDEX "payrolls_tenantId_month_year_idx" ON "payrolls"("tenantId", "month", "year");
CREATE INDEX "payrolls_payrollRunId_idx" ON "payrolls"("payrollRunId");

ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_components" ADD CONSTRAINT "payroll_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill gross for existing rows
UPDATE "payrolls"
SET "grossSalary" = "basicSalary" + "allowances" + "bonus" + "commission",
    "status" = CASE WHEN "isPaid" THEN 'PAID'::"PayrollEntryStatus" ELSE 'DRAFT'::"PayrollEntryStatus" END
WHERE "grossSalary" = 0;
