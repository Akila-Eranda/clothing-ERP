-- Bank accounts with history must never disappear (Part 6): deactivate, never delete.
-- The API has no delete endpoint; this makes the DATABASE enforce the same rule. Every foreign key that points at
-- bank_accounts becomes ON DELETE RESTRICT. Before: bank_transactions was ON DELETE CASCADE (deleting an account
-- silently deleted its whole bank ledger) and the optional links (payments, cheques, QR codes ...) were SET NULL
-- (history silently lost its bank).
--
-- Data safety: constraints only - no row is read, changed or deleted. Existing data already satisfies RESTRICT.
-- Idempotent: only constraints whose delete rule is not already RESTRICT are touched.
-- Rollback: re-create the constraints with the previous rule (CASCADE for bank_transactions, SET NULL for the
-- optional links); no data is affected either way.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname, con.conrelid::regclass AS tbl, att.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.bank_accounts'::regclass
      AND con.confdeltype <> 'r'
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      r.tbl, r.conname, r.col
    );
  END LOOP;
END $$;
