-- Bank account details shown to the customer with a QR payment (account holder, branch name, branch code).
-- Additive only: three nullable columns on bank_accounts. No existing row is read, rewritten or deleted.
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "branchName" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "branchCode" TEXT;
