# HexaOne — Step 1C: pre-browser readiness and impact audit (14 Nov 2026)

**Branch:** `remediation/2026-11` + uncommitted work. **Nothing committed, staged, pushed or deployed.**
**Scope of this step:** review, verification and preparation. No existing tenant record was read or changed; `fashionerp_db`,
`fashionerp` and production were never contacted. Isolated environment only (PostgreSQL `127.0.0.1:5434` / `hexa_e2e_wave1` /
non-superuser `hexa_e2e`, Redis `127.0.0.1:6390`; the runner guard printed
`database=hexa_e2e_wave1, role=hexa_e2e, superuser=false, tables=162, migrations=60 successful/0 incomplete, Redis=PONG`
before every run). Wallet, Customer Credit, AR and liability ledgers remain separate; no accounting mapping changed.
**Audience:** owner (decisions), engineering (next steps), DBA (replica audit).

**Result in one line:** Step 1B is implemented as described and verified; **no browser test has started** because three
prerequisites are open (owner confirmation, the replica audit run, and the Branch Manager discount policy). Four new findings
need owner decisions. **Recommendation: NO-GO for release; GO to prepare the browser phase once the prerequisites below are met.**

---

## 1. Implementation review

### 1.1 The six decisions, checked against what the owner wrote

| # | Decision (as proposed) | Implemented as described? | Evidence | Gap / note |
|---|---|---|---|---|
| 1 | Cashier receives stock at existing cost; cannot edit cost/price/MRP; manager PIN above the cash limit; approval must not grant cost editing; PO receive preserved | **Yes** | `exchange-loyalty-topup` (approval flow, edit refused with and without approval, unchanged cost allowed, no-cost product refused, authorised role may edit), `stock-supplier-security-wave1` (foreign supplier → 404 first), `grn-line-cost.test.ts` (4) | Sending the **unchanged** cost is accepted (not an edit). The panel's default moved from "last buying price" to "catalogue cost" (see risk R4) |
| 2 | Branch Manager gets `sales:create`; no unrestricted discount; no invented threshold; policy left unresolved | **Yes** (new shops) | `default-system-roles.spec` (+1); `pos-security-wave1b`: manager sells; direct line and bill discounts → 403, nothing written | **Existing shops are not changed** (§4.3). Side effect: a Branch Manager can now also sell **below cost without a reason or audit** (finding F-C3) |
| 3 | Per-shop scale interpretation; price and weight modes; audit settings first; unset keeps behaviour | **Yes** | `pos-scale-barcode.helper.spec` (+4); `wave1c` ×7 (default AUTO unchanged, admin-only, validation, WEIGHT, PRICE, lookup = sale in every mode, per shop) | Replica audit (§3) is the "audit first" step and has **not** been run on real data |
| 4 | Keep authorised MRP override; audit record with user, reason, transaction details; Cashiers cannot | **Yes** | `pos-price-override.helper.spec` (3); `pos-price-qty` (3); `wave1c` over HTTP (Cashier refused with a reason, Admin/Manager need one, audit row, card number refused in the reason) | **No POS screen can set a price above MRP**, so the reason is API-only today (browser case B-07) |
| 5 | Modify `pos-overlay.tsx`; preserve idempotency through checkout and post-sale processing; prevent duplicate sales on retry; regression tests; browser proof in Step 2 | **Yes, code and unit level** | `pos-checkout-latch.test.ts` (7) incl. a structural order guard on the real component | Browser proof still owed (cases B-01…B-04) |
| 6a | P-F16: integers where `allowDecimalSelling=false`; audit settings before enforcing defaults | **Yes for `/pos/sale`**; **incomplete for `/returns`** | `pos-quantity.helper.spec` (6); `wave1c` | **Finding F-C1:** exchanges and partial returns still accept fractions of a piece good |
| 6b | P-F17: sale and drawer movement atomic; injected-failure and rollback tests | **Yes** | `wave1c`: injected failure → 5xx, no sale/stock/payment/movement/wallet change; retry with same key → one sale, one movement; parallel sales (below) | Boundary review in §1.2 |
| 6c | P-F21: charged = recorded; verify intended rule first | **Yes** | Verified from the web and the data model that quantity is whole units (each unit is its own `ReloadSale`; a card has its own PIN); `wave1c` (fractions refused, 1/3/5 units record exactly 1/3/5) | none |

### 1.2 P-F17 transaction boundary (reviewed in code, not only in tests)

`PosService.createSale` runs **one** `prisma.$transaction`. Inside it, in order: stock availability check · customer lock ·
cashier wallet (`ensureCashierWallet`) · gift-voucher row locks · invoice number (document engine) · `sale.create` (+ items,
payments) · coupon usage · held-bill reservation release · stock deduction (`adjustStock` with the same `tx`) · reload sales ·
customer wallet / credit / loyalty rows · held-bill delete · cheque rows · bank transaction + bank balance · **MRP audit row** ·
**drawer movement (`recordSaleCashMovement(tx, …)`, new)**. **After commit only:** the `pos.sale.completed` event (GL outbox,
the "CREATE Sale" audit entry, notifications, WebSocket). Therefore a committed cash sale always has its drawer movement, and
a failure at any step leaves nothing behind (proved by the injected-failure test).

- **Locking:** the movement takes `FOR SHARE` on the cashier's wallet row and re-checks it is still open (as before); if a handover
  cleared it a moment earlier the cash goes to the cashier's new wallet and the sale is re-pointed to it.
- **Replay:** a concurrent retry that loses the unique `(tenantId, clientRequestId)` race rolls back entirely and returns the
  first sale; it writes no second movement (tested: parallel identical requests → one sale, one movement).
- **Parallel load:** 8 simultaneous cash sales on one drawer: no deadlock, no 5xx, every successful sale has exactly one movement
  on the register it used, the movements sum to 200 × successes, and rolled-back sales left neither movement nor stock change.
- **Not covered by a test:** a handover racing a burst of sales (the only code path where the wallet re-point triggers).
- **Transaction time budget:** the sale transaction uses Prisma's default interactive timeout (5 s); it now contains one more
  insert and, for MRP overrides, one audit insert. No timeout was observed in 450+ e2e tests, but production load is unknown
  (risk R3).

### 1.3 Checkout idempotency (server and screen)

| Scenario | Server | Screen | Evidence |
|---|---|---|---|
| Same key twice at once (double click) | one sale, stock −1 | latch refuses the second trigger | `wave1c`; `pos-checkout-latch.test.ts` (50-way race) |
| Same key, different cart | refused, nothing created | key changes with the cart | `wave1c`; `pos-checkout-key.test.ts` |
| Lost response (server committed, browser saw an error) | retry returns the stored sale | key kept until the cart resets | structural guard; browser case B-03 owed |
| Local error after the server confirmed | n/a | "recorded, will not be charged twice", key kept | structural guard; browser case B-04 owed |
| Failure inside the sale (e.g. drawer movement) | everything rolled back; retry succeeds once | normal error toast | `wave1c` atomic test |
| Reason text in the MRP override | not part of the request fingerprint (benign: a retry with a different reason replays the first sale) | – | `pos-idempotency.helper` reviewed |

### 1.4 Regression evidence

Final counts are in §9 (filled from the last full run). Web production build: `corepack pnpm build` in `apps/web` exit 0.

---

## 2. Security findings (new in Step 1C)

| ID | Finding | Evidence | Severity | Status / action | Owner approval needed |
|---|---|---|---|---|---|
| **F-C1** | **P-F16 is incomplete.** `POST /returns` accepts fractions of a piece good both as the **outgoing exchange item** and as a **returned quantity**: an exchange of 1 sold piece for 0.5 piece, and a return of 0.5 piece, were each accepted (201) and moved stock by +0.5 | probe on the isolated DB (throwaway spec, deleted) | Medium (stock/value drift through a crafted request; no UI path) | **Not changed.** Proposed: apply the same `productAllowsFractions` rule to exchange items, and for returns allow a fraction only up to what the original sale line actually sold fractionally (legacy sales may contain fractions) | **Yes** (touches the returns flow and its rule needs a design choice) |
| **F-C2** | **Invoice-number collision under concurrency (pre-existing).** Concurrent checkouts can receive the same invoice number; one is rolled back with `409 Unique constraint violation on field(s): tenantId, invoiceNumber`. Seen in 1 of 8 parallel sales in 4 of 6 runs, **also for card-only sales (no drawer movement)**, so it is not caused by Step 1B | `wave1c` probes (cash ×3, card ×3) | Medium (no money or stock loss: the sale rolls back and a retry with the same key succeeds, but a cashier sees an error during busy periods) | **Not changed.** Cause: `DocumentNumberingService.allocate` reads the series without a lock, and the "raise the floor" update compares against that stale read, so it can move the counter backwards. Proposed: lock the series row (`FOR UPDATE`) or make the floor update `GREATEST(nextValue, floor)` in SQL | **Yes** (shared numbering for every document type) |
| **F-C3** | **Below-cost sales by Branch Managers are unaudited.** With `sales:create`, a Branch Manager can now sell below cost; unlike the MRP override there is no reason and no audit row | code review; existing test "manager sells below cost" | Low-Medium | **Not changed.** Decision needed: require a reason + audit for below-cost overrides too (same helper, 2 lines) or leave | **Yes** (policy) |
| **F-C8** | **The discount flow on screen and on the server disagree.** The web has its own constant (`DISCOUNT_APPROVAL_THRESHOLD_PCT = 10`, `apps/web/src/lib/workflow-access.ts`): up to 10 % a non-admin's discount is applied locally with no approval; above it the screen raises a manager workflow request (`POST /workflows/discount-request`) and waits. The server never reads that constant, and the sale request carries **no approval reference**; it refuses **every** manual discount from a non-admin (403, nothing written). So a Cashier or Branch Manager is offered a path that always fails at payment | code reading of `pos-overlay.tsx` (discount entry and checkout) and `pos.module.ts` (manual-discount check); the server side is tested in `pos-security-wave1b` | Medium (confusing for staff; no money impact because the server refuses) | **Not changed.** Browser case B-24 will characterise it. Resolving it belongs to the discount-policy decision (§5): either the server learns the approved-request reference, or the screen stops offering the path | **Yes** (policy) |
| F-C4 | `priceOverrideReason` was the only new free-text field without the card-number guard | code review | Low | **Fixed** (`@NoCardNumber()`), tested over HTTP (card number in the reason → 400, nothing written) | no |
| F-C5 | Held bills accept fractional quantities of piece goods (reservation only; checkout then refuses) | code reading (`holdBillDataRejection` checks shape only) | Low | Not changed; not tested | no (note) |
| F-C6 | The Quick GRN panel has no role gating; a Cashier editing the cost learns only from the API's 403 | code review | Low (UX) | Tooltip added; no gating | no |
| F-C7 | The unlock token still lives 12 h (binding to tenant, branch, terminal login is verified) | `pos-unlock-token.helper.spec` | Low | Policy open (shift length) | yes (policy) |

Checked and found sound: the scale-mode setting is Tenant-Admin-only and validated; Cashiers cannot override MRP even with a
reason; the audit row is written in the same transaction as the sale (no override sale without a record); the audit script is
read-only (§3); Quick GRN validates supplier ownership before cost authority (404 for a foreign supplier).

---

## 3. Existing-shop impact audit — `docs/ops-sql/step1b-audit-2026-11.sql`

### 3.1 Review result

- **Read-only: verified three ways.** (a) a static scan finds no data- or schema-changing keyword outside comments and string
  literals; (b) the e2e spec `step1b-audit-sql.e2e-spec.ts` executes the three statements inside a `SET TRANSACTION READ ONLY`
  transaction (any write would be refused) and proves the guard works by showing an `UPDATE` is refused in that same transaction;
  (c) row counts of the tables it reads are identical before and after.
- **Queries verified against a controlled fixture** (7 tests, all passing): part A counts only fractional lines (|qty − round| >
  1e-9) of piece-only products in the last 180 days (kg unit, WEIGHTED kind, flag-on products, whole quantities, float noise and
  sales older than 180 days are **not** counted); part B classifies exactly as the API reads the setting (`UNSET`, `AUTO`,
  `PRICE`, `WEIGHT`, case/space-insensitive, anything else = `INVALID (ignored = AUTO)`); part C lists only **system** Branch
  Manager roles and whether they hold `sales:create`.
- **Output contains counts and ids only** (tenant id, subdomain, counts, role id): no product names, no customer data.

### 3.2 Runbook for an authorised production replica (to be executed by the DBA, not by this project)

Preconditions: written owner authorisation; a **read replica or a restored backup**, never the primary; a database role that is
read-only; run outside peak hours; the output file stored in a restricted location (it names shops).

```bash
# from the repository root, with REPLICA_URL pointing at the authorised replica (do not echo it)
{
  echo "BEGIN READ ONLY;"
  echo "SET LOCAL statement_timeout = '120s';"
  cat docs/ops-sql/step1b-audit-2026-11.sql
  echo "ROLLBACK;"
} | psql "$REPLICA_URL" -X -v ON_ERROR_STOP=1 -P pager=off > step1b-audit-output.txt
```

Interpretation (three result sets, in order):

| Part | Column to read | Meaning | Action |
|---|---|---|---|
| A | `fractional_lines_180d` > 0 | the shop sold fractions of a piece-only product by some route other than the POS screen; **the new API rule would refuse that** | plan 4.1 for that shop **before** release |
| A | all 0 | no impact | none |
| B | `scale_barcode_mode` | `UNSET (= AUTO)` is expected for every shop; `INVALID` should not occur | plan 4.2 only if a shop reports scan problems |
| B | `weighed_products` > 0 with `UNSET` | candidates that may use a label scale | ask the shop; no change |
| C | `has_sales_create = false` | the shop's Branch Managers cannot ring sales | plan 4.3, only if the owner wants it |

Report the three result sets back to the owner as counts per shop; **do not paste the file into chat or tickets**. The run must be
recorded (who, when, which replica, output location).

---

## 4. Existing-tenant compatibility — separate remediation plans

General rules for all three: **no automatic migration or update of existing tenants**; every change to an existing record needs
separate owner approval, one tenant at a time, a dry run first, an audit trail (`audit_logs`) and a stated rollback; customer data
is never printed in logs or reports.

### 4.1 Shops affected by fractional piece sales (audit part A > 0)

*Why it matters:* after release the API refuses `quantity` with a fraction for a product that is not WEIGHTED, whose
`allowDecimalSelling` is false and whose unit is not kg/g. A shop that sold such fractions (because the product was set up
wrongly, or through a non-screen route) would have those sales refused.

1. **Diagnose (read-only, replica):** for each shop with `fractional_lines_180d > 0`, list the affected product ids with
   counts (drill-down below). Classify each: (a) a genuinely loose/weighed product set up as a piece → **configuration fix**;
   (b) a piece good sold in fractions by mistake or by an import/API client → **behaviour is now correctly refused**, tell the
   shop; (c) test data.
2. **Fix (a) only with approval:** set the product's unit to kg/g (or switch `allowDecimalSelling` on) — a change to an
   existing product record, per product, by the shop's admin in the product screen (preferred: the shop does it) or by an
   approved, audited script. Rollback: set the previous value back (record it first).
3. **Verify:** re-run part A on the replica after the shop's change; run one real scan/sale in the browser phase.
4. **If a shop cannot be fixed before release:** the release must wait for that shop, or the owner may approve an emergency
   kill-switch (a `FEATURE_PIECE_QUANTITY_RULE` flag; **not implemented**, offered as an option).

Drill-down (read-only, replica), counts and ids only:
```sql
SELECT po."tenantId", po.id AS product_id, count(*) AS fractional_lines, min(s."createdAt")::date AS first, max(s."createdAt")::date AS last
FROM sale_items si JOIN sales s ON s.id = si."saleId"
JOIN product_variants v ON v.id = si."variantId" JOIN products po ON po.id = v."productId"
WHERE s."createdAt" >= now() - interval '180 days'
  AND po."productKind"::text <> 'WEIGHTED' AND po."allowDecimalSelling" = false
  AND lower(btrim(coalesce(po.unit,''))) NOT IN ('kg','g','gram','grams','kilogram','kilograms')
  AND abs(si.quantity - round(si.quantity)) > 0.000000001
GROUP BY po."tenantId", po.id ORDER BY fractional_lines DESC;
```

### 4.2 Shops with unset scale configuration (expected: all shops)

*Why it matters:* nothing changes for them. `UNSET` behaves exactly as before (`AUTO`: a value ≥ LKR 1.00 is a price, smaller is a
weight), including its known ambiguity for weight labels of 1 kg or more.

1. **No action by default.** Do not set the mode for any shop proactively.
2. **If a shop reports wrong scale quantities:** get one printed label's 5 digits (digits 8–12) and the item's price; decide
   `PRICE` or `WEIGHT` from that; the shop's Tenant Admin sets it in **Settings → POS → Label scale barcode** (no data
   migration: it is a value in `tenants.settings.pos`).
3. **Verify** with two labels (a light and a heavy one) in the browser phase (cases B-05, B-06).
4. **Rollback:** set it back to `Automatic`.

### 4.3 Existing Branch Manager roles without `sales:create`

*Why it matters:* the new default applies to **new** shops only; existing shops keep their pack until a reviewed step changes it.

1. **Detect** (audit part C): shops whose system Branch Manager role lacks `sales:create`, with the number of users in the role.
2. **Owner decides per shop** whether Branch Managers there should be able to ring sales.
3. **Mechanism — important limitation:** the existing reviewed step `apps/api/scripts/review-system-roles.ts` is **dry-run by
   default**, applies **one tenant at a time** (`--apply --confirm <tenantId> --actor "<name>"`), writes an `audit_logs` entry and
   supports `--add-only` (no removals). It reconciles the **whole** standard pack for the three system roles, not just one
   permission: its dry run lists every permission it would add. A demonstration on a synthetic empty fixture shop printed
   `Branch Manager: keep 0, add 14 [...]` plus the two missing standard roles, i.e. it shows the full diff, not only `sales:create`.
   If the owner wants **only** `sales:create` added, a small single-permission step must be written and approved (not done).
4. **Procedure per approved shop:** dry run → owner reads the permission list → apply with `--add-only` → re-run the dry run
   (expect "no changes") → record. **Rollback:** remove the permission from that role in the shop's role screen (or restore from
   the backup taken before the change).
5. Branch Manager discounts remain governed by §5 whatever is decided here.

---

## 5. Branch Manager discount policy — unresolved (documented, not implemented)

**Current behaviour (verified):** only Tenant Admin and Super Admin can apply a manual discount at checkout
(`bypassesWorkflowApproval`). Everyone else, including a Branch Manager with `sales:create`, gets
`403 Manual discounts require an approved manager workflow. The discount approval policy is not configured for direct checkout.`
and **nothing is written** (tested for line and bill discounts). The message promises a "policy" and an "approved manager
workflow", but **no discount-policy setting exists anywhere in the API**. A discount-request workflow
(`POST /workflows/discount-request`) exists, and the POS screen has its own constant
(`DISCOUNT_APPROVAL_THRESHOLD_PCT = 10`, a client-side value that the server does not read; see finding F-C8: the screen lets
non-admins apply up to 10 % and offers an approval workflow above it, but the server refuses all of them and the sale request
has no approval reference). **This 10 % is an existing screen value, not a decision, and nothing here adopts it.**

**What the owner already decided:** Branch Managers keep discounts "within an existing approved configured policy"; no
unrestricted discount; no invented threshold. Since no configured policy exists, the compliant state today is: **Branch Managers
cannot give direct discounts.**

**Decisions needed (owner):**
1. Can a Branch Manager give a direct discount at all? 2. Maximum per line and per bill (percent and/or amount)? 3. Above that,
is approval by a Tenant Admin PIN required (existing approval-token mechanism) or the workflow request? 4. Is the limit
shop-wide or per branch? 5. Must a reason be recorded (recommended: same audit row pattern as the MRP override)?
6. Does the same limit apply to Cashiers acting with a manager's PIN?

**Guardrails ready for implementation once decided:** the refusal path and its tests exist (`pos-security-wave1b`); the audit
helper can be reused; nothing about the Cashier role changes. **Until then no code touches discounts.**

---

## 6. Browser test preparation (not started)

### 6.1 Gate — all must be met before the first browser test

| Gate | Status |
|---|---|
| G1 Owner confirms decisions 1–6 | **open** |
| G2 `step1b-audit-2026-11.sql` run on an authorised replica and the result reviewed | **open** (no production access here) |
| G3 Branch Manager discount policy decided, or explicitly deferred with Branch Managers confined to "no discounts" | **open** (documented in §5) |
| G4 Decisions on F-C1, F-C2, F-C3 (fix now / defer) | **open** |
| G5 Browser seed extended (see 6.2) | **open** |

### 6.2 Environment and data

- **API:** `node test/run-wave1-e2e.mjs --api` (port 3101, guard enforced, Keycloak/SMTP/WhatsApp/storage disabled).
- **Web:** the production build (`corepack pnpm build` is green) started against the isolated API with
  `NEXT_PUBLIC_API_URL=http://127.0.0.1:3101/api/v1`; headless browser through the `browser-automation` skill, one isolated
  session per scenario, screenshots plus console and network capture.
- **Accounts:** tenant `wave1-browser-5f9ceb` exists (Admin, Cashier, 2 branches, 1 customer, 1 product). **Not enough for the matrix:**
  the browser seed must also create a Branch Manager and a PIN for the Cashier and the Manager, a supplier, a weighed product with a
  five-digit PLU barcode (kg), a piece product, a piece product with a known cost, a product with no cost, a bank account and QR
  code, a customer with wallet and with credit, enough history for Customer History pagination, sales on both sides of tenant
  midnight, and a Sinhala shop name and product names. This is a seed-script task (isolated database only).
- **Rules:** no real WhatsApp, bank or provider; screenshots/console/network saved under the scratchpad, not the repository;
  secrets never printed.

### 6.3 Test matrix

Legend — Kind: UI = browser only, UI+DB = browser plus database check, API = needs an API client in the browser session.

| ID | Area | Scenario | Preconditions | Expected | Evidence | Kind |
|---|---|---|---|---|---|---|
| B-01 | Checkout idempotency | Double click on Pay; Enter + F9 together | cart with 1 item, cash tender | exactly one request leaves; one sale; one drawer movement | network log (1 POST), DB counts | UI+DB |
| B-02 | Checkout idempotency | Pay twice quickly with a customer/gift voucher tender | voucher with balance | one sale; voucher debited once | DB, voucher balance | UI+DB |
| B-03 | Retry after a lost response | intercept `/pos/sale`: let it reach the server, then drop the response | cart ready | browser shows a network error; pressing Pay again returns "already recorded"; **one** sale, **one** movement | network log, DB | UI+DB |
| B-04 | Failure after the server confirmed | make the post-sale code throw (e.g. force a local exception through a test hook or a blocked follow-up call) | cart ready | warning "recorded… will not be charged twice", cart kept, key kept; pressing Pay again does not create a second sale | screenshot, DB | UI+DB |
| B-05 | Scale modes | AUTO shop: scan a weight label and a price label | seeded weighed product, PLU | quantities as before Step 1B | cart screenshot, sale lines | UI+DB |
| B-06 | Scale modes | Admin switches Settings → POS to WEIGHT, then PRICE; scan the same labels | as above | lookup and sale agree in each mode; a Cashier cannot open the setting | screenshots, DB | UI+DB |
| B-07 | MRP override audit | (no screen sets a price above MRP) API-level in the browser session: Admin posts above-MRP with and without reason; Cashier posts with reason | seeded product MRP 120 | without reason 400; with reason 201 + audit row naming the user; Cashier 400 | responses, `audit_logs` | API |
| B-08 | Quick GRN as Cashier | receive at existing cost; cash 6,000 | PIN-set Cashier + Manager | manager PIN dialog; after approval "GRN posted & supplier paid"; cost = catalogue cost; drawer −6,000 | screenshots, DB | UI+DB |
| B-09 | Quick GRN edits | Cashier edits the cost field | as above | 403 message shown; nothing received; the same with a manager PIN | screenshot, DB | UI+DB |
| B-10 | Quick GRN as Manager/Inventory | edit the cost | Manager/Inventory login | accepted | DB | UI+DB |
| B-11 | Branch Manager sales | Manager logs in, sells, tries a line discount | seeded Branch Manager | sale works; discount refused with the policy message; nothing written | screenshots, DB | UI+DB |
| B-12 | Piece fractions | try 0.5 of a piece via the quantity popup and through the cart quantity editor | piece product | refused/prevented; weighed product still takes 0.375 | screenshots | UI |
| B-13 | Reload quantity | add reload/recharge to the cart and step quantity | reload operator seeded | whole numbers only; charged = recorded | DB | UI+DB |
| B-14 | Customer History | open a customer with wallet, credit, split tenders; page with "load more" | seeded history | newest first, stable continuation, split-tender amounts, loading/empty/error + retry states (abort the request once), branch filter notice | screenshots, network | UI |
| B-15 | POS Summary | dashboard summary around tenant midnight; shift selection; invalid date | sales at 23:59 / 00:01 tenant time | totals equal DB; boundary sales on the right day; invalid date → clear 400 | screenshots, DB | UI+DB |
| B-16 | Day-End print A4 | print/preview A4 PDF | closed shift | totals match DB; PDF opens | PDF screenshot | UI |
| B-17 | Day-End thermal 58/80 mm + Sinhala | print preview at both widths with Sinhala shop/cashier names | Sinhala seed data | no clipping, correct wrapping, glyphs shaped (Nirmala UI / Noto Sans Sinhala) | screenshots of the rendered output, not HTML text | UI |
| B-18 | Reprint | reprint a day-end report | after B-16/17 | same figures; persistence limits as documented | screenshots | UI |
| B-19 | **P-F19** | scan a barcode while the Payment Complete screen is open | completed sale on screen | **expected behaviour must be decided first** (queue for next sale / visible notice / ignore); today scans are dropped silently — first characterise, then compare with the decision | screenshots | UI (decision needed) |
| B-20 | **P-F22** | enter coupon, loyalty points to redeem, notes; reload the page / trigger the error boundary | cart with those fields | characterise what is lost; expected (if the owner wants drafts kept): restored after reload | screenshots | UI (decision needed) |
| B-21 | P-F8 / P-F11 final | end-to-end proof of key lifetime and voucher latch on the real screen | as B-02/B-04 | no duplicate sale in any case | DB | UI+DB |
| B-22 | Branch restrictions | assigned-branch user cannot switch branch; Admin can | seeded users | header and UI respect the assigned branch | network | UI+API |
| B-24 | **F-C8 discount flow** | Cashier and Branch Manager apply a 5 % and a 15 % discount; for 15 % raise the manager request and approve it | seeded users | **characterise**: today the server refuses at payment (403) in both cases and nothing is written; record exactly what the screen shows | screenshots, DB | UI (decision needed) |
| B-23 | Console/network hygiene | every scenario | – | no uncaught errors; no PIN/token/secret in console or network bodies | captured logs | UI |

Out of this matrix but still unverified: period lock, internal transfers, the WhatsApp payment notice (mock provider only),
Accounting Reconciliation screens.

---

## 7. Outstanding decisions (owner)

1. **Confirm decisions 1–6** (applied as proposed).
2. **F-C1** — extend the piece-quantity rule to exchanges and returns? (recommended: yes, with the "up to what was sold" rule.)
3. **F-C2** — fix the invoice-number allocator now (recommended before release) or accept occasional 409s under concurrency?
4. **F-C3** — require a reason and audit for below-cost sales (recommended: yes). **F-C8** — make the screen and the server agree on discounts (part of decision 5).
5. **Discount policy** (§5 questions 1–6).
6. **Quick GRN:** accept that the panel now starts from the catalogue cost (managers type the invoice price when different)?
7. **Unlock token lifetime** (12 h today) and **P-F20** (move the override from role type to a permission).
8. **P-F19 / P-F22 expected behaviour** (needed to write pass/fail criteria for B-19/B-20).
9. **Authorise the DBA to run the replica audit** and name the replica.
10. **Existing Branch Manager roles:** which shops get `sales:create`, and whether to write a single-permission step.

## 8. Remaining risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Shops that sold fractions of piece goods would be refused after release | replica audit part A + plan 4.1 before release |
| R2 | Invoice-number collisions under concurrency (pre-existing, F-C2) | fix before release or accept; retries are safe |
| R3 | Sale transaction grew by one insert (and one audit insert for overrides) under a 5 s default timeout | watch latency in the browser phase and staging; no timeout seen in tests |
| R4 | Quick GRN default cost changed from last buying price to catalogue cost | brief shops; managers can still type the cost |
| R5 | Browser behaviour of the checkout latch/key lifetime is proven only at unit/structural level | cases B-01…B-04, B-21 |
| R6 | A handover racing a burst of sales is untested | add a concurrency test with the handover endpoint |
| R7 | Web follow-ups (P-F19, P-F22) have no agreed expected behaviour | decision 8 |
| R8 | Period lock, internal transfers, WhatsApp notice, reconciliation screens, Sinhala rendering remain unverified | later steps |
| R9 | A single Jest process with many Nest apps runs out of memory | keep batches ≤ 4 suites (documented) |

## 9. Final counts (last full run in this step)

Isolated runner, sequential, memory-safe batches of at most 4 suites (a single process with many suites runs out of memory). Guard
line printed before every batch (see the header).

| Batch | Suites | Tests |
|---|---|---|
| bank-account-admin, supplier-lookup, search, pos-upgrade | 4 / 4 pass | 76 |
| cash-controls, qr-fee, customer-bank-bill-message, pos-payments-cashout | 4 / 4 pass | 65 |
| supplier-advance, opening-float, po-grn-stock-sync | 3 / 3 pass | 28 |
| app, concurrent-login, money-controls, tenant-middleware | 4 / 4 pass | 69 |
| products-opening-stock, security-tenant-isolation, system-roles | 3 / 3 pass | 42 |
| wallet-ledger, pos-price-qty | 2 / 2 pass | 40 |
| pos-security-wave1, wave1b, wave1c | 3 / 3 pass | 85 |
| exchange-loyalty-topup, refund-accounting | 2 / 2 pass | 28 |
| stock-idempotency-mrp, stock-supplier-security-wave1, **step1b-audit-sql** (new) | 3 / 3 pass | 35 |
| **e2e total** | **28 / 28 pass** | **468 pass, 0 fail, 0 skip** (456 at the start of Step 1C, +5 in `wave1c`, +7 in the new `step1b-audit-sql` spec) |
| API unit (`jest --runInBand --testPathIgnorePatterns /test/`) | 99 / 99 pass | **899 pass**, 0 fail, 0 skipped |
| Web unit (`node --test src/lib/**/*.test.ts`) | – | **118 pass**, 0 fail, 0 skipped |
| `tsc --noEmit` API (src) / web | clean / clean | – |
| Web production build (`corepack pnpm build`) | exit 0 | – |

Delta against the 456 baseline: `pos-security-wave1c` +5 (MRP override over HTTP ×4, parallel cash sales ×1; the file now has 39 tests) and the new `step1b-audit-sql` spec +7 = **468**.

Stability checks run for the two new risky tests: `wave1c` passed 3 consecutive runs (39 tests each); the audit-SQL spec passed
its final run after one false positive in its own keyword scan was corrected (the SQL literal `'create'` is not a statement).

Two throwaway probe specs were used (exchange/return fractions; parallel card sales) and **deleted**; no `zz-dbg` file remains.
`bank-account.helper.ts` was not modified. No application code changed in Step 1C except one line: `@NoCardNumber()` on
`priceOverrideReason` (finding F-C4).

## 10. Recommendation

**NO-GO for any release.** **GO to prepare the browser phase** as soon as G1–G5 are met: the automated evidence is complete and
green for every Step 1B change, the audit script is proven read-only and correct, the remediation plans and the browser matrix
are ready. The three unresolved items that matter most are the replica audit (R1), the invoice-number allocator (R2) and the
Branch Manager discount policy (§5). Nothing was deployed, committed, staged or pushed.
