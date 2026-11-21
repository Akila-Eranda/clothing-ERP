# Wave 1 accounting proposals — 14 Nov 2026

Status: proposals for review only. No accounting policy, schema, migration, or database was changed by this document.
No database-backed journal reconciliation was run in this continuation.

## 1. Saved-change wallet journal

### Current implementation evidence

- POS checkout validates the shop opt-in, configured bounds, customer selection, explicit consent, and cash-funded change in `apps/api/src/modules/pos/pos.module.ts:625-643`.
- The sale transaction adjusts the customer wallet and writes a `CHANGE_SAVED` wallet transaction keyed to the sale (`pos.module.ts:926-970`).
- Cash/day-end calculations subtract saved change from cash physically retained (`pos.module.ts:1423, 2482-2489`).
- Sale posting debits actual tenders, credits the customer wallet liability for saved change, and credits net revenue/tax (`apps/api/src/modules/accounting/accounting-posting.service.ts:417-491`).

### Proposal

Keep the existing economic treatment: for a hypothetical LKR 129 sale paid with LKR 200 cash where the customer consents to saving LKR 71, debit cash LKR 200, credit sale revenue/tax for the LKR 129 bill, and credit the mapped customer-wallet liability LKR 71. The saved amount must not be counted as cash change handed back or as additional revenue.

Before calling this fully reconciled, verify the posted journal against the POS sale, wallet transaction, cash movement and day-end report in the approved isolated database, including wallet redemption/refund and auto-post-disabled/retry paths. The current service unit tests are not database journal evidence. No new journal source type appears necessary because the saved-change liability is included in the SALE posting.

### Approval / blocker

Confirm with Finance that the existing mapped wallet liability account is the approved liability treatment for saved change, and that sale-level posting is the intended journal boundary. Do not create a second journal for `CHANGE_SAVED` unless Finance explicitly rejects that treatment; doing so could double-post the same credit.

## 2. Supplier findings S-F1 / S-F2 / S-F9 — duplicate-posting safeguards

The handoff identifies these as double-posting proposals but does not include the full original S-F1 and S-F2 finding statements. This section therefore proposes shared technical safeguards without asserting that the findings have the same trigger or changing their business meaning.

### Current implementation evidence

- Outbox enqueue upserts by `(tenantId, sourceType, sourceId)` and skips already-posted events (`apps/api/src/modules/accounting/accounting-outbox.service.ts:40-92`).
- `processOne` uses a conditional `PENDING`/`FAILED` → `PROCESSING` update and requires exactly one row to claim the event (`accounting-outbox.service.ts:146-171`).
- Journal posting first checks for a non-void journal with the same tenant and source reference (`apps/api/src/modules/accounting/accounting-posting.service.ts:193-218`).
- The `JournalEntry` schema has nullable `referenceType` and `referenceId`; the model excerpt has no uniqueness declaration for those fields (`apps/api/prisma/schema.prisma:3040-3050`).
- These application checks reduce duplicate risk, but the existence lookup followed by journal creation is not itself a database uniqueness guarantee. The outbox claim protects a single event ID, not necessarily duplicate outbox rows or direct/replayed posting calls.

### Proposal

1. Keep the existing atomic outbox claim and retry-state behavior; do not make `PROCESSING` events immediately reclaimable without an approved lease/recovery rule.
2. Before any schema change, run a read-only duplicate-reference audit by tenant, source type and source ID; classify legitimate reversals, manual journals and historical duplicates.
3. If Finance confirms one active generated journal per source reference, add a database-enforced uniqueness rule for generated postings, with an explicit void/reversal policy. Handle unique-conflict races by returning the already-committed journal only after verifying tenant and source reference.
4. Add concurrency tests that race duplicate outbox enqueue, `processOne`, retry, and direct posting; assert one non-void journal and preserve legitimate reversal/retry behavior.

### Approval / blocker

The precise S-F1/S-F2 trigger descriptions and whether a database uniqueness constraint is acceptable require confirmation. Any schema or migration proposal must be separately reviewed and approved; no migration is included or executed here.

## 3. Supplier-return cost and journal proposal

### Current implementation evidence

- Posting a supplier return atomically claims DRAFT → POSTED, validates returnable quantities, moves stock and computes supplier credit as `quantity * item.unitCost` (`apps/api/src/modules/suppliers/procurement.service.ts:964-1006`).
- The accounting listener enqueues the posted supplier return after the domain event (`apps/api/src/modules/accounting/accounting-automation.listener.ts:83-95`).
- The current GL builder debits AP and credits inventory accounts using each return line's quantity multiplied by its `unitCost` (`apps/api/src/modules/accounting/accounting-posting.service.ts:871-935`).

### Proposal

Keep the current unit-cost-based credit as the observed behavior; do not substitute lot cost, weighted-average cost, or another valuation basis without Finance approval. Reconcile return lines to their source GRN/PO, received lot, supplier debit note/credit and inventory movement. Add database-backed tests for partial returns, multiple returns against one receipt, free goods/discounted lines, changed cost snapshots and idempotent retry, checking that the supplier credit and inventory reduction use the same approved basis.

If Finance chooses a different valuation basis, specify separately how supplier credit, inventory valuation, COGS/variance, free quantity and purchase discounts are treated. Do not silently change the current calculation.

### Approval / blocker

Finance must approve the cost basis and the treatment of free/discounted quantities before any accounting or valuation change. This document proposes verification, not a policy change.

## Verification state

- No migrations or accounting-policy changes were executed.
- Local unit evidence in the readiness tracker is not a substitute for isolated-database journal reconciliation.
- The isolated database credentials were unavailable in this continuation; live journal verification remains blocked.
