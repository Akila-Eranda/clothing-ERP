# HexaOne ERP — Remediation Implementation Plan

**Date:** 3 Nov 2026 · **Source:** [full-system-audit-2026-11.md](full-system-audit-2026-11.md) (33 findings F-01…F-33, DB-1…DB-10) · **Working branch:** `security/incident-2026-11` (HEAD `2fda3cb`)
**Status:** plan only, awaiting approval. No application code has been changed; nothing committed, pushed, published or deployed.

**Ground rules for implementation** (from the brief): all work stays local; no pushes, deploys or releases; no production servers or databases; migrations are applied only to throwaway local databases. Each phase ends with the full local test gate (§7) and a commit on a local branch for review.

**Customer Data Protection Policy (3 Nov 2026) applies to every phase.** HexaOne is live, with about 10 paying shops. Zero data loss, zero unauthorised data changes, zero production deployments. §0 below shows how each change meets the policy; four items **need your approval before implementation** (§0.4).

---

## 0. Customer data protection

### 0.1 Working rules (from the policy, applied to this plan)

* **No production access of any kind.** Every database used is a new local Podman container. To get a clean database I **start a new container**. I never run `DROP SCHEMA`, `TRUNCATE`, `migrate reset` or `db push --force-reset` against any database, including test ones. (The 2 Nov migration check used `DROP SCHEMA` on a throwaway container; that is no longer allowed and won't be repeated.)
* **An empty or synthetic database is not production.** Migration tests use a database built from the *previous* schema and filled with realistic synthetic data covering the edge cases real shops have: nulls, decimals, negative stock, large quantities, soft-deleted rows, multiple tenants, partial returns, credit balances. Using an anonymised copy of production is better but needs your written authorisation (§0.4, item 4).
* **No customer data in logs or reports.** Integrity reports show counts and totals only, never names, phones or emails.
* **Stop conditions** (any one halts the phase and I report back):
  - a migration could lose data;
  - a tenant-isolation test fails;
  - a financial total changes unexpectedly;
  - a backup can't be restored;
  - existing records change unexpectedly;
  - a step would need production access.

### 0.2 Migration safety assessment

| # | Migration | Tables / columns | Existing data touched? | Lossless? | Rollback without data loss? | Verdict |
|---|---|---|---|---|---|---|
| 1 | `20261101100000_decimal_quantities` (POS branch) | 22 quantity columns in `inventory`, `inventory_lots`, reservations, stock counts, transfers, returns, PO/PR/GRN/supplier-return lines | type change, values unchanged | **Yes**: every 32-bit integer is exact in DOUBLE PRECISION; no index or unique constraint uses these columns; integer defaults are kept | **No for the schema**: narrowing back to INTEGER would round any decimal written afterwards. **Rollback is therefore forward-only:** the columns stay DOUBLE, and an app rollback must work against DOUBLE columns (test T-BC below) | ⚠️ **Needs approval** (§0.4, item 1). Also rewrites the tables, which locks them while running (off-peak only, in a later release) |
| 2 | `20261101120000_sale_client_request_id` (POS branch) | `sales.clientRequestId` (new, nullable) + unique `(tenantId, clientRequestId)` | No: existing rows stay NULL, and PostgreSQL treats NULLs as distinct, so the index can't fail on existing data | Yes | Yes: leave the column (old code ignores it); dropping it would only lose retry keys | ✅ Safe |
| 3 | `20261103090000_hash_session_tokens` (security branch, committed 3 Nov) | `sessions.token` | **Yes: rewrites every existing session row** (raw JWT → SHA-256) | No business data is involved, but the change is **irreversible** (one-way hash) | Old code can't match hashed rows on logout; harmless (tokens expire in 15 min) | ⚠️ **Needs approval** (§0.4, item 2): it modifies existing records. Alternative: drop this data step and let old rows expire |
| 4 | `…_permission_catalogue` (P1, F-06) | `permissions` (global catalogue) | Inserts only (`ON CONFLICT DO NOTHING`); no existing row changes | Yes | Yes: delete only the inserted rows | ✅ Safe as a migration. The **runtime effect** is in 0.3 |
| 5 | `…_workflow_task_consumption` (P2, F-03) | 2 new nullable columns on workflow tasks | No | Yes | Yes (leave the columns) | ✅ Safe |
| 6 | `…_soft_delete_customers_users` (P4, F-09/F-10) | new nullable `deletedAt`, `deletedBy` on `customers`, `users` | No | Yes | Yes (leave the columns) | ✅ Safe. **Revised:** the existing `@@unique([tenantId, phone])` and `@@unique([tenantId, email])` stay unchanged (no partial index); re-adding a soft-deleted phone offers "restore" instead |
| 7 | `…_tenant_scoped_coupon_code` (P6, DB-1) | `promotions.couponCode` unique → `(tenantId, couponCode)` | No rows change; a constraint is replaced | Yes: the current global uniqueness already guarantees per-tenant uniqueness, so the new index can't fail | Recreating the global unique could fail once two shops use the same code, which is a rollback **blocker, not data loss** | ✅ Safe; rollback = keep the new index |
| 8 | `…_fk_and_tenant_indexes` (P6, DB-2/3) | indexes only | No | Yes | Yes (`DROP INDEX` removes no data) | ✅ Safe. `CREATE INDEX CONCURRENTLY` must run outside a transaction, so it gets its own migration file |
| 9 | `…_vertical_decimal_quantities` (P6, F-15b) | quotation, job-card, fitting-session quantities | type change | Yes (as #1) | Forward-only (as #1) | ⚠️ Same approval as #1; can be postponed, since it isn't a grocery need |

### 0.2.1 ⛔ STOP: P0 migration gate result (3 Nov 2026)

Gate run on new local containers with synthetic data in all 156 tables (3 tenants, every FK valid, edge values 0, 1, −3, 2,147,483,647 in the 22 target columns):

| Check | Result |
|---|---|
| Backup → restore into a second new container | ✅ 584/584 checks identical |
| Apply `decimal_quantities` + `sale_client_request_id` | ✅ applied, no errors |
| Integrity before vs after (counts, row fingerprints, target values, totals, 243 FK orphan checks) | ✅ 584/584 identical, 0 orphans |
| Schema parity (`migrate diff` vs merged `schema.prisma`) | ✅ no difference |
| **T-BC: current production code (`main` Prisma client) against the migrated DB** | ❌ **FAILED: data corruption** |

T-BC evidence (synthetic rows, throwaway DB):

| Old-code operation on a migrated column | Before | Stored afterwards |
|---|---|---|
| `inventoryLot.update({ quantity: 21 })` | 20 | **1.04e-322** (integer bits read as a double) |
| `update({ quantity: { increment: 5 } })` | 20 | **20** (increment silently lost) |
| read a row holding 2.5 | 2.5 | client returns **2** (silent truncation) |

Reads of integer-valued rows work, and the new `sales.clientRequestId` column is ignored safely.

**Consequence:** after migration #1, **any process using a Prisma client generated from the old schema corrupts stock quantities.** That covers an app rollback, a rolling deploy where old and new API instances overlap, a stale `node_modules/.prisma` on the server, and the ops scripts in `scripts/` that use Prisma (`kc_provision*.js`, `grant_sa.js`, `_seed_cakehouse.js`). The approved "forward-only with app-only rollback" safeguard is therefore **invalid**, and the policy rule "do not execute a migration if rollback could destroy customer data" applies.

**Resolution (3 Nov 2026, owner chose Option 1):** the `ALTER TYPE` migration was replaced by an additive **expand/contract** migration `20261103150000_decimal_quantities_expand` (new `…Dec` columns + sync triggers + `hx_qty_sync_log`). It passed every gate check locally, including the unmodified production app running against the migrated database before, during and after new-app use. Design and full results: [expand-contract-decimal-quantities.md](expand-contract-decimal-quantities.md).

Original stop note: P0 was halted. The local merge (`e2e3b7a`) and the session-step removal (`b2511c6`) are commits on the local branch only; no migration has been applied anywhere except throwaway containers. Options for the owner are in the P0 stop report (not implemented):
1. **Expand/contract migration:** add new decimal columns next to the integer ones, keep both in sync with a database trigger during the transition, switch reads, and drop the old columns only in a later release once no old client can exist. Rollback-safe; the most work.
2. **`NUMERIC(14,3)` instead of `DOUBLE PRECISION`,** if a local test shows old clients then fail loudly (an error) instead of corrupting. Needs a T-BC run first.
3. **Strict cut-over runbook:** stop every old process, migrate, start only new code, and never run old code again (no rollback: fix-forward only). Lowest effort, but it relies entirely on operational discipline.

### 0.3 Code changes that alter existing records at runtime (not migrations)

These change customer data without any migration, so the policy applies to them too:

| Change | What changes in existing tenants | When | Verdict |
|---|---|---|---|
| **Already committed: `849b4dc` (N1, 3 Nov)** | `ensureSystemRoles()` runs on every login and **removes** `products:update`, `inventory:update`, `accounting:create/update/delete` from each shop's system **Cashier** role | first login after release | ⚠️ **Needs approval** (§0.4, item 3): it silently changes each shop's role setup. Custom roles aren't touched |
| F-06 permission catalogue | `ensureSystemRoles()` then **adds** the new permissions to each shop's system **Tenant Admin** role | first login after release | ⚠️ same approval (item 3) |
| N5 role-sync rework | replaces delete-then-recreate with a diff inside a transaction, and stops running it on every login | — | ✅ reduces silent changes; recommended **before** any release of the two rows above |
| F-29 negative-stock default | new grocery tenants only; existing tenants' settings untouched | tenant creation | ✅ |
| F-09/F-10 soft delete | deletes become soft from now on; existing rows untouched | — | ✅ strengthens protection |
| F-02/F-03/F-04 money rules | apply to new sales, returns and expenses only; no historical record is recalculated | — | ✅ |
| F-16 balance sheet | report output changes; no stored data changes | — | ✅ (expect owners to see different figures) |

### 0.4 Items needing your approval before implementation

1. **Decimal migrations (#1, #9) are forward-only.** The data is preserved exactly, but the schema can't be rolled back without risking decimals written after release. Proposed safeguard: before any release, a local test runs the **current production code (`main`) against the migrated schema** (T-BC) to prove that rolling back the app alone is safe. Approve forward-only?
2. **Session-token rewrite (#3, already committed).** Keep it (one-way rewrite of session rows, no business data), or remove the data step so old rows simply expire? Recommendation: **remove the data step** for zero modification of existing rows; the code change (hash new tokens, never return them) stays.
3. **Automatic role changes on login (0.3).** May the release change existing shops' system Cashier and Tenant Admin roles automatically? Recommendation: implement N5 first, then apply role changes through a reviewed, logged one-off step per tenant, with a before/after report of each role's permissions.
4. **Test data.** Synthetic data only (default), or will you authorise preparing an anonymised production copy? (That would be done by you or ops; I can't access production.)

### 0.5 Data integrity check (before and after every migration and every phase)

Run on the local test database; outputs counts and totals only. Any difference outside the expected change list is a **stop condition**.

```sql
-- 1. Row counts per tenant (counts only, no personal data)
SELECT t.id AS tenant,
  (SELECT count(*) FROM customers c WHERE c."tenantId"=t.id)            AS customers,
  (SELECT count(*) FROM products p WHERE p."tenantId"=t.id)             AS products,
  (SELECT count(*) FROM product_variants v JOIN products p ON p.id=v."productId" WHERE p."tenantId"=t.id) AS variants,
  (SELECT count(*) FROM sales s WHERE s."tenantId"=t.id)                AS sales,
  (SELECT count(*) FROM sale_payments sp JOIN sales s ON s.id=sp."saleId" WHERE s."tenantId"=t.id) AS payments,
  (SELECT count(*) FROM inventory_logs m WHERE m."tenantId"=t.id)       AS stock_movements,
  (SELECT count(*) FROM purchase_orders po WHERE po."tenantId"=t.id)    AS purchase_orders,
  (SELECT count(*) FROM suppliers su WHERE su."tenantId"=t.id)          AS suppliers,
  (SELECT count(*) FROM journal_entries je WHERE je."tenantId"=t.id)    AS journals,
  (SELECT count(*) FROM journal_lines jl JOIN journal_entries je ON je.id=jl."journalEntryId" WHERE je."tenantId"=t.id) AS journal_lines,
  (SELECT count(*) FROM users u WHERE u."tenantId"=t.id)                AS users,
  (SELECT count(*) FROM roles r WHERE r."tenantId"=t.id)                AS roles
FROM tenants t ORDER BY t.id;

-- 2. Financial and stock totals per tenant
SELECT s."tenantId", round(sum(s.total)::numeric,2) AS sales_total, round(sum(s."taxAmount")::numeric,2) AS tax_total,
       max(s."invoiceNumber") AS last_invoice, count(DISTINCT s."invoiceNumber") = count(*) AS invoices_unique
FROM sales s GROUP BY 1 ORDER BY 1;
SELECT s."tenantId", round(sum(sp.amount)::numeric,2) AS payments_total
FROM sale_payments sp JOIN sales s ON s.id=sp."saleId" GROUP BY 1 ORDER BY 1;
SELECT "tenantId", round(sum(quantity)::numeric,3) AS on_hand, count(*) AS stock_rows FROM inventory GROUP BY 1 ORDER BY 1;
SELECT "tenantId", round(sum(quantity)::numeric,3) AS lot_qty FROM inventory_lots GROUP BY 1 ORDER BY 1;
SELECT je."tenantId", round(sum(jl.amount)::numeric,2) AS journal_amount_total
FROM journal_lines jl JOIN journal_entries je ON je.id=jl."journalEntryId" GROUP BY 1 ORDER BY 1;
SELECT "tenantId", round(sum("creditBalance")::numeric,2) AS ar, round(sum("walletBalance")::numeric,2) AS wallets
FROM customers GROUP BY 1 ORDER BY 1;

-- 3. Ledger and stock consistency
--    posted journals balance per entry (any row returned = failure)
SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl."journalEntryId"=je.id
WHERE je."isPosted" GROUP BY je.id
HAVING abs(sum(CASE WHEN jl."debitAccountId" IS NOT NULL AND jl."creditAccountId" IS NULL THEN jl.amount ELSE 0 END)
         - sum(CASE WHEN jl."creditAccountId" IS NOT NULL AND jl."debitAccountId" IS NULL THEN jl.amount ELSE 0 END)) > 0.005;

--    stock ledger: each stock row's on-hand equals its latest inventory_logs.quantityAfter (report mismatches by count only)
SELECT count(*) AS stock_ledger_mismatches FROM inventory i
JOIN LATERAL (SELECT l."quantityAfter" FROM inventory_logs l WHERE l."tenantId"=i."tenantId" AND l."variantId"=i."variantId"
              AND l."branchId"=i."branchId" ORDER BY l."createdAt" DESC, l.id DESC LIMIT 1) last ON true
WHERE abs(i.quantity - last."quantityAfter") > 0.0005;

-- 4. Foreign-key integrity: count orphans per relation (expect 0; the generator script emits one query per FK in schema.prisma)
SELECT count(*) AS orphan_sale_items FROM sale_items si LEFT JOIN sales s ON s.id=si."saleId" WHERE s.id IS NULL;

-- 5. Row fingerprints for unchanged tables (detects silent modification)
SELECT 'sales' AS t, md5(string_agg(md5(s::text), '' ORDER BY s.id)) FROM sales s
UNION ALL SELECT 'sale_items', md5(string_agg(md5(i::text), '' ORDER BY i.id)) FROM sale_items i
UNION ALL SELECT 'journal_lines', md5(string_agg(md5(l::text), '' ORDER BY l.id)) FROM journal_lines l;
```

* The fingerprint query (5) runs on tables a migration **must not** touch; their hashes must be identical before and after. For tables a migration *does* touch (e.g. decimal columns), compare values: every old integer equals the new number (`old::double precision = new`).
* The column names in this SQL follow `schema.prisma` and must be confirmed against the throwaway database before first use.
* Tenant-isolation suite (`security-tenant-isolation.e2e-spec.ts`) and the audit's cross-tenant sweep run after every migration.
* A backup/restore drill runs before the first migration of each phase: `pg_dump -Fc` → restore into a **second new container** → the integrity check above must match exactly.

---

## 1. Current state

### 1.1 Git

| Item | State |
|---|---|
| Current branch | `security/incident-2026-11`, 10 commits ahead of `main` |
| Working tree | clean except untracked `docs/full-system-audit-2026-11.md`, `docs/system-audit-2026-11.md`, `scripts/backup/` |
| Unmerged branch | `feature/pos-price-guard-decimal-qty`, 4 commits ahead of `main` (price guard, decimal quantities, idempotency, project skills) |
| Common base | both branches fork from `main` at `d8326a8` |
| Duplicate commit | "Fix stale auth login spec mock and dashboard list typing" exists on both (`2041cf4` / `9c76e16`) with identical content, so it merges cleanly |

### 1.2 Dry-run merge of `feature/pos-price-guard-decimal-qty` into the working branch

Done with `git merge-tree --write-tree` (in memory; the working tree was not touched).

* **Result: clean.** Exit 0, no textual conflicts. 9 files changed on both branches, all auto-merged: `jest.config.ts`, `auth.service.spec.ts`, `inventory.dto.ts`, `pos.module.ts`, `returns.module.ts`, `suppliers.module.ts`, `test/jest-e2e.config.ts`, `test/shims/nanoid.ts`, `dreams-dashboard.tsx`.
* **Semantic check: OK.** The security branch has 15 `@IsInt()` quantity validators on stock paths (returns, transfers, PO, GRN, supplier returns, warehouse). In the merged tree every one of them becomes decimal; the only integer quantities left are in non-grocery verticals (`clothing.dto.ts:149` fitting sessions, `spare-parts.module.ts:79` quotations, `workshop.module.ts:44` job cards). These match the three `Int` columns noted in the 2 Nov review and are tracked as F-15b below.
* **To verify after the real merge:** `ad04bf3` (validated request bodies) and `ee3bf20` (price guard) both edit `CreateSaleDto` / `SaleItemDto` in `pos.module.ts`. Git merged them, but both suites must pass on the merged code (§7).

### 1.3 Migrations

| Branch | Count | New migrations |
|---|---:|---|
| `main` | 44 | — |
| `security/incident-2026-11` | 45 | `20261103090000_hash_session_tokens` (data-only `UPDATE sessions`) |
| `feature/pos-price-guard-decimal-qty` | 46 | `20261101100000_decimal_quantities` (22 × `ALTER COLUMN … TYPE DOUBLE PRECISION`), `20261101120000_sale_client_request_id` (column + unique index) |
| merged | 47 | all three, in timestamp order |

**No migration conflicts:** timestamps are unique and ordered, only the feature branch edits `schema.prisma`, and the three migrations touch different tables. New migrations in this plan use timestamps **after `20261103090000`**.

**Existing migration risk (not caused by this work):** the history has no baseline (DB-6), so `prisma migrate deploy` can't build an empty database. Local test databases must be built with `prisma db push` from the *previous* schema, then the new migration SQL applied on top, and finally checked with `prisma migrate diff` against `schema.prisma`. This is the method used on 2 Nov, and it is described in §7.

---

## 2. Architecture notes that shape the fixes

* **Request pipeline:**
  - `TenantMiddleware`, then the global guards `JwtAuthGuard` → `TenantGuard` → `RolesGuard` → `PermissionsGuard` (+ `ThrottlerGuard`).
  - Then `BranchContextInterceptor`, the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`), `ResponseInterceptor` (now strips credential fields), and `HttpExceptionFilter` / `PrismaExceptionFilter`.
* **`PermissionsGuard` allows any endpoint without a decorator** (`permissions.guard.ts:21-23`). That is why 50 endpoints are open to every logged-in user (F-14). SUPER_ADMIN bypasses all permission checks (`:32`).
* **`TenantMiddleware` root cause (new, found while planning):**
  - It is mounted with `forRoutes('*')`, so inside it `req.path` is `/` and its skip list never matches (`tenant.middleware.ts:11-24`).
  - Its `.exclude()` list in `app.module.ts:147-156` uses `api/v1/...`, but routes are registered as `api/...` with URI versioning, so those never match either.
  - Result: every "public" endpoint and `/health` needs a tenant from the header or host. This is the root cause of F-33/PUB-03, UI-LOGIN-01 and the `platform-status` 400 on every page.
* **Validation gap pattern:** `@Query() q: PaginationDto & {...}` is erased to `Object` at runtime, so `ValidationPipe` skips it. That affects 16 list endpoints (F-19–F-21). Fix it once with real DTO classes.
* **Pagination helpers:** `getPaginationArgs` clamps but echoes the raw strings into `meta`; `buildOrderBy` exists (`shared/pagination.helper.ts:29`) but nothing calls it.
* **Roles:** `ensureSystemRoles()` (`roles/default-system-roles.ts`) runs on **every login** (`auth.service.ts:195`). It deletes and recreates the system roles' permissions without a transaction (N5 from 2 Nov), and it only grants permissions that exist in the `permissions` table. That is why F-06 starves Tenant Admin.
* **Money calculation:** `pricing.helper.ts` (totals, round-off at `:143`), `pos.module.ts:170` `createSale`, `returns.module.ts:103-116` refund maths, accounting posting through the outbox (`accounting-posting.service.ts`).
* **Tests:**
  - **API unit:** Jest, `src/**/*.spec.ts`, 34 suites / 221 tests; nanoid shim + Prisma mapping in `jest.config.ts`.
  - **API e2e:** `test/jest-e2e.config.ts` against real PostgreSQL (`DATABASE_URL`). Suites: `security-tenant-isolation` (25), `app.e2e-spec` (broken), and `pos-price-qty` (24, feature branch only).
  - **Web:** no tests.
  - **Local infrastructure proven on 3 Nov:** Podman PostgreSQL 16 + Redis 7, API via `ts-node`, web via `next dev` plus a header proxy, headless Chromium via patchright.

---

## 3. Phases and dependency matrix

### 3.1 Phases

| Phase | Name | Findings | Why this order |
|---|---|---|---|
| **P0** | Integrate | merge `feature/pos-price-guard-decimal-qty`; F-01, F-08, F-15 closed by the merge | every money fix builds on the price guard and decimal DTOs; avoids re-doing work on both branches |
| **P1** | Foundations | F-06 permissions seed, F-33a tenant-middleware matching, F-30 domain errors, shared list-query DTO (enables F-17–F-21), N5 role sync | later fixes depend on permissions existing, public routes working, and a proper 400 instead of 500 |
| **P2** | Money integrity | F-02 refunds, F-03 discount approval, F-04 expenses, F-28/F-26 journal rules, F-27 PO state machine | needs P0 (price guard, decimals) and P1 (permissions, errors) |
| **P3** | Access control | F-14 RBAC on 50 endpoints + cashier role, UI-WF-01 approvals inbox, F-23/F-24/F-25 auth hardening | needs F-06 so new decorators reference permissions that exist |
| **P4** | Data retention | F-09 customers, F-10 users, F-31 delete/validation items, DB-5 | needs P2 (balances are correct before blocking deletes on them) |
| **P5** | Availability & web | F-07 rate limiting, F-13 XSS + refresh cookie, F-22 server-side catalogue/stock screens, F-32 UI polish, MOB-02 | F-22 needs P1's list DTO and F-17/F-18 search; F-07 is independent but must be tested with the P5 web changes (fewer calls) |
| **P6** | Reporting & data model | F-16 balance sheet, F-29 negative-stock default, DB-1/DB-2/DB-3 indexes and uniques, F-15b vertical decimals | F-16 needs P2 (refund and expense postings correct) |
| **P7** | Ops & CI | F-11/F-12 credentials and secrets (repo part), F-33 seed/baseline/lint/e2e, test gaps (§8) | can run in parallel from P1; required before any release |

DB-4 (Float → Decimal money) and DB-6 (baseline migration) are planned as **separate projects** after P7. They are large, cross-cutting and need production data analysis that this plan isn't allowed to do.

### 3.2 Dependency matrix

"→" means the column must be done before the row.

| Finding | Depends on | Blocks |
|---|---|---|
| P0 merge (F-01, F-08, F-15) | — | F-02, F-03, F-04, F-16, F-22, F-29 |
| F-06 permissions | — | F-14, F-26, F-27, F-28, UI-WF-01, F-04 (approval permission) |
| F-33a tenant middleware | — | F-23 (resolve-email), PUB-03 health, UI-LOGIN-01, F-07 tests |
| F-30 domain errors | — | GRN-02 and every new validation in P2 |
| List-query DTO (P1) | — | F-17, F-18, F-19, F-20, F-21, F-05, F-22 |
| N5 role sync | F-06 | F-14 |
| F-02 refunds | P0, F-30 | F-16, F-09 |
| F-03 discount approval | P0, F-06, UI-WF-01 | — |
| F-04 expenses | F-06, F-30 | F-16 |
| F-26/F-28 journals | F-06 | F-16 |
| F-27 PO state machine | F-06, F-30 | — |
| F-14 RBAC | F-06, N5 | — |
| UI-WF-01 approvals inbox | F-06 | F-03 |
| F-23/F-24/F-25 auth | F-33a | — |
| F-09 customer delete | F-02 | — |
| F-10 user delete | — | — |
| F-07 rate limits | F-33a (trusted IP), F-22 (fewer calls) | — |
| F-13 XSS + cookie | — | — |
| F-22 server-side screens | P0, list DTO, F-17, F-18 | — |
| F-16 balance sheet | F-02, F-04, F-28 | — |
| F-29 negative stock default | P0 | — |
| DB-1/2/3 | — | — |
| F-11/F-12 | — | release |
| F-33 seed/baseline/lint/e2e | — | CI gate for every phase |

---

## 4. Per-finding plan

Risk level means the risk of the **change itself** breaking existing behaviour (Low / Medium / High). Severity is the audit severity.

### P0 — Integrate `feature/pos-price-guard-decimal-qty` (closes F-01, F-08, F-15)

| Field | Detail |
|---|---|
| Severity | Critical (F-01) · High (F-08, F-15) |
| Root cause | POS trusted client `unitPrice`/`costPrice`; no idempotency key; integer quantity columns and DTOs |
| Affected files | `pos/pos.module.ts`, `pos/pos-idempotency.helper.ts`, `pricing/pos-price-guard.helper.ts`, `inventory/*`, `returns/returns.module.ts`, `suppliers/*`, `prisma/schema.prisma`, web `pos-overlay.tsx`, `lib/pos-checkout-key.ts`, quantity forms (`parseQty`) |
| Proposed changes | local merge of the feature branch into a new local branch `remediation/2026-11` (off `security/incident-2026-11`); no code edits beyond conflict follow-ups |
| Database changes | `20261101100000_decimal_quantities` (22 columns INTEGER → DOUBLE PRECISION, lossless widening, table rewrite), `20261101120000_sale_client_request_id` |
| Required tests | both e2e suites together (`pos-price-qty` 24 + `security-tenant-isolation` 25); unit suite; audit probes POS-03, POS-04, POS-14, GRN-03, TR-06 re-run → PASS |
| Dependencies | none |
| Risk level | Medium (two sets of DTO edits in `pos.module.ts`) |
| Rollback | code: `git revert -m 1 <merge>` on the local branch (no history rewrite). Schema: the decimal migration is **forward-only** (narrowing would lose decimals); rollback = app-only, proven by T-BC (old code against the migrated schema). Needs approval (§0.4, item 1) |
| Acceptance | merged branch type-checks; all suites green; POS-03/04/14, GRN-03, TR-06 pass; migration verified on a copy of the pre-merge schema with `migrate diff` = no difference |

### F-06 — Missing permissions (8 permissions, ~60 endpoints)

| Field | Detail |
|---|---|
| Severity | High (functional blocker) |
| Root cause | `seed.ts` creates 35 permissions; `roles.service.ts:106 seedPermissions()` (13 resources × 5 actions) has no caller; no migration inserts the rest |
| Affected files | new `prisma/migrations/2026110312xxxx_seed_missing_permissions/migration.sql`; `prisma/seed.ts`; `roles/roles.service.ts` (remove the dead `seedPermissions` or reuse it); new `shared/security/permission-catalogue.ts` (single list); new CI spec |
| Proposed changes | 1) a `PERMISSION_CATALOGUE` constant = every `resource:action` used by `@RequirePermissions` / `@RequireAnyPermissions`; 2) an idempotent migration `INSERT … ON CONFLICT (resource, action) DO NOTHING` for all of them; 3) the seed uses the catalogue; 4) a unit spec that scans decorators and fails if any string is missing from the catalogue |
| Database changes | data-only insert into `permissions` (8+ rows). `ensureSystemRoles` then grants them to Tenant Admin on next login |
| Required tests | catalogue spec (decorators ⊆ catalogue); e2e: Tenant Admin can submit, approve and post a journal (PERM-01), pay a supplier (PERM-02), list returns |
| Dependencies | none |
| Risk level | Low for the insert. **Medium** in effect: Tenant Admin gains access it never had on fresh installs (intended) |
| Rollback | `DELETE FROM permissions WHERE (resource, action) IN (…new rows…)` (cascades `role_permissions`); code revert |
| Acceptance | `SELECT count(*) FROM permissions` ≥ catalogue size; PERM-01/02/03 pass; no decorator string missing from the catalogue |

### F-33a — Tenant middleware path matching (health, public endpoints)

| Field | Detail |
|---|---|
| Severity | Medium (part of F-33; causes PUB-03, UI-LOGIN-01, platform-status 400) |
| Root cause | the skip list tests `req.path`, which is `/` under `forRoutes('*')`; `.exclude()` uses `api/v1/...`, but routes are `api/...` + version |
| Affected files | `common/middleware/tenant.middleware.ts`, `app.module.ts:143-157` |
| Proposed changes | match on `req.originalUrl` without the query string, against one exported `PUBLIC_ROUTES` list, and remove the duplicate `.exclude()` list. Keep the `x-tenant-id`/host behaviour for everything else |
| Database changes | none |
| Required tests | unit: path matcher for each public route ± version prefix; e2e: `/api/v1/health` 200 without a header; `resolve-email`, `resolve/:sub`, `platform-status` reachable without a header; a protected route without a tenant still 400 |
| Dependencies | none |
| Risk level | Medium (touches every request) |
| Rollback | code revert |
| Acceptance | PUB-03 passes; the browser login page on a non-shop host resolves the workspace; no change for authenticated routes (security e2e green) |

### F-30 — Plain `Error` thrown in helpers → 500

| Field | Detail |
|---|---|
| Severity | Low (but a prerequisite for the P2 validations) |
| Root cause | 26 `throw new Error()` in helpers (warehouse ×7, procurement ×4, …) reach the HTTP layer unmapped |
| Affected files | new `common/errors/domain-error.ts`; `common/filters/http-exception.filter.ts`; `suppliers/procurement.helper.ts:20` and the other 25 sites |
| Proposed changes | a `DomainError(code, message, status=400)` class mapped by the filter; replace the 26 throws; keep messages |
| Database changes | none |
| Required tests | unit for each helper's error type; e2e GRN-02 → 400 with "Cannot receive beyond ordered qty" |
| Dependencies | none |
| Risk level | Low |
| Rollback | code revert |
| Acceptance | GRN-02 passes; `grep "throw new Error(" modules` = 0 outside tests/bootstrap |

### P1 list-query platform (enables F-05, F-17–F-21)

| Field | Detail |
|---|---|
| Severity | — (enabler) |
| Root cause | intersection-typed `@Query()` params skip validation; meta echoes raw strings; `buildOrderBy` unused; search not normalised |
| Affected files | `common/dto/pagination.dto.ts`, `shared/pagination.helper.ts`, new `shared/search.helper.ts`, 16 controllers listed in audit §6 |
| Proposed changes | `ListQueryDto` (page/limit as validated ints, search trimmed, sortOrder enum); per-entity subclasses (`ProductListQueryDto`, `InventoryQueryDto` with a boolean `lowStock` transform, `ExpenseQueryDto` with ISO dates …); `paginate()` returns numeric meta with the effective limit; `buildSearch(term, fields)` trims and escapes `\ % _`; `buildOrderBy(sortBy, order, allowed[], tieBreaker='id')` |
| Database changes | none |
| Required tests | unit for the helpers; contract e2e running the audit §4 matrix against every list endpoint |
| Dependencies | none |
| Risk level | Medium: `forbidNonWhitelisted` will reject query params the web sends today. Each DTO must be checked against the web calls (grep every `api.get('/<route>?`) before switching |
| Rollback | code revert per endpoint (DTOs adopted endpoint by endpoint, one commit each) |
| Acceptance | §4 matrix all ✅ for products, customers, suppliers, employees, inventory, expenses, sales, purchases, returns; no web screen loses a filter (manual check list in §7) |

### F-17 — Search whitespace and wildcards · F-18 — Inventory search by name · F-19 — Sorting · F-20 — Pagination meta · F-21 — Low stock · F-05 — Expense search/date

| Finding | Severity | Root cause | Proposed change (files) | Tests / acceptance |
|---|---|---|---|---|
| F-17 | Medium | `contains` with raw input | use `buildSearch()` in `products.service.ts:508`, `customers.module.ts`, `suppliers.module.ts`, `hr.module.ts:130`, `inventory.service.ts:150`, `pos.module.ts` product search | S-*-04/07/08 pass |
| F-18 | Medium | inventory search only on `variant.name`/`sku` | add `variant.product.name`, `variant.barcode`, `variant.product.barcode`, category name (`inventory.service.ts:150-157`) | S-INV-01–04, 09 pass |
| F-19 | Medium | `sortBy` ignored | `buildOrderBy` with per-entity whitelist + `id` tie-breaker in the 16 list services; 86 single-key `createdAt` orderings get `id` | O-* pass; paging stable under equal timestamps (new test inserts rows with the same `createdAt`) |
| F-20 | Low/Med | raw strings in meta, no 400 | `ListQueryDto` + `paginate()` numeric meta | P-PRD-03/04/05/07, P-CUS-01 pass |
| F-21 | Medium | `"true" === true` | `InventoryQueryDto.lowStock` boolean transform (`inventory.controller.ts:27`) | F-INV-01 passes |
| F-05 | Medium | no description search; date unvalidated | `ExpenseQueryDto`; `search` on description/category/reference (`accounting.module.ts` expenses list) | EXP-05/06 pass |

All six: **Database changes** none (F-18 optionally uses the trigram index in DB-2). **Dependencies:** P1 list platform. **Risk:** Low–Medium (result sets change, which is intended). **Rollback:** code revert per commit.

### N5 — `ensureSystemRoles` on every login

| Field | Detail |
|---|---|
| Severity | Medium (from the 2 Nov review) |
| Root cause | `deleteMany` + `createMany` of role permissions per login, outside a transaction; overwrites customisations |
| Affected files | `roles/default-system-roles.ts`, `auth/auth.service.ts:195` |
| Proposed changes | compute the diff and only insert missing / delete extra rows, inside `$transaction`; run it at tenant creation and from a versioned "role defaults" marker (`tenant.settings.roleDefaultsVersion`) instead of on every login |
| Database changes | none (a settings key) |
| Required tests | unit: diff logic; e2e: 20 concurrent logins never leave Cashier with 0 permissions; existing default-role spec |
| Dependencies | F-06 |
| Risk level | Medium |
| Rollback | code revert (the previous behaviour self-heals on login) |
| Acceptance | concurrent-login test green; role permission rows unchanged when nothing changed (no churn) |

### F-02 — Refund pricing and cumulative returns

| Field | Detail |
|---|---|
| Severity | Critical |
| Root cause | `returns.module.ts:103-116` prices refunds from `dto.items[].unitPrice`; the quantity check compares one request to the sold quantity, never to the sum of earlier returns |
| Affected files | `returns/returns.module.ts` (create, ReturnItemDto), new `returns/returns-pricing.helper.ts` + spec, `customers/customer-credit.service.ts` (credit-note refunds), web `components/returns/*` (stop sending prices as authoritative) |
| Proposed changes | 1) load the original `SaleItem` rows (lock the sale `FOR UPDATE`); 2) refund unit = line net price after the line discount and a pro-rata share of the bill discount; 3) `returnedQty` = sum of earlier non-rejected returns per sale line; reject when `returned + requested > sold`; 4) ignore client `unitPrice` (keep it in the DTO as optional for backward compatibility); 5) above a tenant value threshold, require manager role or an approval |
| Database changes | none required (compute from `return_items`). Optional performance index `return_items(saleItemId)` once lines carry `saleItemId` (DB-2) |
| Required tests | unit: pricing helper (line discount, bill discount share, decimal kg); e2e: RET-02 (client 99,999 → refund ≤ 1,150), RET-03 (cumulative), concurrent return race (2 parallel full returns → 1 succeeds), ledger revenue stays a credit balance (REP-05) |
| Dependencies | P0, F-30 |
| Risk level | Medium (refund amounts change for any flow that relied on client prices, e.g. exchanges) |
| Rollback | code revert; no schema change |
| Acceptance | RET-02, RET-03, REP-05 pass; exchange flow still balances (exchange e2e) |

### F-03 — Server-side bill discount approval

| Field | Detail |
|---|---|
| Severity | High |
| Root cause | `CreateSaleDto.discountAmount` (`pos.module.ts:121`) applied at `:252` with only a ≤ total check; the 10% rule lives only in the web (`DISCOUNT_APPROVAL_THRESHOLD_PCT`) |
| Affected files | `pos/pos.module.ts` (createSale), `workflow/*` (discount-request lookup), `tenants` POS settings (threshold), web `pos-overlay.tsx` (send `discountApprovalId`) |
| Proposed changes | accept an optional `discountApprovalId`; if the bill discount > tenant threshold (default 10%) and the acting cashier has no financial authority, require an APPROVED, unused, same-tenant discount request whose amount ≥ the discount; mark it consumed in the sale transaction |
| Database changes | possibly `workflow_tasks.consumedAt` / `consumedBySaleId` (nullable) |
| Required tests | e2e: POS-05 (649/650 without approval → 403/400); with approval → 201; approval reuse → rejected; manager role → allowed |
| Dependencies | P0, F-06, UI-WF-01 (someone must be able to approve) |
| Risk level | Medium (counter workflow changes for cashiers) |
| Rollback | code revert; the nullable columns can stay |
| Acceptance | POS-05 passes; UI-POS-02 behaviour unchanged |

### F-04 — Expense limits and approval

| Field | Detail |
|---|---|
| Severity | High |
| Root cause | `CreateExpenseDto` (`accounting.module.ts:117`) has no sign or upper bound; the POS cashier path (`cash:create`, added 3 Nov) has no cap |
| Affected files | `accounting/accounting.module.ts` (DTO, `createExpense` at `:834`), `shared/security/financial-authority.ts`, tenant settings |
| Proposed changes | `@Min(0.01)`, a global `@Max`; cashier cap (tenant setting, default e.g. LKR 5,000 per expense); above the cap → 403 "needs manager"; same rules for `UpdateExpenseDto` |
| Database changes | none (settings key) |
| Required tests | e2e: EXP-02 (cashier 9,999,999 → 403), EXP-03 (−50 → 400), manager above the cap → 201 |
| Dependencies | F-06, F-30 |
| Risk level | Low |
| Rollback | code revert |
| Acceptance | EXP-02/03 pass; POS expense screen still records small expenses |

### F-26 / F-28 — Journal rules (segregation of duties, same account, periods)

| Field | Detail |
|---|---|
| Severity | Medium |
| Root cause | `journal-entries.service.ts:390 approve()` doesn't compare approver and creator; no check that debit ≠ credit account or that the date falls in an open fiscal period |
| Affected files | `accounting/journal-entries.service.ts`, `accounting/financial-periods.service.ts`, `shared/workflow-bypass.helper.ts` |
| Proposed changes | approver ≠ creator (Tenant Admin may override only when the shop has a single admin, recorded in audit); reject lines where the debit account = credit account; reject dates outside an open period when periods exist, and warn (flag) when none exist |
| Database changes | none |
| Required tests | e2e: JE-04 → 400, JE-05 → 400 (or flagged), self-approval → 403 |
| Dependencies | F-06 |
| Risk level | Medium (single-admin shops need the override path) |
| Rollback | code revert |
| Acceptance | JE-04/05 pass; balanced journals still post (JE-02) |

### F-27 — Purchase order state machine

| Field | Detail |
|---|---|
| Severity | Medium |
| Root cause | `suppliers.module.ts:539 updatePOStatus` sets any enum value |
| Affected files | `suppliers/suppliers.module.ts`, `suppliers/procurement.helper.ts` (`canReceiveAgainstPo` at `:64`), new transition table + spec |
| Proposed changes | allowed transitions: DRAFT→PENDING_APPROVAL→CONFIRMED/SENT→(PARTIALLY_)RECEIVED via GRN only→CLOSED; CANCELLED is terminal; approval by a different user above a threshold |
| Database changes | none |
| Required tests | unit transition table; e2e PO-02/03/05 |
| Dependencies | F-06, F-30 |
| Risk level | Medium (existing POs in odd states; the migration of states is read-only, so report them, don't change them) |
| Rollback | code revert |
| Acceptance | PO-02/03/05 pass; GRN-01/05 still pass |

### F-14 — Unguarded endpoints and remaining cashier rights

| Field | Detail |
|---|---|
| Severity | High |
| Root cause | 50 endpoints without a permission decorator; default Cashier still has `sales:update` and `accounting:read` |
| Affected files | `dashboard/dashboard.module.ts:189+`, `products/products.module.ts` (categories `:102-115`, brands `:128-147`, `seed-variants` `:44`), `files/files.module.ts:136-164`, `roles/roles.module.ts:26,32`, `pos/pos.module.ts` (hold/coupon/voucher lookups), `branches/branches.module.ts:101,106`, `customers` phone lookup, `variants` barcode lookup; `roles/default-system-roles.ts` |
| Proposed changes | add the right `@RequirePermissions` to each (read endpoints the POS needs keep `sales:create`/`products:read`); default Cashier: drop `sales:update` (add a narrow `returns:create` for counter returns, approval stays with managers) and replace `accounting:read` with `expenses:read`; add a spec listing every route with no decorator, failing on new ones unless allow-listed (auth/me, notifications, …) |
| Database changes | 2 new permissions (`expenses:read`, `returns:approve` if chosen) via the F-06 catalogue migration |
| Required tests | e2e RBAC-01…10 with the **real default roles** for Cashier, Branch Manager, Accountant, Inventory Manager; POS UI smoke still works as cashier |
| Dependencies | F-06, N5 |
| Risk level | **High**: cashiers lose screens they use today (dashboard, P&L, return approval). Shop admins need notice (§6) |
| Rollback | code revert; role permissions self-restore via `ensureSystemRoles` |
| Acceptance | RBAC-01…10 pass; UI-POS-01 still passes; the "undecorated routes" spec green |

### UI-WF-01 — Approvals inbox hidden from admins

| Field | Detail |
|---|---|
| Severity | Medium |
| Root cause | `web/.../workflows/page.tsx:232-235` redirects Tenant/Super Admin; sidebar hides it (`sidebar.tsx:138`) |
| Affected files | `apps/web/src/app/(dashboard)/workflows/page.tsx`, `components/layout/sidebar.tsx`, `lib/workflow-access.ts` |
| Proposed changes | admins keep bypassing approval for **their own** actions but always see and act on the inbox |
| Database changes | none |
| Required tests | Playwright: admin sees a pending discount request and approves it; cashier completes the sale with the approval |
| Dependencies | F-06 |
| Risk level | Low |
| Rollback | revert web commit |
| Acceptance | owner + cashier shop can approve a discount end to end |

### F-23 / F-24 / F-25 — Auth hardening

| Finding | Root cause | Change (files) | DB | Tests / acceptance | Risk |
|---|---|---|---|---|---|
| F-23 enumeration | `tenants.module.ts:1363 resolve-email` returns workspaces for any email | return workspaces only together with a successful password check (move resolution into `/auth/login`), or always return a neutral response and email the workspace list | none | PUB-01: same response for known and unknown | Medium (login UX change) |
| F-24 lockout abuse | per-account lockout only (`auth.service.ts:99-139`) | lock per account + IP pair, exponential backoff, CAPTCHA hook after N failures; admin unlock | none | lockout by an attacker IP doesn't block the owner's IP | Low |
| F-25 throttles | no `@Throttle` on `reset-password`, `register` | add named throttles (after F-07 renames them) | none | PUB-04 → 429 | Low |

**Dependencies:** F-33a (public routes reachable), F-07 (named throttlers). **Rollback:** code revert.

### F-09 — Customer hard delete · F-10 — User self/hard delete · F-31 (delete items)

| Field | Detail |
|---|---|
| Severity | High (F-09) · Medium (F-10) · Low (F-31) |
| Root cause | `customers.module.ts:377-380` and `users.service.ts:226-229` call `delete`; `products.service.ts:947 removeCategory` nulls products; FK errors map to a POS message |
| Affected files | customers, users, products services; `common/filters/prisma-exception.filter.ts` (FK message); web customers/users pages (restore UI) |
| Proposed changes | customers & users: soft delete (`deletedAt`, `deletedBy`), excluded from lists and lookups; block a customer delete when `creditBalance ≠ 0`, `walletBalance ≠ 0` or loyalty > 0; block self-delete and deleting the last TENANT_ADMIN; `POST /customers/:id/restore`; categories: block delete while products reference them (or require a target category); FK filter message by model ("This record is used by …") |
| Database changes | additive migration: `customers.deletedAt TIMESTAMP NULL`, `customers.deletedBy TEXT NULL`, same for `users`. **Existing uniques `@@unique([tenantId, phone])` / `@@unique([tenantId, email])` stay unchanged** (no constraint drop on live data); creating a customer whose phone belongs to a soft-deleted one returns 409 with a "restore" option |
| Required tests | e2e D-CUS-01 (owing customer → 409), D-USR-01 (self → 403), D-CAT-01 (in use → 409), D-PRD-01 message, restore; every customer list/lookup excludes deleted (grep `customer.findMany/findFirst`) |
| Dependencies | F-02 (balances must be right before using them as a gate) |
| Risk level | Medium (every customer/user query needs the `deletedAt` filter; use a Prisma extension or helper to avoid misses) |
| Rollback | code revert; the nullable columns stay (old code ignores them). Rows soft-deleted under the new code remain in the table and stay visible to old code, so no data is lost in either direction |
| Acceptance | D-CUS-01, D-USR-01, D-CAT-01, D-PRD-01 pass; UI-02 shows correct AR |

**F-31 remaining items:** C-CUS-DUP (return 409 with the existing ID instead of a silent 201), U-PRD-01 (`@IsNotEmpty` on update DTOs), INV-ADJ-01 (`@Min(0)` for ADJUSTMENT targets), POS-RND-01 (tenant setting `roundToWhole` default true; accept exact unrounded payment), PUB-03 (done by F-33a). These are low risk, each with a unit/e2e test named after the audit ID.

### F-07 — Rate limiting

| Field | Detail |
|---|---|
| Severity | High |
| Root cause | `app.module.ts:76-80` hard-coded per-IP throttlers; `main.ts` lacks `trust proxy`; `@Throttle({ default })` in `auth.controller.ts:71,97,112` targets a non-existent throttler name |
| Affected files | `main.ts`, `app.module.ts`, new `common/guards/tenant-throttler.guard.ts`, `auth.controller.ts`, config (`THROTTLE_*` env already in `.env.example`) |
| Proposed changes | `app.set('trust proxy', 1)` (exactly one nginx hop); a throttler guard keyed by `userId` when authenticated, else client IP; limits from env (e.g. 30/s, 600/min per user); Redis storage (`@nest-lab/throttler-storage-redis` or similar) for multiple instances; strict named `auth` throttler for login/reset/register |
| Database changes | none (Redis) |
| Required tests | e2e: RL-01/RL-02 with `X-Forwarded-For` from 2 IPs and 2 users (independent budgets); login still throttled at 5/min; spoofed `X-Forwarded-For` without a trusted proxy is ignored |
| Dependencies | F-33a; measure together with F-22 (fewer calls) |
| Risk level | Medium (a misconfigured `trust proxy` either breaks limits or lets clients spoof IPs; it must match the nginx topology, which needs ops confirmation) |
| Rollback | code/env revert |
| Acceptance | RL-01/02 pass; no 429 during the 109-page UI sweep |

### F-13 — Stored XSS in print HTML; tokens in localStorage

| Field | Detail |
|---|---|
| Severity | High |
| Root cause | `document.write` templates interpolate names unescaped (`pos-overlay.tsx` 35, `products/page.tsx` label print 7, `view-return-modal.tsx` 3, others); access and refresh tokens in `localStorage` (`lib/api.ts:15-16`) |
| Affected files | new `apps/web/src/lib/html-escape.ts` (reuse from `grn-receipt-print.ts`), the 10 `document.write` files; API `auth.controller.ts` / `auth.service.ts` (refresh cookie); web `lib/api.ts` |
| Proposed changes | escape every interpolation (an `html` tagged-template helper that escapes by default); refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth/refresh`; access token kept in memory only; CSRF protection on the refresh endpoint (SameSite + origin check) |
| Database changes | none |
| Required tests | Vitest for the escape helper; Playwright: customer named `<img src=x onerror=…>` → receipt shows the text, no script runs; refresh-flow e2e |
| Dependencies | none (cookie part: confirm the nginx/same-site domain layout) |
| Risk level | Medium for escaping (output must look identical); **High** for the cookie move (auth flow change). Ship the cookie as its own sub-phase |
| Rollback | revert web commit; the cookie behind a flag (`AUTH_REFRESH_COOKIE=true`) |
| Acceptance | XSS-01 passes; a lint rule bans raw `${…}` in print templates |

### F-22 — Products and Inventory screens load 10,000 rows

| Field | Detail |
|---|---|
| Severity | High at scale |
| Root cause | `products/page.tsx:293` and `inventory-hub.tsx:502` fetch `limit=10000` and search client-side (`table-filter-bar.tsx`); 18 files request ≥ 500 rows |
| Affected files | the two pages, `components/table/client-side-table.tsx` (add a server mode), the P1 list endpoints |
| Proposed changes | server-paged table (debounced search → API, sort → `sortBy`, filters → query DTO); keep client mode for small lists (< 500 known rows) |
| Database changes | optional trigram index for name search (DB-2) |
| Required tests | Playwright on the 20k dataset: find "Maliban Cream Crackers 500g" (PERF-13); page payload < 200 KB; filters still work |
| Dependencies | P0, P1 list platform, F-17, F-18 |
| Risk level | Medium (most-used screens) |
| Rollback | revert the web commit (the API stays compatible) |
| Acceptance | PERF-13 passes; PERF-03/07 payloads < 0.5 MB |

### F-32 — UI polish · MOB-02 — mobile toolbars · UI-VERT-01

| Item | Change (files) | Tests / acceptance | Risk |
|---|---|---|---|
| Mojibake | re-encode `pos-overlay.tsx` (81 sequences) to UTF-8; add `.editorconfig` and a CI check for `Â`/`â€` | UI-POS-04 passes; grep = 0 | Low |
| Login feedback | show "Choose your shop" when no workspace resolves (`(auth)/login/page.tsx`) | UI-LOGIN-01 passes | Low |
| Accessibility | `aria-label` on icon buttons (255) and filter inputs (77), starting with shared components (`TableActionsRow`, filter bar, date picker) | sweep counts drop by > 80% | Low |
| Mobile toolbars | wrap or overflow-menu header actions on Products, Sales, Inventory, Purchases, POS header | MOB-02 passes | Low |
| Vertical pages | wrap vertical-only pages in `<ModuleGate>` (collections, fashion-colors, fitting-rooms, outfits, store-locations, vehicles, warranty, appointments, job-cards, services, quotations) | UI-VERT-01 passes | Low |
| Placeholder pages | hide `/advanced` "ERP Roadmap" from shop users; de-duplicate `/accounting/transactions` | manual | Low |

No DB changes. Rollback: revert web commits. Dependencies: none.

### F-16 — Balance sheet from the ledger

| Field | Detail |
|---|---|
| Severity | High |
| Root cause | `accounting.module.ts:1072-1115` mixes GL balances with sales/expense/PO/customer tables; COGS ignored |
| Affected files | `accounting/accounting.module.ts` (getBalanceSheet), `accounting/financial-reports.helper.ts` (+ spec), `accounting/accounting-posting.service.ts` if AR/AP postings are incomplete |
| Proposed changes | compute every section from posted journal lines up to `asOf`; current-period earnings = revenue − expenses (incl. COGS) from the ledger; return `balanced: boolean` and `difference` |
| Database changes | none (DB-2 journal-line indexes help performance) |
| Required tests | invariant e2e: after a scripted trading day (sales, credit sale, return, GRN, expense, supplier payment) assets = liabilities + equity and TB debits = credits |
| Dependencies | F-02, F-04, F-28 (correct postings first) |
| Risk level | Medium (figures shown to owners change) |
| Rollback | code revert |
| Acceptance | REP-02 passes; the invariant test is part of CI |

### F-29 — Negative stock default

| Field | Detail |
|---|---|
| Severity | Medium |
| Root cause | `inventory.service.ts:70-93` defaults `allowNegativeStock` to true |
| Affected files | `inventory/inventory.service.ts`, `tenants` registration defaults, shop profiles (`shared/shop-profiles`) |
| Proposed changes | default false for **new** GROCERY tenants; leave existing tenants' explicit settings unchanged; show the setting in POS settings |
| Database changes | none (settings) |
| Required tests | e2e: new grocery tenant → POS-15 behaves like POS-15b |
| Dependencies | P0 |
| Risk level | Low for new tenants. Changing existing tenants is **out of scope** (business decision) |
| Rollback | code revert |
| Acceptance | POS-15 passes for new grocery tenants |

### DB-1 / DB-2 / DB-3 — Uniques and indexes · F-15b vertical decimals

| Item | Change | Migration | Risk | Rollback |
|---|---|---|---|---|
| DB-1 | `Promotion.couponCode` → `@@unique([tenantId, couponCode])`; review the other 5 | drop the global unique index, create a tenant-scoped one (check for cross-tenant duplicates first, locally) | Medium | recreate the old index |
| DB-2 | indexes on `journal_lines(debitAccountId)`, `(creditAccountId)`, `returns(originalSaleId)`, `purchase_orders(supplierId)`, `sales(cashierId)`, `products(categoryId)`, `(brandId)`, + others from the audit list | `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (in a separate, non-transactional migration) | Low | `DROP INDEX` |
| DB-3 | tenant-leading indexes on the 5 tables | as above | Low | `DROP INDEX` |
| F-15b | quotation / job-card / fitting-session quantities → decimal | same pattern as `decimal_quantities` | Low | backup restore |

**Tests:** `migrate diff` = no difference; e2e suites green; `EXPLAIN` on journal-line report queries uses the index.

### F-11 / F-12 — Credentials and secrets (repository part only)

| Field | Detail |
|---|---|
| Severity | Critical |
| Root cause | `seed.ts:16,325,365` fixed passwords; `.env.production` tracked although ignored |
| Affected files | `prisma/seed.ts`, `.env.production` (index only), `.gitignore`, README/ops notes |
| Proposed changes | the seed reads passwords from env or generates random ones and prints them once; refuse to seed demo users when `NODE_ENV=production`; `git rm --cached .env.production` (local commit; the file stays on disk) |
| Database changes | none |
| Required tests | seed unit/smoke: no fixed password strings in `seed.ts`; `git ls-files .env.production` empty |
| Dependencies | none |
| Risk level | Low |
| Rollback | revert commit |
| Acceptance | as above. **Out of scope (needs the owner/ops, not allowed here):** rotating production secrets, checking production for the seeded accounts, purging git history |

### F-33 — Environment and developer setup

| Item | Change | Tests / acceptance |
|---|---|---|
| HTTPS redirect in dev | `middleware.ts:33-37` only when `NODE_ENV=production` | `next dev` works over HTTP without a proxy |
| Seed | fix `seed.ts:936` (`warehouseId`); make it idempotent end to end | `prisma db push` + seed on an empty DB succeeds |
| Baseline migration | **separate project** (DB-6): `migrate diff --from-empty` baseline + `migrate resolve --applied` on existing DBs, which needs production coordination | — |
| Lint | ESLint configs for api and web; `next lint` non-interactive | CI lint job passes (initially warnings only) |
| `app.e2e-spec.ts` | `/// <reference types="jest" />` | compiles and runs |

---

## 5. Database change summary (all local, all reviewed before any shared environment)

| Order | Migration (proposed name) | Type | Phase |
|---|---|---|---|
| 1 | `20261101100000_decimal_quantities` | existing (POS branch) | P0 |
| 2 | `20261101120000_sale_client_request_id` | existing (POS branch) | P0 |
| 3 | `20261103090000_hash_session_tokens` | existing (security branch) | — |
| 4 | `2026110410xxxx_permission_catalogue` | data insert | P1 |
| 5 | `2026110411xxxx_workflow_task_consumption` | nullable columns | P2 (F-03) |
| 6 | `2026110412xxxx_soft_delete_customers_users` | nullable columns + partial unique | P4 |
| 7 | `2026110413xxxx_tenant_scoped_coupon_code` | index swap | P6 |
| 8 | `2026110414xxxx_fk_and_tenant_indexes` | concurrent indexes | P6 |
| 9 | `2026110415xxxx_vertical_decimal_quantities` | type widening | P6 |

Each migration: idempotent SQL (`IF NOT EXISTS` / `ON CONFLICT`), a leading comment explaining why, verified on a **new** throwaway DB built from the previous schema and filled with realistic synthetic data, then `prisma migrate diff` = no difference. The safety verdict, data touched and rollback for each migration are in §0.2. Migrations #1, #3 and #9 need approval (§0.4).

**Migration safety plan (filled in for every migration before it is written):**
1. Schema inspection: affected models, columns, defaults, indexes, uniques and FKs (from `schema.prisma` and the migration history).
2. Data dependencies: which tables reference the changed ones; what code reads them.
3. Loss scenarios: type narrowing, `NOT NULL` without default, constraint additions that existing rows could violate, rewrites of existing values. Any "yes" → redesign or stop.
4. Upgrade test: integrity check (§0.5) → migrate → integrity check → compare; plus value-by-value comparison for changed columns.
5. Rollback test: (a) **app-only rollback**: run the previous code against the migrated schema with the same data and run its test suite; (b) schema rollback only if it is lossless; otherwise forward-only, stated explicitly and approved.
6. Backup drill: `pg_dump -Fc` → restore into a second new container → integrity check identical.

---

## 6. Rollback strategy (global)

1. **Code:** every finding is its own local commit on `remediation/2026-11`, so `git revert <sha>` rolls back one fix without touching others. Nothing leaves the machine.
2. **Database: rollback must never cost customer data.**
   - Additive migrations (columns, indexes, catalogue inserts) are left in place on rollback; the previous code must run against them, which is proven by the app-only rollback test in §5.
   - Type widenings (decimal) are **forward-only by design** and need approval (§0.4).
   - "Restore the backup" is **not** an acceptable rollback for live shops, because it would discard every sale made after the migration. Backups exist for disaster recovery only.
   - During this project, backups are taken of local test databases only, using the `scripts/backup/hexaone-db-backup.sh` pattern.
3. **Behaviour changes that users will feel** (F-14 cashier rights, F-03 discount approval, F-23 login, F-13 refresh cookie) sit behind tenant or env flags where practical, so a later release can switch them off without a revert.
4. **Release gate (later, outside this project):** production backup + restore test, `prisma migrate status`, shop-admin notice, staged rollout. Not part of this plan.

---

## 7. Test plan and infrastructure

**Local environment** (as used on 3 Nov, all throwaway):
* Podman `postgres:16-alpine` + `redis:7-alpine` (`--cgroups=disabled`, reached via the WSL VM IP).
* API: `ts-node` with the scratch env file. Web: `next dev` (+ the `x-forwarded-proto` proxy until F-33 removes the need).
* Headless Chromium via patchright; the audit probe scripts (`results.jsonl` IDs) are kept outside the repo and re-run after each phase.

**Gate after every phase (must be green before the next phase starts):**
1. `tsc --noEmit` for api and web.
2. API unit suite (221+ tests, growing).
3. API e2e: `security-tenant-isolation`, `pos-price-qty`, plus the new suites below, on a fresh DB.
4. Migration check, each time on a **new** container:
   - previous-schema DB + realistic synthetic data;
   - integrity check (§0.5) **before**;
   - apply the new SQL;
   - integrity check **after**, with only the expected differences allowed;
   - `migrate diff` empty;
   - app-only rollback test (**T-BC**: run the previous code's test suite against the migrated DB);
   - backup → restore → identical integrity output.

   Any unexpected difference stops the phase.
5. Re-run the audit probes for the phase's finding IDs; all must flip to PASS and no other ID may regress.
6. Browser smoke: login, POS sale as cashier, return, GRN, the 109-page sweep (from P5 on).

**New test suites to add:**

| Suite | Covers |
|---|---|
| `test/money-integrity.e2e-spec.ts` | F-02, F-03, F-04, REP-05, concurrent return race |
| `test/rbac-default-roles.e2e-spec.ts` | F-14 for all default roles; undecorated-route allow-list |
| `src/shared/security/permission-catalogue.spec.ts` | F-06 |
| `test/list-contract.e2e-spec.ts` | §4 matrix for every list endpoint |
| `test/accounting-invariants.e2e-spec.ts` | F-16, F-26, F-28 |
| `test/retention.e2e-spec.ts` | F-09, F-10, F-31 |
| `test/rate-limit.e2e-spec.ts` | F-07 |
| `apps/web` Vitest + Playwright | F-13, F-22, UI-WF-01, F-32, POS smoke |

---

## 8. Decisions

**Approved by the owner on 3 Nov 2026 ("approved all these"), recorded as follows:**

| # | Decision | Approved as |
|---|---|---|
| 1 | Merge approach | new local branch `remediation/2026-11` off `security/incident-2026-11`; local merge of `feature/pos-price-guard-decimal-qty` |
| 2 | Cashier rights (F-14) | default cashiers lose the dashboard, P&L and return approval |
| 3 | Thresholds | bill discount approval > 10%; cashier expense cap LKR 5,000; refunds > **LKR 5,000** need manager authority (owner brief of 5 Nov 2026; supersedes the LKR 10,000 the implementer had chosen on 3 Nov); adjustable tenant setting |
| 4 | Negative stock (F-29) | default OFF for **new** grocery tenants only |
| 5 | Login (F-23) | workspaces are not revealed before the password is checked |
| 6 | Refresh cookie (F-13) | **deferred** to a follow-up (needs the nginx/domain layout); escaping ships now |
| 7 | Production items | owner/ops only (secret rotation, seeded-account check, production `permissions` check) |
| 8a | Decimal migrations #1/#9 | forward-only, with the T-BC old-code compatibility test |
| 8b | Session-token migration #3 | data step **removed**; code change kept |
| 8c | Role changes for existing shops | no automatic changes on login (N5); a reviewed, logged per-tenant step with a before/after report |
| 8d | Test data | synthetic only |

The questions as originally asked are kept below for reference.

## 8.1 Items that needed a decision (original list)

1. **Merge approach:** merge `feature/pos-price-guard-decimal-qty` into a new local branch `remediation/2026-11` off `security/incident-2026-11` (recommended), or keep fixing on `security/incident-2026-11` directly?
2. **Cashier rights (F-14):** may default cashiers lose the dashboard, P&L view and return approval? Should counter returns stay possible without a manager below a value (e.g. LKR 2,000)?
3. **Thresholds:** bill discount approval (default 10%), cashier expense cap (proposed LKR 5,000), refund value needing a manager.
4. **Negative stock (F-29):** default OFF for new grocery tenants only (proposed), or also for existing ones?
5. **Login change (F-23):** OK to stop showing workspaces before the password is checked?
6. **Refresh cookie (F-13):** ship in this project or as a follow-up (it needs the nginx/domain layout confirmed)?
7. **Out-of-scope confirmations:** production secret rotation, checking production for seeded accounts, and the production `permissions` table check are for the owner/ops; this project won't touch production.
8. **Data-protection approvals (§0.4):** forward-only decimal migrations; the session-token rewrite (recommendation: remove its data step); automatic role changes on login (recommendation: N5 first, then a reviewed per-tenant step); synthetic versus anonymised test data.
