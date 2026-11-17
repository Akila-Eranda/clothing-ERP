-- QR fee, Option A (confirmed 12 Nov): the fee is DEDUCTED from the QR payment by the bank, so the stored figure
-- is the NET amount the business receives (gross − fee), not a "final amount" paid by the customer.
--
-- sale_payments."finalAmount" was added by 20261112090000 in this same, not yet deployed release, so in production
-- this renames an empty column straight after it is created. Metadata only: no row is read or rewritten.
-- Guarded so it is safe on any database state (already renamed, or the column never created).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'sale_payments' AND column_name = 'finalAmount')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'sale_payments' AND column_name = 'netAmount') THEN
    ALTER TABLE "sale_payments" RENAME COLUMN "finalAmount" TO "netAmount";
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'sale_payments' AND column_name = 'netAmount') THEN
    ALTER TABLE "sale_payments" ADD COLUMN "netAmount" DOUBLE PRECISION;
  END IF;
END $$;
