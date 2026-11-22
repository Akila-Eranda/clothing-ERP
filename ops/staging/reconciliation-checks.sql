-- READ-ONLY financial reconciliation checks. Every query should return ZERO rows (or the stated expectation).
-- Run on staging after the smoke tests and again after any restore:  psql -f reconciliation-checks.sql
-- Optional single tenant:  psql -v tenant="'<tenantId>'" -f ...   (default: all tenants)
\set ON_ERROR_STOP off
\if :{?tenant} \else \set tenant 'NULL' \endif

\echo '== R1 customer balance = charges - payments - credit notes +/- adjustments (tolerance 0.01) =='
SELECT c.id AS customer_id, c."tenantId", c."creditBalance" AS stored,
       round(coalesce(l.ledger, 0)::numeric, 2) AS ledger,
       round((c."creditBalance" - coalesce(l.ledger, 0))::numeric, 2) AS diff
FROM customers c
LEFT JOIN (
  SELECT "customerId",
         sum(CASE type WHEN 'CHARGE' THEN amount WHEN 'ADJUSTMENT_UP' THEN amount
                       WHEN 'PAYMENT' THEN -amount WHEN 'CREDIT_NOTE' THEN -amount WHEN 'ADJUSTMENT_DOWN' THEN -amount ELSE 0 END) AS ledger
  FROM customer_credit_transactions GROUP BY 1) l ON l."customerId" = c.id
WHERE abs(c."creditBalance" - coalesce(l.ledger, 0)) > 0.01 AND (:tenant IS NULL OR c."tenantId" = :tenant)
ORDER BY abs(c."creditBalance" - coalesce(l.ledger, 0)) DESC LIMIT 50;

\echo '== R2 allocation: sum(charge.paidAmount) = sum(payments + credit notes) per customer =='
SELECT "customerId",
       round(sum(CASE WHEN type = 'CHARGE' THEN "paidAmount" ELSE 0 END)::numeric, 2) AS allocated_on_charges,
       round(sum(CASE WHEN type IN ('PAYMENT', 'CREDIT_NOTE') THEN amount ELSE 0 END)::numeric, 2) AS payments_and_notes
FROM customer_credit_transactions
WHERE (:tenant IS NULL OR "tenantId" = :tenant)
GROUP BY 1
HAVING abs(sum(CASE WHEN type = 'CHARGE' THEN "paidAmount" ELSE 0 END) - sum(CASE WHEN type IN ('PAYMENT', 'CREDIT_NOTE') THEN amount ELSE 0 END)) > 0.01
LIMIT 50;

\echo '== R3 cash book: balanceAfter equals the running sum (rows created BEFORE this release may legitimately differ) =='
SELECT * FROM (
  SELECT id, "tenantId", "branchId", "createdAt", "balanceAfter",
         round((sum(debit - credit) OVER (PARTITION BY "tenantId", coalesce("branchId", '') ORDER BY "entryDate", "createdAt", id))::numeric, 2) AS running
  FROM cash_book_entries WHERE (:tenant IS NULL OR "tenantId" = :tenant)) x
WHERE abs("balanceAfter" - running) > 0.01 ORDER BY "createdAt" DESC LIMIT 50;

\echo '== R4 cash book holds only physical cash from this release on (rows after the deploy date with a non-CASH method) =='
SELECT "paymentMethod", count(*) AS rows, min("createdAt") AS first_seen
FROM cash_book_entries WHERE "paymentMethod" IS NOT NULL AND "paymentMethod" <> 'CASH' AND type LIKE 'CUSTOMER_%'
  AND (:tenant IS NULL OR "tenantId" = :tenant) GROUP BY 1;

\echo '== R5 journals balance: sum(debit side) = sum(credit side) per entry =='
SELECT e.id, e."tenantId", e."referenceType",
       round(sum(CASE WHEN l."debitAccountId" IS NOT NULL THEN l.amount ELSE 0 END)::numeric, 2) AS debits,
       round(sum(CASE WHEN l."creditAccountId" IS NOT NULL THEN l.amount ELSE 0 END)::numeric, 2) AS credits
FROM journal_entries e JOIN journal_lines l ON l."journalEntryId" = e.id
WHERE e.status <> 'VOID' AND (:tenant IS NULL OR e."tenantId" = :tenant)
GROUP BY e.id HAVING abs(sum(CASE WHEN l."debitAccountId" IS NOT NULL THEN l.amount ELSE 0 END) - sum(CASE WHEN l."creditAccountId" IS NOT NULL THEN l.amount ELSE 0 END)) > 0.01
LIMIT 50;

\echo '== R6 outbox: POSTED rows without a journal; completed sales / customer payments without an outbox row =='
SELECT 'posted_without_journal' AS check, count(*) FROM accounting_outbox_events WHERE status = 'POSTED' AND "journalEntryId" IS NULL
UNION ALL SELECT 'sales_without_outbox', count(*) FROM sales s WHERE s.status = 'COMPLETED' AND s."createdAt" > now() - interval '7 days'
  AND NOT EXISTS (SELECT 1 FROM accounting_outbox_events e WHERE e."tenantId" = s."tenantId" AND e."sourceType" = 'SALE' AND e."sourceId" = s.id)
UNION ALL SELECT 'customer_payments_without_outbox', count(*) FROM customer_credit_transactions c WHERE c.type = 'PAYMENT' AND c."createdAt" > now() - interval '7 days'
  AND NOT EXISTS (SELECT 1 FROM accounting_outbox_events e WHERE e."tenantId" = c."tenantId" AND e."sourceType" = 'CUSTOMER_CREDIT_PAYMENT' AND e."sourceId" = c.id);

\echo '== R7 closed shifts: stored expected cash = opening + inflows - outflows from the movements =='
SELECT r.id, r."tenantId", r."expectedCash" AS stored_expected,
       round((r."openingCash" + coalesce(m.inflow, 0) - coalesce(m.outflow, 0))::numeric, 2) AS recomputed
FROM cash_registers r
LEFT JOIN (SELECT "registerId",
                  sum(CASE WHEN type IN ('SALE', 'DEPOSIT', 'PAYMENT') THEN amount ELSE 0 END) AS inflow,
                  sum(CASE WHEN type IN ('EXPENSE', 'REFUND', 'WITHDRAWAL') THEN amount ELSE 0 END) AS outflow
           FROM cash_movements GROUP BY 1) m ON m."registerId" = r.id
WHERE r.status IN ('CLOSED', 'PENDING_APPROVAL') AND r."expectedCash" IS NOT NULL
  AND abs(r."expectedCash" - (r."openingCash" + coalesce(m.inflow, 0) - coalesce(m.outflow, 0))) > 0.01
  AND (:tenant IS NULL OR r."tenantId" = :tenant) LIMIT 50;

\echo '== R8 shifts closed more than once / variance arithmetic: variance = actual - expected =='
SELECT id, "expectedCash", "actualCash", variance FROM cash_registers
WHERE status IN ('CLOSED', 'PENDING_APPROVAL') AND abs(coalesce(variance, 0) - (coalesce("actualCash", 0) - coalesce("expectedCash", 0))) > 0.01 LIMIT 50;

\echo '== R9 stock never negative where the shop disallows negative stock =='
SELECT i."tenantId", i."variantId", i.quantity FROM inventory i JOIN tenants t ON t.id = i."tenantId"
WHERE i.quantity < 0 AND coalesce((t.settings->'pos'->>'allowNegativeStock')::boolean, true) = false LIMIT 50;
