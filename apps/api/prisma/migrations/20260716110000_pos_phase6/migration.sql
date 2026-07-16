-- Phase 6 POS: helper commission, gift vouchers, GIFT_VOUCHER payment

DO $$ BEGIN
  ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GIFT_VOUCHER';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "GiftVoucherStatus" AS ENUM ('ACTIVE', 'PARTIALLY_USED', 'REDEEMED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "helperEmployeeId" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "helperName" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "helperCommission" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "sales_helperEmployeeId_idx" ON "sales"("helperEmployeeId");

DO $$ BEGIN
  ALTER TABLE "sales" ADD CONSTRAINT "sales_helperEmployeeId_fkey"
    FOREIGN KEY ("helperEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "gift_vouchers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "initialAmount" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" "GiftVoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedToName" TEXT,
    "issuedToCustomerId" TEXT,
    "issuedBySaleId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gift_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gift_vouchers_tenantId_code_key" ON "gift_vouchers"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "gift_vouchers_tenantId_idx" ON "gift_vouchers"("tenantId");
CREATE INDEX IF NOT EXISTS "gift_vouchers_tenantId_status_idx" ON "gift_vouchers"("tenantId", "status");

DO $$ BEGIN
  ALTER TABLE "gift_vouchers" ADD CONSTRAINT "gift_vouchers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
