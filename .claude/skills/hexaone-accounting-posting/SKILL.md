---
name: hexaone-accounting-posting
description: Make a HexaOne business transaction post to the double-entry general ledger — sales, returns, GRN, supplier invoices/payments, expenses, cash wallet clearing, or any new money flow. Use whenever code moves money or stock value, or when touching apps/api/src/modules/accounting posting, outbox, account mappings or journal entries.
---

# Accounting posting (GL auto-post via outbox)

## Flow
```
domain service ($transaction commits)
  → eventEmitter.emit('<event>', { tenantId, <id> })
    → AccountingAutomationListener (@OnEvent, async)
      → AccountingOutboxService.enqueue(tenantId, sourceType, sourceId, payload)
        → (auto-post on) AccountingPostingService builds balanced JournalEntry + JournalLines
```
- Files: `accounting-automation.listener.ts`, `accounting-outbox.service.ts`, `accounting-posting.service.ts`, `account-mapping.helper.ts`, `journal-entries.helper.ts`, `accounting-settings.*`.
- Outbox row is unique on `(tenantId, sourceType, sourceId)` → enqueue is **idempotent**; already `POSTED` rows are skipped. Failed rows keep `lastError` and can be retried from the UI.
- `AccountingPreference.autoPostEnabled = false` → events queue only, posted manually.

## Existing source types / events
| sourceType | event |
|---|---|
| SALE | `pos.sale.completed` |
| SALE_RETURN | `accounting.return.completed` |
| GRN | `accounting.grn.posted` |
| SUPPLIER_PAYMENT | `accounting.supplier-payment.posted` |
| SUPPLIER_INVOICE | `accounting.supplier-invoice.posted` |
| SUPPLIER_RETURN | `accounting.supplier-return.posted` |
| CUSTOMER_CREDIT_PAYMENT | `accounting.customer-credit.payment` |
| EXPENSE | `accounting.expense.created` |
| CASH_WALLET_CLEAR | `cash.wallet.cleared` |
| REPAIR | `accounting.repair.delivered` |

## Adding a new posting
1. Add the literal to `OutboxSourceType`.
2. In the domain service, emit an event **after** the DB transaction commits (never inside it — a rollback would leave a phantom posting).
3. Add an `@OnEvent('...', { async: true })` handler in the listener that calls `outbox.enqueue(...)`; catch and log errors — never throw back into the business flow.
4. In `AccountingPostingService`, add a builder that loads the source by `{ id, tenantId }`, resolves accounts through account mappings (no hard-coded account IDs/codes), and produces lines where **Σdebit = Σcredit** (round2 each line, put rounding difference on a defined rounding account).
5. Respect closed financial periods (`financial-periods.helper.ts`) — post into an open period or fail with a clear error stored on the outbox row.
6. Reversals (void/return) post a reversing entry; never delete posted journals.
7. Add helper specs for the line builder (balanced, correct accounts, VAT split, rounding).

## Typical supermarket entries
- Cash sale: Dr Cash/Card clearing (per tender) · Cr Sales revenue · Cr VAT output; Dr COGS · Cr Inventory (at lot/avg cost).
- GRN: Dr Inventory · Dr VAT input · Cr GRN clearing / Accounts payable.
- Supplier payment: Dr AP · Cr Bank/Cash.
- Stock write-off (expired/damaged): Dr Inventory loss/shrinkage expense · Cr Inventory.

Verify with `scripts/verify-accounting-tenant.ts` (apps/api) and the trial balance report.
