# HEXALYTE ERP — 7 Functional Issues: Investigation & Fix Report

Date: 2026-11-22. All work is local. **Nothing was deployed, committed or pushed; production, real credentials and production data were not used.** Verification is by unit tests against in-memory fakes, type-checks and (for the web) static/source tests. **No database and no browser/POS session were available, so no issue was reproduced end-to-end in a running system** — each section says exactly what was and was not proven.

## 1. Executive Summary

| ID | Issue | Root cause (verified against current code) | Classification |
|---|---|---|---|
| QA-001 | Customer outstanding payment | Core logic is sound (locked, idempotent, FIFO). Secondary defects remain (cash-book running-balance race, non-cash methods in cash book, GL enqueue after commit) — **not changed**, they need a business decision + DB tests | **INVESTIGATION REQUIRED** |
| QA-002 | QR preview | (a) POS cached the QR list for 60 s and never refreshed it after an admin change; (b) QR create/edit/image calls return 403 for roles lacking `accounting:update` (production role data) | **FIXED BUT NOT VERIFIED** (a). (b) **BLOCKED** |
| QA-003 | Day-End placement | "Day End · Clear All" block sat in the middle of the Cash & Bank page | **FIXED BUT NOT VERIFIED** (layout; cash-flow report maths unchanged) |
| QA-004 | WhatsApp session logout | A timeout reconnect **deleted the saved login**; sessions were not resumed after restart; only 3 reconnects | **FIXED BUT NOT VERIFIED** (no live WhatsApp) |
| QA-005 | Checkout confirmation error | Sale transaction had no timeout (Prisma default 5 s) → half-finished sale aborts under load | **FIXED BUT NOT VERIFIED** (not load-tested) |
| QA-006 | Bank edit | (a) Existing shops' Tenant Admin role lacks `accounting:update` → 403 (production data); (b) UI sent all details on every save → legacy accounts could not be renamed/disabled; (c) stale-edit check not atomic | (a) **BLOCKED**; (b)(c) fixed and unit-verified → overall **BLOCKED** (root cause is data), code part **FIXED & VERIFIED** |
| QA-007 | Custom / Demo items checkout | Not an inventory bug. Backend works for managers. A plain cashier is refused (403) by design (price guard does not cover bill-only lines); the screen's warning looked at only the first role and ignored the PIN-unlocked operator, so it misled and the failure surfaced only at the very end | **FIXED BUT NOT VERIFIED** (early, accurate feedback; business rule unchanged) |

Nothing is classified FIXED & VERIFIED for a whole issue, because none could be exercised against a running stack.

---

## 2. Root Cause per Issue

### QA-001 Customer outstanding payment — INVESTIGATION REQUIRED
Verified in `customers/customer-credit.service.ts`: `receiveCreditPayment` (`:331-704`) locks the customer row `FOR UPDATE`, requires `clientRequestId` + request fingerprint (replay-safe), splits applied vs advance, allocates FIFO (`allocatePaymentFifo`) and updates `creditBalance` and charge statuses in one transaction; POS credit charges are created in the sale transaction (`pos.module.ts:~1040`). Existing 7 customer-credit suites pass.
Open defects (confirmed in code, not fixed): (1) cash-book `balanceAfter` computed from the last row read without a tenant-level lock (`:626-654`) — two concurrent collections can write the same running balance; (2) CARD/QR/BANK/UPI collections also debit the *cash* book; (3) GL outbox enqueue happens after commit and failures are only logged (`accounting-automation.listener.ts:154-175`). **Why not fixed:** (1)/(2) change accounting semantics and need confirmation of intent; (3) needs transactional outbox work and DB-backed tests. These need a database to reproduce.

### QA-002 QR preview — FIXED BUT NOT VERIFIED / BLOCKED
(a) `pos-qr-payment.tsx` kept `qrCache` (60 s) in a module variable that nothing cleared: after an admin added/edited/disabled a QR or bank account the POS kept the old list (or "No eligible QR image configured"). (b) `PUT /payment-qr/:id`, `POST /payment-qr/:id/image` need `accounting:update`; the exposed grocery admin token lacked it (production role data — see QA-006). The original `POST /payment-qr` 403 is still unexplained by source (token had `accounting:create`); needs the response body/logs.

### QA-003 Day-End placement — FIXED BUT NOT VERIFIED
`cash-bank-hub.tsx` rendered: registers → **cashier wallets (Day End · Clear All)** → bank accounts → QR settings → other accounts. Day End is the last step of the day, so it was moved to the end. The separate cash-flow report (`accounting.module.ts:1038`) has no opening/closing/day-end concept, uses the server timezone and counts non-cash tenders; **left unchanged** (business definition needed).

### QA-004 WhatsApp session logout — FIXED BUT NOT VERIFIED
`whatsapp.service.ts`: on a timeout (408) the reconnect was scheduled with `resetAuth: timedOut`, and `startSocket` then ran `clearAuth()` — deleting valid credentials, forcing a new QR scan. There was also no start-up resume (in-memory sessions vanish on every deploy) and only 3 reconnect attempts.

### QA-005 Checkout confirmation error — FIXED BUT NOT VERIFIED
`pos.module.ts` `createSale` ran `this.prisma.$transaction(async tx => …)` with no `timeout`/`maxWait`; `PrismaService` sets no `transactionOptions`, so the 5 s default applied to a transaction that does stock checks, FEFO, payments, loyalty/wallet/credit and drawer writes. Double-submit and idempotency handling were verified good (latch, `clientRequestId`, replay on unique conflict).

### QA-006 Bank edit — BLOCKED (data) / code FIXED & VERIFIED
(a) `PUT /accounting/bank-accounts/:id` needs `accounting:update`. New shops get it (`default-system-roles.ts`), but migration `20261104090000_permission_catalogue` grants no existing role anything; the grocery admin token (login-time snapshot) lacked it. The fix is a reviewed per-tenant role update (`scripts/review-system-roles.ts … --add-only`) against production — **not performed**. (b) The form always sent all five bank details, so the API enforced full validation even for rename/disable. (c) `expectedUpdatedAt` was compared to a prior read but the write was unconditional.

### QA-007 Custom / Demo items — FIXED BUT NOT VERIFIED
Business rule (from code, not assumed): custom/demo lines are **non-stock, bill-only** — `SaleItemDto.isCustom` ("bill-only — no catalog / stock"), `SaleItem.variantId` nullable ("Null for POS bill-only / custom lines"), no stock check, no stock movement, no catalog price guard, cost taken from the client. Because the price guard cannot protect them, `createSale` allows them only for SUPER_ADMIN / TENANT_ADMIN / BRANCH_MANAGER (P-F1, `customLineNeedsManager`, 403 "Custom bill-only items require manager authorization").
Traced and confirmed: demo panel → cart (`custom-…` id, `stock: 999999`) → payload (`variantId` omitted, `isCustom: true`, `sku: "CUSTOM"`) → DTO validation → stock check excludes them → sale item with `variantId = null` → no stock deduction → invoice/payments as normal. Serial numbers: no serial requirement exists in the POS path. Defect: the screen warning used `user.role` (the **first** role only) and ignored the PIN-unlocked operator, whom the API treats as the acting cashier — so it warned the wrong people, and a cashier only learned at the end of the sale. Limitation (not changed): a custom line cannot be returned/exchanged (`ReturnItemDto.variantId` is required).

---

## 3. Files Modified / Added (this phase)

**API**
- `apps/api/src/modules/pos/pos.module.ts` — explicit transaction limits (`SALE_TX_MAX_WAIT_MS` 10 s, `SALE_TX_TIMEOUT_MS` 30 s) on the sale transaction (QA-005)
- `apps/api/src/modules/accounting/finance.service.ts` — atomic optimistic-lock update in `updateBankAccount` (QA-006)
- `apps/api/src/modules/whatsapp/whatsapp.service.ts` — no auth wipe on timeout, exponential back-off, resume saved sessions on boot (QA-004)
- `apps/api/src/modules/whatsapp/whatsapp-reconnect.helper.ts` (new)

**Web**
- `apps/web/src/components/pos/pos-overlay.tsx` — accurate acting-operator check for bill-only items, pre-checkout guard (QA-007)
- `apps/web/src/lib/pos-custom-items.ts` (new)
- `apps/web/src/lib/pos-qr-cache.ts` (new); `components/pos/pos-qr-payment.tsx`, `components/settings/payment-qr-settings-tab.tsx`, `components/settings/bank-accounts-card.tsx` — cache invalidation (QA-002); bank form sends/validates only changed details (QA-006)
- `apps/web/src/lib/bank-account.ts` — `changedBankDetails`
- `apps/web/src/components/accounting/cash-bank-hub.tsx` — Day End section last (QA-003)

**Tests added**
- API: `pos/pos-custom-items.spec.ts` (5), `whatsapp/whatsapp-reconnect.helper.spec.ts` (5), `accounting/bank-account-update.service.spec.ts` (6)
- Web: `lib/pos-custom-items.test.ts` (6), `lib/pos-qr-cache.test.ts` (3), `lib/cash-bank-hub-order.test.ts` (2), +1 in `lib/bank-account.test.ts`

(Phase 1–2 security changes, `docs/QA/*` reports and the user's pre-existing uncommitted edits are separate from this list.)

## 4. Fix Implementation Details
- **QA-005:** `$transaction(fn, { maxWait: 10000, timeout: 30000 })`. Only the allowed duration changed; ordering, locking, idempotency and rollback are untouched.
- **QA-004:** `shouldResetAuth()` is always false for transient drops (only a phone-side logout, handled earlier, clears credentials); `reconnectDelayMs` = 3 s·2ⁿ capped at 60 s (timeouts 5 s·2ⁿ); `MAX_AUTO_RECONNECT` 3 → 8; `onApplicationBootstrap` resumes tenants whose folder holds a **paired** `creds.json` (has `me`), one at a time with a 2 s gap, skipped in test mode or if `WHATSAPP_AUTO_RESUME=false`. Nothing is sent to anyone.
- **QA-006:** API — `updateMany({ where: { id, tenantId, updatedAt: <loaded> } })`, `count !== 1` ⇒ 409 and no audit row. Web — `changedBankDetails` ⇒ only changed fields are validated/sent; unchanged-details saves (rename/disable) send none. Create flow and the API's full-rules enforcement when any detail changes are unchanged.
- **QA-007:** `canSellBillOnlyItems({pinCashierRole, tokenRoles, userRole})` mirrors the API roles; PIN operator decides when active, otherwise any token role qualifies; no info ⇒ no permission. Used for the add-to-cart warning and a **pre-checkout block** with a clear message. The API check is unchanged and remains the authority (inventory validation for stock products is untouched; reload lines exempt as before).
- **QA-002:** shared `posQrCache` with `invalidatePosQrCache()` called after QR/bank-account saves, default change and every settings reload.
- **QA-003:** `{walletSection}` moved to the end of the section list (rendered once).

## 5. Before / After
| Issue | Before | After |
|---|---|---|
| QA-007 | Cashier adds Demo item, gets a generic warning (or none for PIN users), checkout fails with 403 at the end | Accurate warning on add; checkout stopped immediately with "needs a manager… unlock with a manager PIN"; managers unchanged |
| QA-005 | 5 s transaction limit | 30 s limit, 10 s wait for a connection |
| QA-004 | 408 ⇒ credentials deleted ⇒ QR re-scan; restart ⇒ disconnected until clicked | credentials kept; back-off up to 8 tries; paired sessions resume after restart |
| QA-006 | Rename of a legacy account blocked; two simultaneous saves both succeed | Rename/disable allowed; second simultaneous save gets 409 |
| QA-002 | Stale QR list ≤ 60 s after admin change | List re-read after any admin change |
| QA-003 | Day End in the middle of the page | Day End last |

## 6. Tests Executed (actual results)
- API (`npx jest --runInBand` over customers, pos, payment-qr, accounting, cash-management, whatsapp, roles, returns, pricing, shared): **81 suites, 600 tests passed, 0 failed**.
- Web (`node --test "src/lib/**/*.test.ts"`): **135 tests passed, 0 failed**.
- `tsc --noEmit`: **api exit 0, web exit 0** (0 errors).
- **Not executed:** database-backed e2e suites (need Postgres), a live WhatsApp connection, a browser/POS session, any production check.

## 7. Regression Results (requested areas)
| Area | Evidence | Result |
|---|---|---|
| Customer credit sales, partial/full payments, outstanding | customer-credit helper/payment/history/return specs, pos-sale-guards (credit/wallet) | pass (unit, fakes) |
| QR creation/edit/preview | payment-qr helper (EMV/CRC) spec, qr cache test | pass; UI not run |
| Cash/bank transactions, day-end maths | finance-transfer, day-end helper/pdf, cash-register helpers | pass |
| Day-end placement | source-order test | pass |
| WhatsApp reconnect/restart | reconnect helper + notification specs | pass; live not run |
| Normal checkout, discounts, taxes, price guard, idempotency | pos-sale-guards, pricing, pos-* helper specs | pass |
| Custom/demo checkout | pos-custom-items spec (admin OK, cashier 403, no stock movement, mixed cart still stock-checked, catalog id not smuggled in as custom) | pass |
| Cash/bank/QR payment lines, invoice generation | pos payment-line + numbering stub in guards spec | pass (stubbed numbering) |
| Bank account updates | bank-account-update spec + helper spec | pass |
| Role permissions | default-system-roles, permission-catalogue, pos permission metadata | pass |
| Multi-tenant isolation | bank update spec (other tenant ⇒ 404); no tenant-query code changed | pass (unit); e2e tenant suites not run |

## 8. Remaining Risks
1. **Production role data:** grocery (and any pre-2026-11 tenant) admins likely lack `accounting:update/delete`, `returns:*`, `settings:read`, `suppliers:update/delete` → bank/QR edits stay 403 until the role review is applied.
2. The original `POST /payment-qr` 403 is unexplained; needs the response body/logs.
3. QA-001 secondary defects (cash-book race, non-cash in cash book, post-commit GL enqueue) remain.
4. Cash-flow report accuracy (timezone, non-cash tenders, no opening/closing) unchanged.
5. WhatsApp resume contacts WhatsApp at boot (intended); behaviour with two API instances unverified (set `WHATSAPP_AUTO_RESUME=false` on the second). Messages sent while disconnected are not queued.
6. 30 s transaction limit raises how long a slow sale holds row locks (customer/stock) — monitor; it fixes aborts, not slowness.
7. Custom lines cannot be returned/exchanged; cost is client-supplied on custom lines (bill-only by design).
8. Web unit tests cover helpers/source order, not rendered components.

## 9. Production Deployment Requirements (not performed)
- Deploy API + web builds together (web guard and API are independent but ship as one change). No DB migration. No new env var required; optional `WHATSAPP_AUTO_RESUME=false`.
- **Role review (QA-006):** per affected tenant, dry-run then apply `scripts/review-system-roles.ts --tenant <id>` / `--apply --confirm <id> --actor "<name>" --add-only`, with backup; then verify an admin can edit a bank account and upload a QR.
- WhatsApp: after deploy, confirm sessions resume (logs "Resuming N saved WhatsApp session(s)") and that session storage follows the private-path plan in `PRODUCTION_SECURITY_READINESS_REPORT.md`.
- Smoke test after deploy: cashier demo-item (expect early block), manager demo-item sale, normal stock sale, bank rename on a legacy account, QR add → POS shows it without reload, API logs for `Transaction already closed` (should be 0).
- Rollback: revert the commit; no data changes were made by this code.

## 10. Safety Statement
No production connection, no real credentials, no production data, no secrets printed, no deployment, no commit/push. The 25 `.py` and other script edits belong to the earlier security phases.
