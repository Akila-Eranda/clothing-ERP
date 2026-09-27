-- Existing wallets already posted their cash to Cash on Hand; only new wallets use the cashier-wallet ledger.
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "walletGl" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cash_registers" ALTER COLUMN "walletGl" SET DEFAULT true;
