-- READ-ONLY. Accounting outbox backlog. Run BEFORE deploying the sweeper: it will (re)process PENDING / FAILED rows
-- older than 60 s with fewer than 10 attempts, across ALL tenants, every 2 minutes.
-- Decide per row group whether that is wanted (deploy with ACCOUNTING_OUTBOX_SWEEP=false first if unsure).

-- 1) overview
SELECT status, "sourceType", count(*) AS rows, min("createdAt") AS oldest, max(attempts) AS max_attempts
FROM accounting_outbox_events GROUP BY 1, 2 ORDER BY 1, 2;

-- 2) what the sweeper would pick up right now
SELECT count(*) AS would_be_processed
FROM accounting_outbox_events
WHERE status IN ('PENDING', 'FAILED') AND attempts < 10 AND "createdAt" < now() - interval '60 seconds';

-- 3) failures by reason (first 100 chars)
SELECT left(coalesce("lastError", '(none)'), 100) AS reason, count(*) AS rows
FROM accounting_outbox_events WHERE status = 'FAILED' GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

-- 4) rows stuck in PROCESSING (a crashed worker) - the sweeper returns these to FAILED after 10 minutes
SELECT count(*) AS stuck_processing FROM accounting_outbox_events
WHERE status = 'PROCESSING' AND "updatedAt" < now() - interval '10 minutes';

-- 5) business records WITHOUT any outbox row (cannot be recovered by the sweeper; use scanMissing)
SELECT 'SALE' AS source, count(*) AS missing
FROM sales s WHERE s.status = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM accounting_outbox_events e WHERE e."tenantId" = s."tenantId" AND e."sourceType" = 'SALE' AND e."sourceId" = s.id)
UNION ALL
SELECT 'CUSTOMER_CREDIT_PAYMENT', count(*)
FROM customer_credit_transactions c WHERE c.type = 'PAYMENT'
  AND NOT EXISTS (SELECT 1 FROM accounting_outbox_events e WHERE e."tenantId" = c."tenantId" AND e."sourceType" = 'CUSTOMER_CREDIT_PAYMENT' AND e."sourceId" = c.id);

-- 6) POSTED rows that point at no journal (should be 0)
SELECT count(*) AS posted_without_journal FROM accounting_outbox_events WHERE status = 'POSTED' AND "journalEntryId" IS NULL;
