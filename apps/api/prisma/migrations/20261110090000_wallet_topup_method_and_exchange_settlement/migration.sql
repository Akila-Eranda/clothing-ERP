-- Wallet top-up payment method + exchange settlement (Nov 2026), additive only. No existing row changes.
-- 1) wallet_transactions."paymentMethod": how a manually funded top-up was paid (CASH, CARD, QR,
--    BANK_TRANSFER). NULL for every other wallet movement and for all existing rows.
-- 2) wallet_transactions."authorizedById": manager who authorised a manual top-up / goodwill credit.
-- 3) returns."exchangeSettlement": how an exchange was settled (difference collected by tender, or the
--    excess refunded / given as store credit). NULL for plain returns and for all existing rows.
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "authorizedById" TEXT;
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "exchangeSettlement" JSONB;
