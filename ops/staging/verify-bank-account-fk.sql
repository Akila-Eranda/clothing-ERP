-- READ-ONLY. Delete rule of every foreign key that points at bank_accounts.
-- Expected AFTER migration 20261122090000_bank_account_restrict_delete: every row = RESTRICT.
-- Expected AFTER running rollback-bank-account-fk.sql: sale_payments = SET NULL, bank_transactions = CASCADE,
-- cheques = SET NULL, all others RESTRICT.
SELECT con.conrelid::regclass AS table_name,
       con.conname,
       CASE con.confdeltype WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                            WHEN 'a' THEN 'NO ACTION' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint con
WHERE con.contype = 'f' AND con.confrelid = 'public.bank_accounts'::regclass
ORDER BY 1, 2;
