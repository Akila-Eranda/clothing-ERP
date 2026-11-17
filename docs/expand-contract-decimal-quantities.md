# Decimal stock quantities: expand/contract migration (design and local test record)

**Date:** 3 Nov 2026 · **Branch:** `remediation/2026-11` (local only) · **Approval:** owner chose Option 1 (expand/contract) after the P0 stop. This approval covers designing and testing locally only; it is **not** approval for any production change.
**Migration:** `apps/api/prisma/migrations/20261103150000_decimal_quantities_expand/` (replaces the never-deployed `20261101100000_decimal_quantities`, which used `ALTER COLUMN … TYPE`).

## Why

`ALTER COLUMN … TYPE DOUBLE PRECISION` was tested on 3 Nov. Existing data converted exactly, but the **current production app corrupts the converted columns**:
- it stored 21 as `1.04e-322`;
- it silently lost increments;
- it truncated 2.5 to 2.

An app rollback, old and new API instances overlapping during a deploy, or any old script would damage stock.

## Design

For each of the 22 quantity columns (12 tables: inventory, lots, lot reservations, reservations, stock counts, transfers + transfer lots, returns, PO / PR / GRN / supplier-return lines):

| Part | Behaviour |
|---|---|
| Existing `INTEGER` column (e.g. `quantity`) | **unchanged**: same name, type and values. Old code keeps using it |
| New column `<col>Dec DOUBLE PRECISION NOT NULL DEFAULT 'NaN'` | backfilled from the integer in the same migration; new code reads and writes it |
| `schema.prisma` | `quantity Float @map("quantityDec")` (same field name, so **no TypeScript changes**) + `quantityLegacy Int @map("quantity")` |
| Trigger `hx_sync_qty_<table>` (BEFORE INSERT/UPDATE) | new code wrote the decimal → integer = `round(decimal)` (half away from zero); old code wrote the integer → decimal = integer; insert without a decimal (NaN default) → decimal = integer |
| Out of `INTEGER` range | `hx_qty_to_int()` raises an error; values never wrap |
| `hx_qty_sync_log` (new table) | when old code changes the integer of a row whose decimal held a fraction, that event (table, row, column, previous decimal, previous and new integer) is logged. Rounding during a rollback is **never silent** |
| 12 integer columns that had no default | `SET DEFAULT 0` (metadata only; no stored value changes; old code always sends them) so new code can omit the legacy field |

**Known behaviour (by design, logged):** if the old app changes a row that holds a fraction (e.g. sells 1 kg from a 4.625 kg lot), the result is rounded (4, not 3.625), because the old app only understands whole numbers. Every case is listed in `hx_qty_sync_log` for review and correction.

## Local test results (all on new throwaway containers, synthetic data only)

| # | Test | Result |
|---|---|---|
| 1 | Synthetic data in **all 156 tables** across 3 tenants, all FKs valid, edge values 0 / 1 / −3 / 2,147,483,647 | loaded, 0 errors |
| 2 | Backup (`pg_dump -Fc`) → restore into a second new container | ✅ 584/584 checks identical |
| 3 | Apply `sale_client_request_id` + `decimal_quantities_expand` | ✅ no errors |
| 4 | Integrity before vs after: row counts, row fingerprints of every table, values / sums / min / max of the 22 columns, financial totals, 243 FK orphan checks | ✅ **584/584 identical**, 0 orphans |
| 5 | Structure: 22 integer columns kept, 22 decimal columns `NOT NULL DEFAULT NaN`, 0 value mismatches, 12 triggers | ✅ |
| 6 | Schema parity (`prisma migrate diff` vs `schema.prisma`) | ✅ no difference |
| 7 | Data-layer matrix, **old** client (production schema) and **new** client: read, set, increment, decrement, insert on all 22 pairs; mixed old-after-new; overflow; negatives; audit-log entries | ✅ **414 pass, 0 fail** (4 template-collision skips covered by a separate inventory-insert test: 2/2 pass) |
| 8 | Concurrency on one lot: 50 parallel new +0.25; 50 parallel old +1; 25 old −1 + 25 new −1 in parallel | ✅ exact (112.5; 150; 50); no lost updates |
| 9 | Invariant after the matrix: every row has integer = round(decimal) | ✅ 0 drifted rows |
| 10 | **New app (real API)** on the migrated DB: decimal sale 0.375 kg, decimal return 0.125 kg, PO received 4.25 + 6.25 kg, 2.5 kg branch transfer, dated lots / FEFO | ✅ 7/7 flows, 0 drift after each step |
| 11 | Existing e2e suites on the migrated DB (`pos-price-qty` 24 + `security-tenant-isolation` 25) | ✅ 49/49, before and after the rollback cycle |
| 12 | **Rollback: unmodified production app (`main`, old Prisma client)** on the same DB after the new app wrote fractions: sale, return, PO receipt, transfer, adjustment | ✅ 6/6 flows, no errors, 0 drift; 1 logged rounding (`inventory_lots.quantity 4.625 → 4`) |
| 13 | Roll forward (new app again): decimal sale on rows the old app changed; reads the old app's stock | ✅ |
| 14 | Final: FK orphans, posted journals balanced, invoice uniqueness, sale total + change = payments | ✅ 0/243 orphans, 0 unbalanced, unique, 3/3 reconcile |
| 15 | API unit tests and type-check on the final schema | ✅ 248/248, `tsc` clean |

## Before any production use (not authorised yet)

1. Owner approval of a release plan; a production backup **and** a restore test; `prisma migrate status`.
2. The migration rewrites each of the 12 tables once (the backfill `UPDATE`); run it off-peak.
3. After release, `hx_qty_sync_log` should stay empty. Any rows mean an old app version or script wrote stock.
4. **Contract step** (separate, reviewed future release): only when no old app version, worker or script can run against the database. Drop the triggers and the integer columns, rename `<col>Dec` → `<col>`, and drop `hx_qty_sync_log` after it has been reviewed. Not part of this phase.
