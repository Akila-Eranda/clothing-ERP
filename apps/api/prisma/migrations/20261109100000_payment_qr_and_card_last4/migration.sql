-- POS upgrade (Nov 2026), additive only.
-- 1) Bank QR codes shown at the POS for QR payments (static image or dynamic EMVCo payload).
-- 2) sale_payments: which QR code was used, and the card's last four digits (never the full number or CVV).
--    Both columns are nullable: existing payments are not rewritten.

DO $$ BEGIN
  CREATE TYPE "PaymentQrMode" AS ENUM ('STATIC', 'DYNAMIC');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "payment_qr_codes" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "branchId"        TEXT,
  "bankAccountId"   TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "mode"            "PaymentQrMode" NOT NULL DEFAULT 'STATIC',
  "imageUrl"        TEXT,
  "merchantPayload" TEXT,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "isDefault"       BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "createdById"     TEXT,
  "updatedById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_qr_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_qr_codes_tenantId_isActive_idx" ON "payment_qr_codes"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "payment_qr_codes_tenantId_bankAccountId_idx" ON "payment_qr_codes"("tenantId", "bankAccountId");

DO $$ BEGIN
  ALTER TABLE "payment_qr_codes" ADD CONSTRAINT "payment_qr_codes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_qr_codes" ADD CONSTRAINT "payment_qr_codes_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "qrCodeId" TEXT;
ALTER TABLE "sale_payments" ADD COLUMN IF NOT EXISTS "cardLast4" VARCHAR(4);
CREATE INDEX IF NOT EXISTS "sale_payments_qrCodeId_idx" ON "sale_payments"("qrCodeId");
DO $$ BEGIN
  ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_qrCodeId_fkey"
    FOREIGN KEY ("qrCodeId") REFERENCES "payment_qr_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
