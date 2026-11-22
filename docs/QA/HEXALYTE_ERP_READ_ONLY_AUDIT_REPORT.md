# HEXALYTE ERP — Read-Only Audit Report

Date: 2026-11-22 · Mode: read-only source review (no source, DB, env or production change). Only this report file was created.

**Production access:** none. An attempted SSH log check was blocked by the harness and not retried. Nothing below was verified against production data, logs or the live DB. "Confirmed" means confirmed from source code or from the one request the user pasted (a decoded JWT + a 403), not from runtime.

---

## 1. Executive Summary

Six issues investigated. The strongest finding is **a permission gap**: the grocery tenant admin's token (from the pasted request) carries 35 permissions and **lacks `accounting:update`** (and `accounting:delete`, `returns:*`, `settings:read`, `suppliers:update/delete`). Every bank-account edit and QR edit/image upload requires `accounting:update`, so they return 403. This is the likely root cause of QA-006 and part of QA-002.
The migration `20261104090000_permission_catalogue` deliberately grants nothing to existing roles, and the auto-sync on login was removed, so shops created before the catalogue never received the new permissions.

Second, **WhatsApp auth state is wiped on a plain timeout** (QA-004), and nginx publicly aliases the folder that holds the WhatsApp credentials (security risk).

| ID | Issue | Severity | Root cause | Confidence | Recommended priority |
|---|---|---|---|---|---|
| QA-001 | Customer Outstanding Payment | Medium | Payment logic itself is sound (locked, idempotent, FIFO). Defects are around it: cash-book running balance race, non-cash methods written to cash book, GL enqueue swallowed after commit, WALLET settle counted as cash inflow in cash-flow | Likely | P2 |
| QA-002 | QR Preview | Medium | (a) 403 on QR admin calls when role lacks `accounting:update`; (b) 60 s module-level cache of QR list never invalidated; (c) the exact 403 on `POST /payment-qr` cannot be explained from source (token has `accounting:create`) | Likely (a,b) / Unverified (c) | P1 |
| QA-003 | Day-End Cash Flow | Medium | "Day End · Clear All" block sits mid-page (between registers and bank accounts), not last; the Cash Flow report has no opening/closing balance or day-end concept, uses server timezone, counts non-cash and tender-with-change | Likely | P2 |
| QA-004 | WhatsApp Session Logout | High | Auto-reconnect after a timeout calls `startSocket({resetAuth:true})` which deletes valid creds; no auto-resume on boot; reconnect gives up after 3 tries | Confirmed (code) | P1 |
| QA-005 | Checkout Confirmation Error | Medium | Sale `$transaction` has no timeout/maxWait (Prisma default 5 s); several 403/400 business guards surface as generic toasts. Idempotency and double-submit handling are good | Likely / Unverified | P2 |
| QA-006 | Bank Edit | High | Tenant admin role missing `accounting:update` in existing shops; plus UI always sends all detail fields so legacy accounts with incomplete details cannot be renamed/disabled; optimistic-lock check not atomic | Confirmed (token) / Likely | P1 |
| SEC-1 | WhatsApp creds publicly aliased by nginx | Critical (if layout as configured) | `location /uploads/ { alias /var/www/uploads/; }` over `./storage`, which also holds `whatsapp-sessions/<tenantId>/` | Likely, unverified on server | P0 |

---

## 2. System Architecture Reviewed

- Monorepo: `apps/api` (NestJS + Prisma/Postgres, global guards Throttler → JWT → Tenant → Roles → Permissions in `app.module.ts:139-143`; `BranchContextInterceptor`), `apps/web` (Next.js; one build-time `NEXT_PUBLIC_API_URL`, all shops use `https://shop.clothing.api.hexalyte.com/api/v1`, `docker-compose.yml:104`), nginx + docker compose deploy, `./storage` volume for uploads.
- Accounting posts via event → outbox → GL (`accounting-automation.listener.ts`, `accounting-outbox.service.ts`).
- The cross-host request in the pasted report (grocery web → "clothing" API host) is by design, not a defect.

## 3. Investigation Scope

Source read: customers/customer-credit, pos (createSale), payment-qr, accounting (bank accounts, cash flow), cash-management (day-end), whatsapp, permissions/roles/auth, nginx, docker-compose, web POS/QR/cash-bank components. Not covered: full POS createSale body (3.5k lines), GL posting correctness, mobile/Electron clients, production DB state.

---

## 4. Issue-by-Issue Findings

### QA-001 Customer Outstanding Payment — Medium, Likely
Expected: balance = Σ charges − payments − credit notes; each payment reduces open charges oldest-due-first; cash lands in the cash book / GL once.
Actual: not verified at runtime. Source findings:

1. **Sound parts (no defect):** `receiveCreditPayment` (`customers/customer-credit.service.ts:331-704`) locks the customer row `FOR UPDATE`, requires `clientRequestId`, fingerprints the request (replay-safe, 409 on key reuse with different details), splits applied vs advance (`customer-credit.helper.ts` `splitCreditPayment`), allocates FIFO (`allocatePaymentFifo`) and updates `creditBalance` and charges in one transaction. Unit tests pass.
2. **Cash-book running balance race** — `service.ts:626-654`: `prev` is read from the last `cashBookEntry` of the tenant/branch, then a new row with `balanceAfter = prev + amount` is written. The lock is per customer only, so two concurrent payments from different customers (or a POS sale writing to the same book) read the same `prev` and write duplicate/incorrect `balanceAfter`. Medium, Likely.
3. **Non-cash methods in the cash book** — the same block runs for CARD, UPI, QR and BANK_TRANSFER (only WALLET and CHEQUE are excluded), debiting the *cash book* for money that never entered the drawer. Medium, Likely (intent unclear; if the "cash book" is meant to be all collections, ignore).
4. **GL enqueue is fire-and-forget after commit** — `service.ts:678-693` emits an event; the listener (`accounting-automation.listener.ts:154-175`) catches and only logs enqueue failures. A crash between commit and enqueue, or an enqueue error, leaves a customer payment with no journal and no retry. Medium, Confirmed (pattern); impact unverified.
5. **`dueDate` ordering** — `service.ts:486` `orderBy dueDate asc`, but the helper re-sorts, so harmless. Low.
6. **Customer-credit PAYMENT row has no branch/method column**; method is parsed back from the description text (`customerPaymentMethod`, `service.ts:~104`). Fragile for history/reporting. Low.
Reproduction: none attempted. Recommended: write the cash-book row with a locked running-balance strategy (or compute balance on read), restrict to cash/drawer methods or document, enqueue the outbox row **inside** the same transaction.

### QA-002 QR Preview — Medium, Likely
Expected: cashier sees a QR (static image or dynamic EMV with the exact amount) for the selected bank account.
Flow: `web/.../pos-qr-payment.tsx:44-130` → `GET /payment-qr/pos`, `POST /payment-qr/:id/render` → `payment-qr.module.ts:218-247` (`render`) + `payment-qr.helper.ts` (`buildDynamicEmvPayload`, CRC-16).

1. **Admin calls fail with 403 when the role lacks `accounting:update`** (create is `accounting:create`, update / image upload / image delete are `accounting:update`, `payment-qr.module.ts:270-306`). The pasted token has `accounting:create` but not `accounting:update`: creating a QR passes the permission guard, but the follow-up image upload (`POST /payment-qr/:id/image`, which the UI always calls right after create, `bank-accounts-card.tsx:127-135`) is refused. Confirmed from token + code.
2. **The exact pasted request (`POST /payment-qr`, 403) is NOT explained by source.** The token holds `accounting:create`, the tenant header matches the token, and a TENANT_ADMIN may switch branches. Remaining candidates: a body `branchId` not in the tenant ("Branch is not available in this tenant"), inactive branch in `x-branch-id`, an older deployed build, or a proxy-level 403. **Unverified; need the 403 response body.**
3. **Stale QR list** — `pos-qr-payment.tsx:46-52` caches `/payment-qr/pos` for 60 s in a module variable; after an admin adds/changes a QR or bank account the POS keeps the old list (and "No eligible QR image" message) until reload. Low/Medium, Confirmed.
4. **Render requires an active bank account** (`payment-qr.module.ts:219-222`); a QR whose bank was disabled returns 404 "QR code not found or inactive" and the UI shows a generic "Could not show the QR". Low.
5. DYNAMIC EMV generation validated by `payment-qr.helper.spec.ts` (passes).
Recommended: grant permission (see QA-006), return the 403 reason to the UI, bust `qrCache` after admin changes, show the specific render error.

### QA-003 Day-End Cash Flow — Medium, Likely (requirement interpreted)
Expected (per request): Day-End appears only at the end of the relevant Cash Flow section; opening/closing balances correct.

1. **Placement** — `components/accounting/cash-bank-hub.tsx:662-672` renders `cash-registers` → `walletSection` ("Cashier wallets", button "Day End · Clear All", `:482-505`) → `BankAccountsCard` → QR settings → other accounts. Day-End sits in the middle, not last. Likely the reported symptom.
2. **Cash Flow report has no day-end / opening / closing** — `accounting.module.ts:1038-1115` (`getCashFlow`) returns only daily inflow/outflow buckets and totals; no opening balance, closing balance or day-end line. The Day-End report lives separately in `cash-management.module.ts:644+` with `shared/day-end-report.helper.ts`.
3. **Calculation concerns in `getCashFlow`** (Likely, not run):
   - counts every non-credit sale payment, including CARD/QR/BANK and WALLET (not cash) and sales in any non-cancelled status;
   - likely counts the tendered amount, not net of change given (the day-end helper subtracts `changeDue`, this does not);
   - customer credit payments made from wallet are counted as inflow;
   - day buckets use `dayjs` in the **server** timezone; the day-end report uses the shop timezone (`shopDayBounds`);
   - tenant-wide, no branch filter.
Recommended: define the cash-flow section order in the UI, base the report on cash book/ledger with opening + closing, use shop timezone and branch filter.

### QA-004 WhatsApp Session Logout — High, Confirmed (code)
Expected: the Baileys session survives restarts, transient drops and timeouts; only a real logout needs a QR re-scan.
All in `whatsapp/whatsapp.service.ts`:

1. **Timeout wipes valid auth** — on `connection: close` with a timeout, `scheduleReconnect(..., { resetAuth: timedOut })` (`:~318-340`) → `startSocket` → `clearAuth(tenantId)` (`:~212-214`) deletes `whatsapp-sessions/<tenantId>`. A network blip / code 408 destroys the session and forces a new QR scan. **Most probable cause of "logged out unexpectedly".**
2. **No auto-resume after API restart** — there is no `onModuleInit`; state is an in-memory `Map`. After every deploy (this repo redeploys often) status is `disconnected` until someone clicks Connect (the code comment at `connect()` confirms creds survive on disk). `sendText` then throws "WhatsApp is not connected", so customer payment notifications silently fail.
3. **Reconnect budget** — `MAX_AUTO_RECONNECT = 3`; `reconnectAttempts` resets only on QR/open, so after three drops it sits in `error` forever.
4. **Replaced/conflict (440) is treated as a normal drop** and reconnected, so during overlapping old/new container windows two sockets can fight each other (unverified).
5. Auth dir fallback to `/tmp` when the configured folder is not writable (`ensureAuthDir`) — loses the session on container restart (compose sets `WHATSAPP_AUTH_DIR=/app/uploads/whatsapp-sessions` on a persisted volume, so normally fine).
6. **Security (SEC-1)** — the credentials live under `./storage`, which `nginx/nginx.clothing.conf` serves publicly at `/uploads/` (`alias /var/www/uploads/`, lines ~71, 150, 181, 266). Anyone who knows a tenant id (visible in headers/JWT) can request `/uploads/whatsapp-sessions/<tenantId>/creds.json` and hijack the WhatsApp account. File presence on the real server is unverified. **Critical if present.**
Test coverage: no spec for `whatsapp.service.ts` session logic.

### QA-005 Checkout Confirmation Error — Medium, Likely / Unverified
Expected: a sale is recorded exactly once, stock/payments/loyalty/cash consistent; failures are clear.
Good: client latch + idempotency key (`pos-overlay.tsx:2223-2224`, `pos-checkout-latch.test.ts`), server replay and unique-key race handling (`pos.module.ts:312-317, 1185-1195`), customer row lock, "already recorded — not charged twice" path (`pos-overlay.tsx:2412`).
Defects/risks:

1. **No transaction timeout** — `this.prisma.$transaction(async tx => ...)` at `pos.module.ts:761` passes no `timeout`/`maxWait`, and `PrismaService` sets no `transactionOptions`. Prisma's default is 5 s. A large basket (stock checks, FEFO, per-line writes, cash movements, loyalty) or a busy DB can abort with a transaction-closed error and a generic 500. Medium, Likely (not reproduced).
2. **Business guards return 403/400 with messages cashiers see as "error"**: manual discount for non-managers (`:~395-407`, 403), custom bill-only items (`:355-358`, 403), price above MRP needs a reason (UI handles it, `pos-overlay.tsx:2414`). Behavioural, working as designed; UX risk.
3. **Event after commit** — `pos.sale.completed` is emitted after the transaction (`:1204`); a failure there does not roll back the sale (GL handled by outbox elsewhere; not traced).
4. The recent commit (`b8663f6`) added the MRP-reason flow after the API already required it: sales failed until then (history evidence).
Recommended: set explicit `timeout`/`maxWait` for the sale transaction, log P2028, map errors to specific messages. Verify with production logs (not available).

### QA-006 Bank Edit — High, Confirmed (token) / Likely
Expected: an authorised user can change bank name, number, holder, branch, branch code, name, active flag.
Flow: `web/.../bank-accounts-card.tsx:101-149` → `PUT /accounting/bank-accounts/:id` (`accounting.module.ts:1668`, `@RequirePermissions('accounting:update')`) → `finance.service.ts:646-717`.

1. **Missing permission in existing shops (primary).** `PERMISSION_CATALOGUE` includes `accounting:update` (`shared/security/permission-catalogue.ts:10`) and new tenants get it (`default-system-roles.ts`, Tenant Admin = whole catalogue). But migration `20261104090000_permission_catalogue` states it grants **no** role anything and the login sync was removed; existing shops must be fixed by `scripts/review-system-roles.ts`. The pasted grocery TENANT_ADMIN token lists 35 permissions and has neither `accounting:update` nor `accounting:delete`, `returns:*`, `settings:read`, `suppliers:update`, `suppliers:delete`. So the guard throws 403 "Insufficient permissions. Required: [accounting:update]". Same root cause blocks QR edit/upload, journal approval, supplier payments, returns for those shops. Confirmed from the token; whether the review script was run for this tenant is unverified.
2. **UI always sends every detail field** (`bank-accounts-card.tsx:111-114`) so the API treats every save as "touching details" (`finance.service.ts` `touchesDetails`) and enforces full validation for CURRENT/SAVINGS. A legacy account with missing holder/branch cannot be renamed or disabled until all details are filled. Medium, Likely (code comment says this was meant to be allowed).
3. **Optimistic lock is not atomic** — `expectedUpdatedAt` is compared against a prior read, then `update({where:{id}})` runs without `updatedAt` in the WHERE; two saves in the same window both pass. Low/Medium.
4. **`bank-account.helper.ts` was reconstructed from its spec** (commit `3b6ddd7`), not recovered from history; behaviour may differ from the original. Medium risk, unverified.
5. Related references: bank transactions / cheques / QR codes reference the account by id, so edits do not rewrite history (good); duplicate check excludes self (`assertNoDuplicateBankAccount(tenantId, details, id)`).
Tests: `bank-account.helper.spec.ts` (pass), `bank-account-admin.e2e-spec.ts` (needs DB; not run).

---

## 5. Root Cause Analysis (shared)

| Shared cause | Affects |
|---|---|
| Existing tenants' Tenant Admin role never received catalogue permissions added after creation | QA-006, QA-002, journal/returns/supplier endpoints |
| State changes committed first, side-effects (GL enqueue, events) after, with errors swallowed | QA-001, QA-005 |
| In-memory/process state with destructive recovery paths | QA-004, QA-002 (cache) |
| Report logic not using shop timezone / branch scope / cash-only semantic | QA-003, QA-001 |

## 6. Evidence & Source References
All paths and line numbers are cited inline above (verified by reading the files in this session). Key: `apps/api/src/modules/whatsapp/whatsapp.service.ts`, `apps/api/src/modules/accounting/accounting.module.ts:1038,1648-1676`, `apps/api/src/modules/accounting/finance.service.ts:646`, `apps/api/src/modules/payment-qr/payment-qr.module.ts:218-313`, `apps/api/src/modules/customers/customer-credit.service.ts:331-704`, `apps/api/src/modules/pos/pos.module.ts:761,1185`, `apps/web/src/components/accounting/cash-bank-hub.tsx:482,662`, `apps/web/src/components/pos/pos-qr-payment.tsx:44`, `nginx/nginx.clothing.conf`, `apps/api/prisma/migrations/20261104090000_permission_catalogue/migration.sql`.

## 7. Severity & Priority Matrix
P0: SEC-1. P1: QA-006, QA-004, QA-002. P2: QA-001, QA-003, QA-005.

## 8. Business Impact
Shop owners cannot edit bank details or manage QR codes (QA-006/002) and may be unable to approve journals/returns; customer WhatsApp bills/payment notices stop (QA-004) and can leak a session (SEC-1); possible wrong cash-book balances and cash-flow figures (QA-001/003); occasional failed checkouts under load (QA-005).

## 9. Missing Test Coverage
- No unit/e2e tests for `WhatsappService` (reconnect, resetAuth, boot resume).
- No tests for `getCashFlow` (timezone, change, wallet, non-cash).
- No test for cash-book running balance under concurrency.
- No test that existing-tenant admin roles include every catalogue permission.
- No test for sale transaction timeout / large baskets.
- No web tests for `pos-qr-payment.tsx` (cache, stale code) or the bank edit form for legacy accounts.
- e2e suites (`bank-account-admin`, `pos-upgrade`, etc.) exist but need a DB; not run.

## 10. Recommended Fixes (not implemented)
1. Run `scripts/review-system-roles.ts` for existing tenants (reviewed per tenant) and add a startup/CI check that Tenant Admin has the full catalogue.
2. WhatsApp: never `resetAuth` on timeout (only on `loggedOut`/bad session); resume sessions from disk on boot; reset attempt counter on stable connect and back off; treat 440 specially.
3. nginx: deny `/uploads/whatsapp-sessions/` and `/uploads/.ssl-pending/` (or move them out of the served volume); verify on server and rotate WhatsApp sessions if exposed.
4. Enqueue GL outbox rows inside the business transaction (customer payment, sale).
5. Cash book: compute running balance atomically; restrict to drawer/cash methods.
6. Cash flow: shop timezone, branch scope, net of change, exclude wallet/non-cash, add opening/closing; reorder the Day-End block to the end.
7. Bank edit UI: send only changed fields; API: put `updatedAt` in the update WHERE.
8. POS: explicit `$transaction` timeout/maxWait and clearer error mapping; invalidate QR cache.

## 11. Regression Testing Plan
Re-run the 11 suites below; add e2e for admin role permissions per tenant; manual: edit bank (legacy + complete), upload QR, POS QR preview after admin change, WhatsApp restart/timeout/logout, partial credit payments (concurrent), cash flow vs day-end for a known day, 50-line checkout under load.

## 12. Dependencies & Risks
Baileys version and WhatsApp Web protocol changes; changing roles affects live permissions (needs review per tenant); timezone changes alter historical report buckets; cash-book changes touch reconciliation.

## 13. Production Verification Requirements
Needed and **not done**: the 403 response body of `POST /payment-qr`; API logs for 403/408/P2028; `role_permissions` for the grocery Tenant Admin; presence of `/storage/whatsapp-sessions` and an HTTP check of `/uploads/whatsapp-sessions/...`; deployed build/commit vs this source.

## 14. Final QA Assessment
Issues investigated: **6** (+1 security finding).
- Confirmed (source/token): QA-004, QA-006 (permission cause), SEC-1 config.
- Likely: QA-001 (secondary defects), QA-002 (a, b), QA-003, QA-005.
- Unverified: exact 403 on `POST /payment-qr`; runtime behaviour of everything (no production access).

Tests executed (existing, non-destructive, `npx jest --runInBand`, apps/api): payment-qr.helper, customer-credit (helper, payment, history, return), bank-account.helper, whatsapp (3 specs), pos-sale-guards, day-end-pdf → **11 suites passed, 85 tests passed, 0 failed**. No e2e/DB tests and no web tests were run.

Critical risks: SEC-1 (WhatsApp creds web-readable), missing permissions on existing tenants, WhatsApp credential wipe.
Recommended order: SEC-1 → role/permission review (QA-006/002) → WhatsApp fixes (QA-004) → outbox-in-transaction and cash book (QA-001) → checkout timeout (QA-005) → cash flow/day-end (QA-003).

Housekeeping: `scripts/*.py` contain a hard-coded root password (untracked); rotate it and keep these out of git. The pasted JWT should be treated as exposed.
