-- Phase 7 Customer Credit: due dates, schedules, reminders

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 30;
CREATE INDEX IF NOT EXISTS "customers_tenantId_creditBalance_idx" ON "customers"("tenantId", "creditBalance");

ALTER TABLE "customer_credit_transactions" ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "customer_credit_transactions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "customer_credit_transactions" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "customer_credit_transactions_tenantId_idx" ON "customer_credit_transactions"("tenantId");
CREATE INDEX IF NOT EXISTS "customer_credit_transactions_tenantId_dueDate_idx" ON "customer_credit_transactions"("tenantId", "dueDate");
CREATE INDEX IF NOT EXISTS "customer_credit_transactions_tenantId_status_idx" ON "customer_credit_transactions"("tenantId", "status");

DO $$ BEGIN CREATE TYPE "CreditScheduleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CreditScheduleLineStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CreditReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "customer_credit_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chargeTxnId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "CreditScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_credit_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "customer_credit_schedule_lines" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CreditScheduleLineStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_credit_schedule_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "customer_credit_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chargeTxnId" TEXT,
    "scheduleLineId" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "CreditReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_credit_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_credit_schedules_tenantId_idx" ON "customer_credit_schedules"("tenantId");
CREATE INDEX IF NOT EXISTS "customer_credit_schedules_customerId_idx" ON "customer_credit_schedules"("customerId");
CREATE INDEX IF NOT EXISTS "customer_credit_schedule_lines_scheduleId_idx" ON "customer_credit_schedule_lines"("scheduleId");
CREATE INDEX IF NOT EXISTS "customer_credit_schedule_lines_dueDate_idx" ON "customer_credit_schedule_lines"("dueDate");
CREATE INDEX IF NOT EXISTS "customer_credit_reminders_tenantId_idx" ON "customer_credit_reminders"("tenantId");
CREATE INDEX IF NOT EXISTS "customer_credit_reminders_customerId_idx" ON "customer_credit_reminders"("customerId");
CREATE INDEX IF NOT EXISTS "customer_credit_reminders_tenantId_status_idx" ON "customer_credit_reminders"("tenantId", "status");

DO $$ BEGIN
  ALTER TABLE "customer_credit_schedules" ADD CONSTRAINT "customer_credit_schedules_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_credit_schedules" ADD CONSTRAINT "customer_credit_schedules_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_credit_schedules" ADD CONSTRAINT "customer_credit_schedules_chargeTxnId_fkey"
    FOREIGN KEY ("chargeTxnId") REFERENCES "customer_credit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_credit_schedule_lines" ADD CONSTRAINT "customer_credit_schedule_lines_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "customer_credit_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_credit_reminders" ADD CONSTRAINT "customer_credit_reminders_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customer_credit_reminders" ADD CONSTRAINT "customer_credit_reminders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill due dates for existing CHARGE rows (30 days from createdAt)
UPDATE "customer_credit_transactions"
SET "dueDate" = "createdAt" + INTERVAL '30 days',
    "status" = CASE WHEN "type" = 'PAYMENT' THEN 'PAID' ELSE 'OPEN' END
WHERE "dueDate" IS NULL AND "type" = 'CHARGE';
