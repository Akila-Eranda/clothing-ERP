-- ROLLBACK of migration 20261122090000_bank_account_restrict_delete (constraints only - no row is read or changed).
-- Restores the exact previous delete rules (taken from baseline.sql / the earlier migrations):
--   sale_payments      -> ON DELETE SET NULL
--   bank_transactions  -> ON DELETE CASCADE
--   cheques            -> ON DELETE SET NULL
--   (every other foreign key to bank_accounts was already RESTRICT and stays RESTRICT)
-- Leaving the migration in place is harmless; roll back only if a workflow genuinely needs to delete bank accounts
-- that have history (not recommended: that destroys the bank ledger / unlinks payments).
-- After running this, ALSO mark the migration as rolled back so `prisma migrate deploy` does not re-apply it:
--   npx prisma migrate resolve --rolled-back 20261122090000_bank_account_restrict_delete
BEGIN;
ALTER TABLE "sale_payments"     DROP CONSTRAINT "sale_payments_bankAccountId_fkey";
ALTER TABLE "sale_payments"     ADD  CONSTRAINT "sale_payments_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_bankAccountId_fkey";
ALTER TABLE "bank_transactions" ADD  CONSTRAINT "bank_transactions_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cheques"           DROP CONSTRAINT "cheques_bankAccountId_fkey";
ALTER TABLE "cheques"           ADD  CONSTRAINT "cheques_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
