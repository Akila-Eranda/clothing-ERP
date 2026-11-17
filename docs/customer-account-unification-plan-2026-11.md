# Customer unified account: current versus proposed accounting plan

**Date:** 13 Nov 2026
**Status:** read-only audit and proposal; technical implementation is not approved
**Scope:** customer wallet, customer credit, overpayments, top-ups, refunds, reversals and related GL postings

## 1. Owner decision and implementation gate

The business direction is approved: the customer should see one unified account balance. This document does **not**
authorize a schema migration, data migration, ledger rewrite, production database access, deployment or code change
that changes balances or journal mappings. Those actions require approval of this detailed technical plan, a
production-data reconciliation result and a rollback procedure.

## 2. Current implementation found

The current model still has two persisted customer balances:

- `Customer.walletBalance` and `Customer.creditBalance` are separate fields.
- `WalletTransaction` records top-ups, advances, sale debits, saved change and return credit.
- `CustomerCreditTransaction` records credit charges, payments and credit notes.
- POS wallet payments decrement `walletBalance`; `CUSTOMER_CREDIT` payments and unpaid partial sales increase
  `creditBalance` and create a `CHARGE`.
- Credit settlement first applies to open credit charges. Any payment above the outstanding amount is currently
  split into credit applied plus an `ADVANCE` in `walletBalance`.
- A wallet settlement decrements wallet and clears AR; it does not currently represent one unified persisted balance.

Primary evidence: `apps/api/prisma/schema.prisma` (`Customer`, `WalletTransaction`,
`CustomerCreditTransaction`, `SalePayment`), `apps/api/src/modules/pos/pos.module.ts`,
`apps/api/src/modules/customers/customer-credit.service.ts`, and
`apps/web/src/components/customers/view-customer-modal.tsx`.

## 3. Current accounting flow

| Event | Current operational effect | Current GL intent |
|---|---|---|
| Funded wallet top-up | Increments wallet balance and creates `TOPUP` | Dr actual cash/card/bank/QR tender; Cr customer wallet advances (2400) |
| Goodwill credit | Increments wallet balance and creates `GOODWILL_CREDIT` | Dr goodwill expense (5610/fallback); Cr customer wallet advances (2400) |
| Credit sale / unpaid partial sale | Increments credit balance and creates an open credit charge | Sale posting uses AR for the customer receivable |
| Wallet POS payment | Decrements wallet balance; sale tender is `WALLET` | Sale posting uses the wallet/deposit account as the tender source |
| Credit settlement by cash/card/bank/QR/cheque | Decrements credit balance; creates payment transaction and allocations | Dr the actual tender; Cr AR for allocated amount; excess credits the wallet liability |
| Credit settlement from wallet | Decrements both wallet and credit balances | Dr customer wallet advances; Cr AR |
| Return/refund/store credit | Return logic may refund original tender or create wallet return credit | Return journal reverses sale-side values; store credit is posted to the wallet liability |
| Cash/card/bank/QR/cheque POS tender | Recorded as `SalePayment` tender | Posted to its mapped clearing/cash/bank/cheque account; must not silently become wallet or credit |

The accounting automation uses an idempotent outbox, but the current customer balance model is not unified. Existing
wallet top-up and credit-payment postings are explicit in
`apps/api/src/modules/accounting/accounting-posting.service.ts` and
`apps/api/src/modules/accounting/accounting-automation.listener.ts`.

## 4. Proposed unified customer-account behavior (for approval)

Use one customer-account statement and one signed customer balance while retaining transaction subtypes and source
references. Do not infer the final sign convention from this proposal; Finance must approve it before implementation.
The implementation must define:

1. A canonical balance equation and display labels for credit available, customer deposit/advance and amount owed.
2. One append-only account transaction stream with immutable subtype, tender, source document, branch, actor,
   authorization and idempotency key.
3. Explicit allocation rows for a charge, settlement, refund, top-up, goodwill credit, excess payment and reversal.
4. A single atomic operation for every balance mutation plus its journal/outbox event.
5. Separate tender posting rules: cash, card, bank, QR and cheque continue to debit their mapped accounts.
6. No silent conversion between a customer deposit/advance and AR; a conversion must be an explicit, approved,
   auditable transaction type.
7. Query/API/UI compatibility during rollout so historical wallet and credit transactions remain distinguishable.

The customer UI can safely present a unified *read model* before ledger migration only if it is labelled as a derived
view, reconciles exactly to the two existing balances, and does not mutate either balance. It must not claim that the
technical ledger has already been unified.

## 5. Opening balances and historical reconciliation

Before any migration, run read-only tenant/branch-scoped reconciliation:

- Sum current `Customer.walletBalance` against all wallet transaction movements by type and reversal status.
- Sum current `Customer.creditBalance` against open/partial credit charges, payments, credit notes and return reversals.
- Match wallet liability and AR journal balances to the operational totals by tenant and account.
- Identify legacy wallet top-ups with no payment method, missing/out-of-scope journal entries, duplicate references,
  negative balances, orphaned customer transactions and customers deleted despite financial history.
- Produce an exception list; do not auto-correct exceptions.

The approved migration must specify how each customer's opening unified balance is calculated, how historical rows are
carried into the unified statement, and how any difference is posted. Historical journals should remain immutable;
any correction should be a separately approved adjustment or reversal with a reason and audit record.

## 6. Required schema/data migration (not approved)

Likely additive work includes a canonical customer-account transaction/entry model, source subtype and idempotency
constraints, allocation/reversal references, and a compatibility/read-model strategy. Exact columns, indexes,
backfill order and uniqueness rules must be designed from the reconciliation output. Existing wallet and credit
columns/tables must not be dropped or rewritten in place until all historical rows, reports and journals are proven
reconciled and a rollback window is approved.

No migration folder or production SQL is created by this audit.

## 7. AR, liability and revenue implications

- Credit sales and approved customer charges affect AR/receivable, not revenue a second time.
- Funded top-ups and customer advances create a customer deposit/liability; they are not sales revenue.
- Goodwill credits are an expense or approved equity/customer-promotion cost, not cash received and not sales revenue.
- Applying a deposit to an AR charge transfers the approved liability balance to AR; it does not create cash or revenue.
- Refunds reverse the original sale/tax/tender treatment or create an explicitly approved customer credit liability.
- Card, bank, QR and cheque clearing remain tender accounts; QR fees remain payment charges under the existing policy.
- Every journal must remain balanced, idempotent and tied to one source transaction; posted journals are reversed, never
  deleted.

## 8. Approval checklist before implementation

- [ ] Finance approves the signed balance equation and customer-facing terminology.
- [ ] Finance approves account mappings for AR, customer deposit/liability, goodwill and each tender.
- [ ] Owner approves opening-balance and historical-row reconciliation rules and exception handling.
- [ ] DBA approves additive schema/migration/backfill and rollback plan.
- [ ] Security/operations approve tenant/branch scope, permissions, idempotency and concurrency controls.
- [ ] Focused API, UI, database and balanced-journal regressions pass on synthetic data.
- [ ] Production read-only reconciliation passes; no production write is performed before the change window.
