-- POS "save change to customer account": the part of a sale's change that the customer chose (with consent)
-- to keep as store credit in Customer.walletBalance instead of taking it in cash.
-- Cash handed back = "changeDue" - "changeSavedToWallet".
-- Additive and backward-compatible: one NOT NULL column with a constant DEFAULT 0 (PostgreSQL 11+ stores the
-- default in the catalogue, so existing rows are not rewritten). Every existing sale reads 0 = old behaviour.
-- No index, no data change. The wallet ledger row uses the existing free-text wallet_transactions.type
-- ('CHANGE_SAVED'), so no enum or table change is needed there.
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "changeSavedToWallet" DOUBLE PRECISION NOT NULL DEFAULT 0;
