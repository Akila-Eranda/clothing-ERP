# HEXALYTE ERP — Global Enterprise Quality Report

Date: 2026-11-22. Scope: the seven functional issues (QA-001…QA-007), brought to a verified standard.
Safety: nothing was deployed, committed or pushed; production, production credentials and production data were never used.
All verification ran on a **throw-away local PostgreSQL 16 + Redis 7 (Docker, localhost only, random one-time passwords)**, built from the repo's own `db-fresh-install` script; the containers were deleted afterwards. No secret appears in this report.

## 1. Executive Summary

| ID | Issue | Status | Evidence (all executed) |
|---|---|---|---|
| QA-001 | Customer receivables | **FIXED & VERIFIED** (implemented scope). Payment *reversal/void* feature does not exist → **INVESTIGATION REQUIRED** (design in §4.1) | 15 real-DB tests: reconciliation law, FIFO, partial/full/advance, idempotency, concurrency, rollback, refund reversal, tenant isolation; 9 outbox tests |
| QA-002 | QR management / the original `POST /payment-qr` 403 | QR cache fix **FIXED & VERIFIED**; the *production* 403 cause is **INVESTIGATION REQUIRED** (needs the response body / API log line — §4.2) | 11-case 403 cause matrix + 15 bank/QR e2e tests on real PG + Redis |
| QA-003 | Cash flow & Day-End | Backend **FIXED & VERIFIED** (shift-close race, duplicate close, re-close hole, cash-basis report, timezone). UI placement **FIXED BUT NOT VERIFIED** in a browser. Controlled *reopen* does not exist → **INVESTIGATION REQUIRED** (design §4.3) | 8 real-DB tests, 6 unit tests |
| QA-004 | WhatsApp reliability | **FIXED BUT NOT VERIFIED** against live WhatsApp (forbidden: no real messages/accounts). Logic verified with a fake Baileys + a real Redis lock | 12 service tests + 5 real-Redis lock tests |
| QA-005 | Checkout reliability | **FIXED & VERIFIED** — and a critical **connection-pool deadlock** was found and fixed | 12 real-DB tests, re-run with a pool of 1 connection |
| QA-006 | Bank accounts | Code, migration: **FIXED & VERIFIED**. Production cause (tenant-admin role lacks `accounting:update`) is **BLOCKED** on running the reviewed role step against production | 8 real-DB tests, migration upgrade-path test |
| QA-007 | Custom / demo items | **FIXED & VERIFIED** in a real browser + real DB. Return/exchange of custom lines remains a documented limitation (design §4.7) | 5 unit, 4 real-DB, 6 web, 6 browser checks |

Beyond the seven: five additional defects were found by the new tests and fixed (see §3): **checkout connection-pool deadlock** (critical), **shift re-close hole**, **simultaneous shift close**, **credentials in the URL on pre-hydration form submit**, **bank-account history deletable at database level**.

**Final release readiness (§16): READY FOR STAGING VERIFICATION — NOT CLEARED FOR PRODUCTION** until the production-only steps in §14 (role review, deploy, rotation work from the security reports) are performed and checked.

## 2. Architecture Review

Stack as found: NestJS + Prisma + PostgreSQL, Redis (PIN lockout / rate limits), Next.js, Docker/nginx. Existing engines that were **reused, not duplicated**: the accounting outbox (idempotent upsert + atomic claim + `AccountingPostingService` method→account mapping `tenderAccount`), `DocumentNumbering`, `InventoryService` (FEFO lots, reservations), `PermissionsGuard`/`TenantGuard`/`BranchContextInterceptor`, `PinLockoutService`, the day-end helpers, `AuditLogService`.

Findings that shaped the work:
1. **Outbox existed but was not transactional.** The "post to GL" intent was written only *after* the business transaction committed (event → listener → enqueue, failures only logged), `PROCESSING` rows stuck after a crash were never retried, and there was no scheduler. → added a transactional enqueue + sweeper (§4.1).
2. **Three independent cash-book writers**, none locked. → one shared, locked helper.
3. **Second-connection pattern in the sale path** (settings lookups through the root Prisma client inside an interactive transaction). With the default pool (9 here) this deadlocks at ≥ 9 concurrent checkouts. The static scan found no *direct* `this.prisma` use inside transaction callbacks; the pattern hid behind helper methods. A **one-connection-pool probe** (run any flow with `connection_limit=1`) is the reliable detector and now passes for checkout, customer payments, shift close and the outbox.
4. Money is stored as `Float` (IEEE double) throughout the schema; every calculation relies on `round2`. See §7 and the migration plan.
5. Permissions are re-read from the database on every request (token claims are only a login snapshot).

Standards now enforced (details §4–§8): tenant + branch scoping on every new query; row locks / advisory locks for read-modify-write on money; idempotency keys with request fingerprints; in-transaction ledger intents; optimistic locking for edited master data; explicit timezone from `tenant.timezone`; error messages that identify the failing guard.

## 3. Root Causes (seven issues + discoveries)

| ID | Root cause (verified) |
|---|---|
| QA-001 | Payment logic itself was sound. Defects were around it: cash-book running balance computed without a lock (3 writers); CARD/QR/UPI/bank collections written to the **physical** cash book; GL intent created only after commit (could be lost; stuck `PROCESSING` never retried). |
| QA-002 | (a) POS cached the QR list 60 s and never refreshed it. (b) 403s on QR/bank edits: `accounting:update` missing from existing tenants' Tenant Admin role (permissions are read from the DB per request). (c) The exact `POST /payment-qr` 403 is **not reproducible** for a fully-permissioned admin: the incident request shape returns 201. The 403 matrix (below) shows the only possible causes and each returns a distinct message. |
| QA-003 | Day-End block rendered mid-page. `closeRegister` read-then-wrote without a lock: simultaneous closes both succeeded (2 events, 2 approval workflows) and a `PENDING_APPROVAL` shift could be **closed again with a different counted amount**. The legacy cash-flow report counts all tenders by invoice date in server timezone (kept, documented, not changed). |
| QA-004 | A timeout reconnect ran `clearAuth()` (deleted valid credentials); no resume after restart; 3 retries; nothing stopped two API instances owning one session; concurrent starts could open two sockets. |
| QA-005 | No transaction timeout (5 s default); **pool deadlock**: `adjustStock` / `assertSaleStockAvailable` fetched tenant settings and the warehouse through the root client while the sale transaction held a connection. Before the fix: 12 concurrent single-unit sales of 4 units → 3 sold, 9 failed with "Timed out fetching a new connection from the connection pool (limit 9)" after 10.9 s. |
| QA-006 | Role data (production). UI sent all five details on every save (blocked legacy accounts). Optimistic-lock check was not atomic. DB allowed deleting an account with history (`bank_transactions` ON DELETE CASCADE; optional links SET NULL). |
| QA-007 | Not an inventory defect: custom/demo lines are **non-stock bill-only** by design (DTO doc, nullable `SaleItem.variantId`) and require SUPER_ADMIN/TENANT_ADMIN/BRANCH_MANAGER because the price guard does not cover them. The screen checked only the first role and ignored the PIN-unlocked operator, so cashiers learned of the refusal only at the end. |

**QA-002 — 403 cause matrix** (real AppModule over HTTP, incident request shape: `Authorization` + `x-tenant-id` + `x-branch-id`, body with `label/bankAccountId/mode/isDefault/branchId`):

| Cause | Response |
|---|---|
| Full-permission Tenant Admin, own branch in header and body | **201** |
| Missing `accounting:create` | 403 `Insufficient permissions. Required: [accounting:create]` |
| Suspended shop / expired Starter trial (hits **every** request of the shop) | 403 `This shop is suspended. Contact support.` |
| Branch id of another shop in body, or a stale/foreign `x-branch-id` header | 403 `Branch is not available in this tenant.` |
| Inactive branch in header | 403 `Selected branch is inactive.` |
| `x-tenant-id` ≠ token tenant | 4xx mentioning the tenant |
| Branch Manager (no `accounting:create`) | 403 permission message |
| Bank account of another shop | 400 |

The server already logs every 4xx with the message and a request id. **To settle the production cause:** `docker logs fashionerp_api --since 24h | grep "payment-qr" | grep " 403"` (read-only). Note: the pasted token's claim list is only a login snapshot; the live permission set is in the database, so "the token lacks X" is not proof that the role lacks X today.

## 4. Implementation Details (by part)

### 4.1 Receivables, outbox, cash book (QA-001)
- `shared/cash-book.helper.ts` — single `appendCashBookEntryTx`: per-tenant `pg_advisory_xact_lock`, balance = previous + debit − credit, rounding to cents; `isPhysicalCashMethod` (only `CASH`). Used by customer payments, supplier payments and manual entries (all three previously unlocked).
- `customer-credit.service.ts` — **policy change (requested):** only CASH writes the cash book; CARD/QR/UPI/BANK_TRANSFER settle through their GL clearing/bank accounts (`tenderAccount`: CASH→cash, CARD→card, UPI→upi, QR/BANK→bank, CHEQUE→cheques receivable, WALLET→customer-advance liability, CUSTOMER_CREDIT→AR); cheques stay cheques. The GL intent is written **inside the payment transaction** (`accounting-outbox.tx.ts`), so payment and intent commit or roll back together.
- `accounting-outbox.service.ts` — `sweep()` (+ `@Cron` every 2 min, `ACCOUNTING_OUTBOX_SWEEP=false` disables): recovers `PROCESSING` rows idle > 10 min, retries `PENDING/FAILED` rows older than 60 s up to 10 attempts; atomic claim makes concurrent workers safe.
- `pos.module.ts` — the sale transaction also writes the `SALE` GL intent.
- **Reconciliation law**, asserted in every receivables test: `customer.creditBalance = Σ charges − Σ payments − Σ credit notes ± adjustments` and `Σ charge.paidAmount = Σ payments + credit notes`.
- Immutability: PAYMENT/CHARGE rows are never rewritten except a charge's `paidAmount/status` (allocation); test proves payment rows are unchanged by later payments. (A database trigger forbidding UPDATE/DELETE on financial rows is recommended, not added.)
- **Not implemented — payment reversal/void:** no such feature exists (only return-driven reversal, which is tested). Safe design: an append-only `REVERSAL` transaction referencing the payment, re-opening exactly the charges it settled (using the stored allocations), a compensating outbox event (`CUSTOMER_CREDIT_PAYMENT_REVERSAL`), manager approval + reason + audit, forbidden when the payment's advance has already been spent. Needs a product decision.
- **Known gap:** customer payments by QR/BANK map to the shared "bank" GL account, because the payment request carries no `bankAccountId`; the per-bank-account GL (`BankAccount.glAccountId`) is not used for them.

### 4.2 QR (QA-002)
Shared `pos-qr-cache` with `invalidatePosQrCache()` on every QR/bank save and settings reload. Existing protections verified on real PG: STATIC/DYNAMIC EMV payloads with CRC, image magic-byte/type/size checks and tenant-scoped storage, QR↔bank-account↔branch eligibility at sale time, disabled bank account hides/blocks its QR (15 e2e tests).

### 4.3 Cash & Day-End (QA-003)
- `closeRegister` now runs under `SELECT … FOR UPDATE`, recomputes expected cash from the movements at the moment of closing, and only an **OPEN** shift can be closed (`PENDING_APPROVAL` is refused with "waiting for manager approval"). 8 simultaneous closes → 1 success, 1 event, 1 workflow.
- New additive report `GET /cash/physical-flow` (+ `/csv`, formula-injection-safe): per shift-day (shop timezone from `tenant.timezone`, default Asia/Colombo), branch and cashier — opening, sales, deposits, transfers in/out, expenses, refunds, withdrawals, expected closing, counted, variance, open shifts, and a self-check that `Opening + inflows − outflows = Expected`. Branch-bound users only see their branch; other shops never appear. **The legacy `/accounting/cash-flow` keeps its meaning** (all tenders by invoice date, server timezone) and should be labelled as such; the new report is the cash-basis one. The new endpoint has no UI yet.
- UI: the "Cashier wallets / Day End · Clear All" block is now the last section of Cash & Bank (static test).
- **Not implemented — controlled reopen:** there is no reopen path (so no uncontrolled one). Safe design: manager-PIN + reason, only the latest shift of a counter, not cleared/handed over, writes an audit row and reverses `expected/actual/variance`, state `REOPENED` → must be closed again.

### 4.4 WhatsApp (QA-004)
Never wipes credentials except on a genuine logout (401); exponential back-off **with jitter** (3 s·2ⁿ ceiling, 60 s cap, random in [½, 1]×ceiling), 8 attempts; startup resume of **paired** sessions only (corrupt/unpaired folders are left alone), staggered; in-process start de-duplication; **cross-instance ownership lock** (Redis `SET NX PX`, compare-and-extend / compare-and-delete Lua; 60 s TTL renewed every 20 s; local lock when `REDIS_HOST` is unset — single-instance assumption); ownership lost → socket closed without logout; Redis unreachable → no socket opened and no wipe, retried; graceful shutdown closes sockets and releases locks; health summary without secrets; private credential directory (earlier security phase). Nothing in the service sends messages on reconnect.

### 4.5 Checkout (QA-005)
`$transaction` limits (10 s wait / 30 s) kept; the **pool deadlock** fixed in `inventory.service.ts` (settings, warehouse and lot lookups use the caller's transaction client); outbox intent in the sale transaction. Scenarios 1–7 of the brief are covered (§9): *payment succeeds but sale fails* and *external reconciliation* do not apply — there is no payment-gateway integration (card/QR/bank are tenders declared at the till), documented rather than invented; *serial numbers*: the POS has no serial-number feature.

### 4.6 Bank accounts (QA-006)
Atomic optimistic lock (`updateMany … WHERE updatedAt = loaded`), changed-fields-only edits (rename/disable need no re-entry), migration `20261122090000_bank_account_restrict_delete` (all 5 foreign keys → `ON DELETE RESTRICT`; idempotent; data untouched), add-only role review verified (adds missing defaults, never removes, never touches custom roles, idempotent, refuses a wrong tenant confirmation). There is no delete endpoint; the database now enforces it too. Bank accounts are tenant-level (branch filtering of accounts is not implemented).

### 4.7 Custom / demo items (QA-007)
Business rule confirmed from code: **non-stock, bill-only; manager required; ordinary stock lines are always validated and deducted** (mixed-cart test, incl. refusal of an unavailable stock line next to a custom line; a catalog id cannot be smuggled in as custom). Operator detection mirrors the API (PIN-unlocked operator decides; any role qualifies; no info ⇒ no permission); early warning on add, block before confirm. Browser-verified: cashier warned and stopped; manager completes a sale; database shows 1 sale, 1 bill-only line, 0 stock movements, outbox POSTED.
**Returns/exchanges of custom lines (limitation):** `ReturnItemDto.variantId` is required, so a bill-only line cannot be returned. Safe design: return by `saleItemId` (not variant) for lines with null variant; refund money only (no restock, no stock movement); manager authorization; cap at sold quantity − already returned; reverse tax/discount proportionally; GL reverses revenue, no COGS. Exchange for custom lines = refund + new sale. Not implemented (needs schema change on `ReturnItem`).
Audit: the authorizing operator is `sale.cashierId` (role-checked at sale time); a dedicated "bill-only authorized by" field would need a schema change.

## 5. Files Changed (this phase; earlier phases' files are in the previous reports)

**API:** `shared/cash-book.helper.ts` (new), `shared/physical-cash-flow.helper.ts` (+spec, new), `modules/accounting/accounting-outbox.tx.ts` (new), `accounting-outbox.service.ts`, `finance.service.ts`, `modules/customers/customer-credit.service.ts` (+spec updated), `modules/suppliers/supplier-ap.service.ts`, `modules/pos/pos.module.ts`, `modules/inventory/inventory.service.ts`, `modules/cash-management/cash-management.module.ts`, `modules/whatsapp/whatsapp.service.ts`, `whatsapp-session-lock.ts`, `whatsapp-reconnect.helper.ts` (+specs), `prisma/schema.prisma`, `prisma/migrations/20261122090000_bank_account_restrict_delete/`.
**Web:** `pos-custom-items.ts`, `pos-qr-cache.ts`, `bank-account.ts`, `pos-overlay.tsx`, `pos-qr-payment.tsx`, `payment-qr-settings-tab.tsx`, `bank-accounts-card.tsx`, `cash-bank-hub.tsx`, and `method="post"` on six credential/PIN forms (login, register, reset/forgot password, admin login, manager approval).
**Tests added:** `test-int/*.int-spec.ts` (5 suites, 45 tests), `test/payment-qr-403.e2e-spec.ts` (11), `test/pos-checkout-reliability.e2e-spec.ts` (12), `whatsapp.service.spec.ts` (12), `physical-cash-flow.helper.spec.ts` (6), plus unit/web tests from the earlier phase and `credential-forms.test.ts` (6), `pos-qr-cache.test.ts`, `cash-bank-hub-order.test.ts`, `pos-custom-items.test.ts`; harness: `test-int/{jest-int.config.ts,jest-e2e-local.config.ts,run-e2e-local.cjs,helpers/db.ts,browser/*,README.md}`.
Unrelated uncommitted edits already in the working tree (theme/layout/dashboard files, `apps/mcp-server`) are not part of this work.

## 6. Database & Migration Requirements
- **One migration:** `20261122090000_bank_account_restrict_delete` — constraints only; no row changes; no table rewrite; seconds. Verified two ways: fresh install (matches `schema.prisma`) and **upgrade of a database that had the old rules** (FK delete rules before: cascade×1, set-null×2, restrict×2 → after: restrict×5; re-run is a no-op).
- Rollback SQL (constraints only): re-add the five FKs with their previous rule (`bank_transactions` → `ON DELETE CASCADE`; the three optional links → `ON DELETE SET NULL`; the two others stay RESTRICT).
- Compatibility: operators who relied on deleting a bank account with history will now get a foreign-key error (intended). No API contract changed; the new cash-flow endpoints are additive.
- No schema change for outbox, locks (Redis keys `wa-session-owner:<tenant>`, Postgres advisory lock `cashbook:<tenant>`), or the cash-flow report.
- Policy/compat notes: historical cash-book rows with non-cash `paymentMethod` remain (history is not rewritten); from now on only CASH adds rows — any report that summed the cash book as "all collections" will show less; use the GL / outbox for non-cash.

## 7. Financial Integrity Assessment
- **Strong now:** transactional ledger intent + sweeper (payment ↔ GL cannot silently diverge); serialised cash book; exactly-once payments/sales under concurrent duplicates; full rollback after late failure with **no invoice-number gap**; reconciliation law proven under concurrency; FIFO allocation; shift variance/expected maths; duplicate/late shift close impossible.
- **Precision:** all money columns are `Float`. Mitigated by `round2` at every boundary and tested (e.g. 0.1 + 0.2 sums exactly 0.3 in the cash-flow totals), but IEEE doubles are not a global-ERP standard. **Recommendation:** migrate money columns to `NUMERIC(18,2)` (quantities `NUMERIC(18,3)`) with expand/contract (add decimal columns, dual-write, backfill, switch reads, drop), and use a decimal library in services; do it module by module starting with ledgers. Not done here (cross-cutting, high blast radius).
- **Currency/timezone:** the cash reports now take the shop timezone from `tenant.timezone` (explicit default Asia/Colombo). Currency is LKR-formatted in the UI; there is no per-tenant currency setting in the data model for these flows — future work.
- **Gaps:** payment reversal/void (design §4.1); per-bank GL for QR/BANK customer payments; DB-level immutability triggers; legacy `/accounting/cash-flow` still counts non-cash tenders and the server timezone (kept for compatibility).

## 8. Security Assessment
Within this phase: tenant isolation re-verified on every new/changed path (receivables, outbox, shift, cash-flow report, bank accounts, QR); role review is add-only and tenant-confirmed; WhatsApp ownership lock prevents session hijack-by-duplication; credentials no longer travel in URLs on a pre-hydration submit (6 forms); QR image storage/validation unchanged and tested. The production credential/secret findings remain as in `SECURITY_REMEDIATION_REPORT.md` and `PRODUCTION_SECURITY_READINESS_REPORT.md` — **still open until the owner executes them**. Local `.env` auto-loading enabled Keycloak mode in the test runner; the runner now forces it off (developers should know a stray local `.env` changes behaviour).

## 9. Automated Test Results (all executed; counts from the final runs)
| Suite | Result |
|---|---|
| API unit/spec (`npx jest --runInBand`, whole API) | **115 suites, 998 tests passed** |
| Web unit (`node --test`) | **141 passed** |
| `tsc --noEmit` API / web | 0 errors / 0 errors |

## 10. Integration Test Results (real PostgreSQL 16 + Redis 7)
| Suite | Result |
|---|---|
| `test-int` (customer receivables 15, outbox 9, shift close + cash flow 8, bank accounts 8, WhatsApp lock 5) | **5 suites, 45 tests passed** |
| `test/*.e2e-spec.ts` full-app HTTP (33 suites; includes the new 403 matrix and checkout reliability) | **32 suites, 513 tests passed; 1 suite cannot start** — `step1b-audit-sql` needs `docs/ops-sql/step1b-audit-2026-11.sql`, which has **never existed in the repository** (pre-existing; not caused by this work) |
| One-connection-pool probe (checkout 11 flows, receivables, shift close, outbox) | passed (the 25-way concurrency test is excluded: it legitimately queues past a 4 s pool timeout) |
Caveat found while testing: two e2e runs at the same time share Redis PIN counters and the DB and produce false failures (19 in `cash-controls`); run one at a time (documented in `test-int/README.md`).

**Before/after evidence:** 12 concurrent sales of 4 units — before: 3 sold, 9 pool-timeout failures, 10.9 s; after: exactly 4 sold, 8 refused for stock, 1.6 s. I did **not** re-run the old code against the new shift-close/outbox/cash-book tests, so those tests prove the current behaviour but their failure on the old code is inferred from the code, not demonstrated.

## 11. Browser Test Results (local Chrome via playwright-core; local API + web + throw-away DB)
- **27/27**: 3 roles (Tenant Admin, Branch Manager, Cashier) × 3 viewports (desktop 1440×900, tablet 820×1180, mobile 390×844): login, POS reachable, no horizontal scroll, no runtime errors.
- **6/6** custom-item scenario (desktop): cashier warned and stopped before any sale; manager sale completes; database confirmed (1 sale, 1 bill-only line, 0 stock movements, ledger intent POSTED by the live app).
- A first run failed 6 of 9 logins: the form was submitted **before React hydrated**, producing a native GET with credentials in the URL — fixed (`method="post"`, static test) and the script now waits for hydration.
- Observations (not fixed): the POS terminal on a phone is cramped (sidebar over content) though it does not overflow; the freshly seeded shop's product grid showed "No products found" (the seeder writes inventory rows directly; not investigated); the Cash & Bank page and the new cash-flow endpoint were not exercised in a browser.

## 12. Performance Findings
40-line checkout ≈ 2.2–2.4 s; 12 concurrent checkouts 1.6 s; 25 concurrent checkouts (pool 9) 4.3 s with 0 failures. Default Prisma pool = 2×CPU+1 (9 on this host) with a 10 s pool timeout: set `connection_limit` (≈ 20–30) and make sure Postgres `max_connections` ≥ instances × limit. The sale transaction holds locks up to 30 s worst case — monitor. Cash-book appends serialise per tenant (negligible at till volumes; a very large multi-till shop could see queuing).

## 13. Remaining Risks
1. Production role data (QA-006/002) and the real cause of the original 403 need the production log line/DB read — blocked.
2. WhatsApp behaviour against the real service is unverified; two-instance deployments must set `REDIS_HOST`.
3. Money stored as `Float` (§7).
4. No payment reversal/void, no controlled day-end reopen, no custom-line returns (designs above).
5. Legacy cash-flow report semantics unchanged (documented).
6. New cash-flow endpoints have no UI; Day-End placement is verified statically only.
7. Sweeper posts old PENDING events after deploy: any backlog of historical PENDING/FAILED outbox rows (attempts < 10) will be processed automatically within minutes — review the backlog first (SQL below).
8. `step1b-audit-sql` e2e fixture missing; secrets/credential findings from the security reports remain open.

## 14. Deployment Runbook (not executed; needs approval)
1. **Backups:** `pg_dump` + `storage` tar (see security readiness report §9 step 1).
2. **Pre-flight on production (read-only):** outbox backlog `SELECT status, count(*) FROM accounting_outbox_events GROUP BY 1;` — clear or understand any PENDING/FAILED rows before enabling the sweeper (or deploy with `ACCOUNTING_OUTBOX_SWEEP=false` first); duplicate-risk check that no two API instances run WhatsApp without Redis.
3. **Migration:** `npx prisma migrate deploy` (one constraint-only migration; seconds).
4. **Role review (QA-006):** per affected tenant `review-system-roles.ts --tenant <id>` (dry run) then `--apply --confirm <id> --actor "<name>" --add-only`.
5. **Deploy API + web together** (web `method="post"`, custom-item guard, QR cache, bank form are web-side; locks/outbox/close/physical-flow are API-side). Set `REDIS_HOST/PORT/PASSWORD` (already used by PIN lockout), keep `WHATSAPP_AUTH_DIR` private (security plan), optionally `connection_limit` in `DATABASE_URL`.
6. **Smoke:** cashier Demo item (blocked early), manager Demo sale, stock sale, bank rename on a legacy account, QR add → POS sees it without reload, `GET /cash/physical-flow`, API log has no `connection pool` timeouts, outbox drains (`PENDING` → `POSTED`).
7. **Original 403:** run the log one-liner in §3; if it names `accounting:create/update` apply step 4; if "suspended", fix the tenant status; if "Branch is not available", clear the stale `fe_active_branch` in that browser.
8. **WhatsApp:** after deploy confirm "Resuming N saved WhatsApp session(s)"; re-pair only if credentials were exposed (security reports).

## 15. Rollback Plan
API/web: redeploy the previous images (no data format change). Migration: apply the rollback SQL (§6) — optional, harmless to leave. Outbox sweeper: `ACCOUNTING_OUTBOX_SWEEP=false` + restart (intents already written stay PENDING and are picked up when re-enabled). WhatsApp resume: `WHATSAPP_AUTO_RESUME=false`. Cash-book policy: the only behavioural policy change (non-cash no longer in the cash book) is code-only and reversible by redeploying the previous API.

## 16. Final Release Readiness
**READY FOR STAGING VERIFICATION. NOT CLEARED FOR PRODUCTION.**
Why not production yet: (a) production-only steps are unperformed (role review, migration, deploy, log check for the original 403); (b) WhatsApp is verified only against a simulator; (c) the credential/secret remediation from the security reports is still pending with the owner; (d) the open design items (reversal, reopen, custom returns, decimal money) are not part of this release and must be accepted as known gaps.
What is demonstrated, not claimed: concurrency-safe receivables, checkout and shift close on real PostgreSQL; a deadlock that would have hit any shop with ≥ 9 simultaneous checkouts, found and fixed; the 403 cause matrix; role-by-role browser behaviour on three screen sizes.
