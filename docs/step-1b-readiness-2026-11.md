# HexaOne — Step 1B: security coverage and policy closure (14 Nov 2026)

**Branch:** `remediation/2026-11` (+ uncommitted work). **Nothing committed, staged, pushed or deployed.**
**Environment:** isolated only — PostgreSQL `127.0.0.1:5434` / `hexa_e2e_wave1` / non-superuser `hexa_e2e` (container
`hexa-e2e-pg`), Redis `127.0.0.1:6390`. The runner guard printed
`database=hexa_e2e_wave1, role=hexa_e2e, superuser=false, tables=162, migrations=60 successful/0 incomplete, Redis=PONG`
before every run. `fashionerp_db`, `fashionerp` and production were not contacted; secrets stayed in the local file
(not printed, not in the repo). Browser testing did **not** start.
**Audience:** owner (decisions), engineering (next steps).

---

## 1. Findings

| # | Finding | Class | Evidence | Status |
|---|---|---|---|---|
| F1 | `POST /pos/sale` accepted `items: []`: it created a real invoice number, a total-0 sale and a recorded 200 payment line with 200 change (no stock effect) | **Confirmed defect, fixed** | probe on the isolated DB: 201, +1 sale, total 0, 0 items, payment 200, invoice `INV-…-0011` | Fixed (2 lines, below); regression test added |
| F2 | P-F16: the API sells 0.5 of a piece good (`allowDecimalSelling=false`, unit pcs); only the web UI enforces it | **Confirmed defect, fix awaiting approval** | `it.failing` test: 201 and stock reduced; the control (whole quantity) passes | Open |
| F3 | P-F17: the drawer movement of a cash sale is recorded **after** commit by `void recordSaleCashMovement(...)`; a failure is only logged | **Confirmed defect, fix awaiting approval** | `it.failing` test with an injected failure (spy called once): sale 201, drawer movement 0 | Open |
| F4 | P-F21: a fractional reload quantity (2.5) is charged in full (LKR 250) but `Math.floor` records only 2 reload sales (`pos.module.ts` ~2902) | **Confirmed defect, fix awaiting approval** | `it.failing` test: 201; control with quantity 2 records exactly 2 | Open |
| F5 | P-F8: `clearCheckoutRequestKey()` runs right after the API answers (`pos-overlay.tsx:2207`), before ~60 lines of local post-sale processing; an exception there leaves the cart un-reset with a fresh key, so a retry can create a second sale | **Confirmed by code reading; not reproduced in a browser** | key-store semantics pinned by 8 unit tests; the ordering needs the browser phase | Open (web change + browser proof) |
| F6 | P-F13: the unlock token **is** bound to tenant, branch and terminal login and is HMAC-signed; its 12 h lifetime is unchanged | Partly resolved; lifetime is policy | 6 unit tests incl. tamper, wrong tenant/branch/terminal, wrong token type | Policy open |
| F7 | P-F15: totals are decided by the server; the client cannot send `total`/`subtotal`/`amountDue`/`changeDue` (rejected 400); stored total = Σ stored lines; cost is recomputed server-side | Not a defect | 3 e2e tests | Closed (the "LKR 1" difference can only be a web display issue) |
| F8 | P-F20: the price override is tied to the role **type**; a CUSTOM role holding every permission is still refused below cost | Policy question, not a defect | characterisation test | Policy open |
| F9 | The Quick GRN panel has no role gating on the web: a Cashier fills the form and only then receives 403 | Consequence of the 1A observation | code reading | Policy open (decision 1) |

**Fix applied (application code, 2 lines):** `apps/api/src/modules/pos/pos.module.ts` — `ArrayMinSize` added to the
`class-validator` import and `@ArrayMinSize(1, { message: 'A sale needs at least one item' })` on `CreateSaleDto.items`.
Why it is safe: the POS already says "Cart is empty", no flow posts a sale without lines, and the rule carries no
business decision. Regression: the "no lines" case of the malformed-request table now asserts 400 and "nothing written".

---

## 2. Policy decisions required (nothing below was implemented)

**D1 — Quick GRN and Cashiers.** Today: the Quick GRN DTO always carries `unitCost`; setting cost requires
Super/Tenant Admin, Branch Manager, Inventory Manager or Accountant, all of which are cash managers. So a Cashier
cannot complete a Quick GRN, with or without a manager PIN approval (403 `requires an authorised inventory or finance
role`). PO receive (no cost field) keeps "Cashier pays, Manager authorises". Options:
(A) keep as is and hide/disable the panel for Cashiers (UI-only change, no API change);
(B) let a Cashier receive at the product's **existing** cost (cost optional on the DTO, server fills it) with the manager
PIN for cash above the limit;
(C) let a manager approval token also authorise the cost for that one request.
*Recommendation: B* — it keeps the approved cash-approval flow and never lets a Cashier change cost. Needs: owner
choice; DTO + service change; e2e update.

**D2 — Branch Manager sales and discounts.** Today: the default Branch Manager role has no `sales:create` (cannot ring
a sale; approves by PIN); direct manual discounts are allowed only to Super/Tenant Admin
(`bypassesWorkflowApproval`); the message says "the discount approval policy is not configured", and **no such policy
exists anywhere in code or data**. The approved rule "Branch Managers keep discounts within a configured policy"
therefore has nothing to apply. Needed from the owner: (1) may a Branch Manager sell at all; (2) the discount
limits (per line %, per bill %/amount, approval above) per role. No threshold was invented.

**D3 — P-F3 price versus weight labels.** Today the server reads a 5-digit embedded value as a **price** when it is
≥ LKR 1.00 and as a **weight** otherwise (`pos-scale-barcode.helper.ts`). A weight label such as `00400` (0.400 kg)
is therefore read as LKR 4.00 and refused ("quantity does not match") for any shop whose scale prints weight.
Needed: a per-shop setting `price | weight` (stored in tenant settings JSON — no migration) and which mode each shop
uses. Evidence checks (checksum, PLU, quantity, catalogue price) are already tested.

**D4 — P-F14 MRP enforcement.** Today a Cashier cannot sell above the highest known price/MRP; Branch Manager/Admin
may, and the override is recorded (`ABOVE_MAX_PRICE`). Decide: keep (recorded override) or make MRP a hard cap for
everyone (Consumer-protection style). If hard cap: remove the override for `ABOVE_MAX_PRICE` only.

**D5 — P-F11 / P-F8 web checkout latch (engineering approval, not a business policy).** Approve changing
`pos-overlay.tsx` to (a) clear the checkout key only after the cart is reset, and (b) add an in-flight latch on the
gift-voucher checkout. Server-side duplicate protection already holds (same `clientRequestId` returns the same sale,
tested in 1A and again here). Must be proven in the browser phase (Step 2).

**Also open, smaller:** P-F13 token lifetime (12 h; shorter = shift-length decision) · P-F20 move the override from
role type to a permission (would add a permission to the catalogue → needs a reviewed role step per shop) · approval to
fix F2 (P-F16: enforce the product's own `allowDecimalSelling` rule; effective rule must equal the catalogue's
`allowDecimalSelling ?? productKind === WEIGHTED`, and existing shops with null flags must be checked first), F3
(P-F17: move the drawer movement into the sale transaction — touches cash flow, needs a design and the cash/accounting
owner), F4 (P-F21: refuse non-integer reload quantity).

---

## 3. P-F coverage matrix (after Step 1B)

Numbering from the 12 Nov Wave-1 audit checklist (recovered in Step 1A). "Unit/E2E" counts are tests that exist now.

| ID | Requirement | Unit | E2E (HTTP+DB) | Browser | Result |
|---|---|---|---|---|---|
| P-F1 | `reloadType` on a catalogue line | yes | wave1 ×4 | – | PASS |
| P-F2 | bill discount cap | yes | wave1 ×3, pos-price-qty | – | PASS (cap); D2 open |
| P-F3 | scale label price vs weight | yes | pos-price-qty (valid accepted, forged/mismatch refused) | – | PARTIAL; D3 open |
| P-F4 | weighed goods price floor | yes | pos-price-qty | – | PASS |
| P-F5 | non-cash overpayment | – | wave1b | – | PASS |
| P-F6 | return needs original sale | – | wave1b | – | PASS |
| P-F7 | custom lines | yes | wave1b | – | PASS |
| P-F8 | checkout key cleared too early | **8 new** (key store) | server replay tested | **needed** | OPEN (F5, D5) |
| P-F9 | hold/coupon permissions | yes | wave1 ×3 | – | PASS |
| P-F10 | held-bill scope | yes | wave1 ×6 | – | PASS |
| P-F11 | voucher: API locking / web latch | yes | wave1b ×3 (API) | **needed** (web) | API PASS; web OPEN (D5) |
| P-F12 | Next Sale guard | 3 existing | – | **needed** | PARTIAL (guard logic only) |
| P-F13 | unlock token | **6 new** | – | – | binding PASS; lifetime = policy |
| P-F14 | MRP | yes | pos-price-qty | – | current behaviour PASS; D4 open |
| P-F15 | server totals | – | **wave1c ×3** | – | PASS (closed) |
| P-F16 | fractional pieces | – | **wave1c: control + `it.failing`** | – | CONFIRMED DEFECT (F2) |
| P-F17 | drawer movement after commit | – | **wave1c: control + `it.failing`** | – | CONFIRMED DEFECT (F3) |
| P-F18 | ledger text | – | wave1 | – | PASS |
| P-F19 | scans dropped on Payment Complete | – | – | **needed** | OPEN (no unit seam) |
| P-F20 | override by role type | – | **wave1c characterisation** | – | POLICY |
| P-F21 | reload quantity floored | – | **wave1c: control + `it.failing`** | – | CONFIRMED DEFECT (F4) |
| P-F22 | coupon/loyalty/notes lost on reload | – | – | **needed** | NOT REPRODUCED |

New negative/edge/security coverage in `pos-security-wave1c` (25 tests): unknown total fields; exact total/change;
server-side cost; duplicate `clientRequestId` in parallel (one sale, stock −1); same key with a different cart refused;
**last unit sold by two cashiers at once → exactly one wins, stock 0, never negative**; cross-tenant product and cross-
tenant token refused; no token 401; no sales permission 403; zero/negative/text quantity, negative price, no lines, no
payments, negative payment, unknown method → 400 and nothing written; quantity above stock refused.

---

## 4. Files changed in Step 1B

| File | Change |
|---|---|
| `apps/api/src/modules/pos/pos.module.ts` | **application code, 2 lines:** `ArrayMinSize` import + `@ArrayMinSize(1)` on `CreateSaleDto.items` |
| `apps/api/test/pos-security-wave1c.e2e-spec.ts` | new, 25 tests (3 of them `it.failing` defect documents) |
| `apps/api/src/modules/pos/pos-unlock-token.helper.spec.ts` | new, 6 unit tests |
| `apps/web/src/lib/pos-checkout-key.test.ts` | new, 8 unit tests |
| `docs/step-1b-readiness-2026-11.md` (this file), `docs/production-readiness-2026-11.md` | documentation |

No schema, migration, accounting mapping, `bank-account.helper.ts`, ledger or historical balance was touched.

---

## 5. Tests executed and results

All e2e through `node test/run-wave1-e2e.mjs <specs>` (sequential, `--runInBand`), in separate processes because one
process running many Nest apps exhausts memory (a 26-suite process and an 8-suite process both aborted without a
result; the suites were rerun in smaller batches, never skipped).

| Run | Suites | Tests |
|---|---|---|
| e2e batch A (bank-account-admin, supplier-lookup, search, pos-upgrade, cash-controls, qr-fee, customer-bank-bill-message, pos-payments-cashout, supplier-advance, opening-float, po-grn-stock-sync) | 11 / 11 pass | 169 |
| e2e batch B (app, concurrent-login, money-controls, products-opening-stock, security-tenant-isolation, stock-idempotency-mrp, system-roles, tenant-middleware) | 8 / 8 pass | 116 |
| e2e `pos-security-wave1` + `wave1b` + **`wave1c`** | 3 / 3 pass | 70 (28 + 17 + 25) |
| e2e exchange-loyalty-topup + refund-accounting | 2 / 2 pass | 25 |
| e2e wallet-ledger + pos-price-qty + stock-supplier-security-wave1 | 3 / 3 pass | 61 |
| **e2e total** | **27 / 27 pass** | **441 pass, 0 fail, 0 skip** (416 from Step 1A + 25 new) |
| API unit (`jest --runInBand --testPathIgnorePatterns /test/`) | 97 / 97 pass | **884 pass** |
| Web unit (`node --test src/lib/**/*.test.ts`) | – | **107 pass** (99 + 8 new), 0 skipped |
| `tsc --noEmit` api (src and test configs), web | clean | – |

(`stock-supplier-security-wave1` = 23 tests, counted in the last batch.) Jest counts an `it.failing` that fails as expected as passed; the 3 defect tests were
additionally run with `.failing` removed and fail **at the intended assertion** (accepted 201 / drawer movement 0 with the
injected failure confirmed / accepted 201), so none of them can pass for a fixture reason.

---

## 6. Remaining risks

1. Three confirmed API defects (F2 P-F16, F3 P-F17, F4 P-F21) are open pending approval. F3 is the most serious: a
   transient error leaves a completed cash sale with no drawer movement (drawer short at day-end, no automatic repair).
2. Web checkout behaviour (P-F8, F11 latch, F12, F19, F22) is unverified in a browser; F5 can create a duplicate sale
   after a local post-sale error.
3. The Cashier cannot do a Quick GRN with cost, and the web does not tell them until the 403 (D1).
4. Branch Manager discount/sale rights and the MRP cap are undecided (D2, D4); weight-label shops cannot sell weighed
   goods through label scans (D3).
5. Unlock tokens last 12 h (D-lifetime).
6. Not covered at all in this step: period lock, internal transfers, WhatsApp payment notice (mock), Customer
   History/POS Summary browser flows, Day-End print/Sinhala rendering, live providers.
7. Harness: many Nest apps in one Jest process run out of memory; keep batches ≤ 4–11 light suites.

## 7. Recommendation

**NO-GO for release.** Step 1B added coverage and fixed one defect, but three confirmed API defects, the web checkout
items and five policy decisions are still open, and Step 2 (browser) has not run. Recommended order: owner answers D1–D5 →
approve fixes F2/F3/F4 → implement with tests (the three `it.failing` tests flip to normal tests) → Step 2 browser phase.

---

# Addendum — decision resolution and approved fixes (14 Nov 2026, later)

The owner's proposed decisions were implemented **subject to the product owner's confirmation**. Local and isolated only;
nothing committed, staged, pushed or deployed; `fashionerp_db` and production untouched; no schema or migration change; no
accounting mapping change; Wallet / Credit / AR / liability ledgers remain separate.

## A. What was implemented

| # | Decision | Implementation | Evidence |
|---|---|---|---|
| 1 | Quick GRN for Cashiers | `unitCost` is optional on `QuickGrnLineDto`; the server uses the product's **existing** cost when it is omitted. Sending the unchanged cost is not an edit. Any other cost → 403 `requires an authorised inventory or finance role`, **also with a manager PIN approval**. A product with no cost cannot be received by a Cashier (400, "ask a manager"). Cash above the limit still needs the manager PIN (cashier pays, manager authorises). Direct GRN rules and **PO receive are unchanged**. A foreign supplier is checked first (404). Web panel: default cost = catalogue cost; `unitCost` is sent only when the cashier changed it. | `exchange-loyalty-topup` (approval flow restored; edit refused with and without approval; unchanged cost allowed; no-cost product; authorised role may edit), `stock-supplier-security-wave1` (S-F8), `grn-line-cost.test.ts` (4) |
| 2 | Branch Manager | `sales:create` added to the **default** Branch Manager pack (new shops). No discount right granted: manual discounts stay Tenant/Super Admin only; no threshold invented. | `default-system-roles.spec` (+1); `pos-security-wave1b`: a manager sells (201) and sells a custom line; a direct line or bill discount → 403 and nothing written |
| 3 | Scale labels | New per-shop setting `tenant.settings.pos.scaleBarcodeMode` = `AUTO` (default; **today's behaviour unchanged**) / `PRICE` / `WEIGHT`. Admin-only `PUT /tenants/pos-settings`, returned by `GET`; used by **both** the barcode lookup and the sale check, so screen and server agree; selector in Settings → POS. Missing or unknown values read as AUTO. | `pos-scale-barcode.helper.spec` (+4); `pos-security-wave1c` (default AUTO unchanged, admin-only, validation, WEIGHT, PRICE, lookup = sale in every mode, per shop) |
| 4 | MRP override | Cashiers still cannot sell above MRP. An authorised override now **requires `priceOverrideReason`** (400 without it); it is stored on the sale (`overriddenBy`, `reason`) and written as an audit row (`APPROVE` / `SalePriceOverride`: user, reason, invoice, branch, total, product, price, maximum) **in the same transaction**. Below-cost overrides are unchanged. | `pos-price-override.helper.spec` (3); `pos-price-qty` (3 tests) |
| 5 | Web checkout | `pos-overlay.tsx`: synchronous in-flight latch (`createCheckoutLatch`); the idempotency key is cleared only **after the cart is reset**; a failure after the server confirmed the sale shows "recorded, will not be charged twice" and keeps the key. | `pos-checkout-latch.test.ts` (7: latch, 50-way race, release on error, structural order guard on the real component). **Browser proof is still owed (Step 2).** |
| 6 | P-F16 | The API refuses fractions of a piece good by the **same rule the screen uses** (fractions allowed if WEIGHTED, `allowDecimalSelling`, or a weight unit). It never refuses what the screen allows: a kg product whose flag is still the column default `false` keeps selling by weight. | `pos-quantity.helper.spec` (6); `wave1c` (refusals 0.5 / 1.5 / 0.001 / 2.0001; kg-default, WEIGHTED and flagged products still sell 0.375) |
| 6 | P-F17 | The drawer movement is written **inside the sale transaction** (`recordSaleCashMovement(tx, …)`); the post-commit fire-and-forget is gone. If it fails, the whole sale rolls back (stock, payments, invoice, wallet/credit, loyalty, vouchers). | `wave1c`: injected failure → 5xx, no sale, stock restored, no payments, no movements, customer wallet and credit untouched; a retry with the same key → one sale, one SALE movement of the cash share; movement and sale share one register; a card-only sale writes no movement |
| 6 | P-F21 | Intended rule verified: the web only creates reload lines with quantity 1 and whole-number steps, and every unit is its own `ReloadSale` (a physical card has its own PIN). Decimals are therefore **not** supported: a non-integer reload quantity → 400, and the recorder re-checks so charged ≠ recorded can never happen (`Math.floor` removed). | `pos-reload-guard.helper.spec` (+2); `wave1c`: 2.5 / 0.5 / 1.0001 refused; 1, 3, 5 units record exactly 1, 3, 5 reload sales and charge 100 × q |
| – | Empty cart | `@ArrayMinSize(1)` on `CreateSaleDto.items` (first half of Step 1B). | `wave1c` malformed-request table |

## B. Files changed in this addendum

**Application code:** `apps/api/src/modules/pos/pos.module.ts` (items minimum; fraction rule; reload whole quantity; MRP
reason + audit + metadata; cash movement inside the transaction; scale mode in sale and lookup; `priceOverrideReason` DTO field) ·
`apps/api/src/shared/cash-register.helper.ts` (movement joins the caller's transaction) · new
`apps/api/src/modules/pos/pos-quantity.helper.ts` and `pos-price-override.helper.ts` · `pos-reload-guard.helper.ts` and
`pos-scale-barcode.helper.ts` (mode) · `apps/api/src/modules/suppliers/procurement.service.ts` and `suppliers.module.ts`
(Quick GRN) · `apps/api/src/modules/roles/default-system-roles.ts` · `apps/api/src/modules/tenants/tenants.module.ts` (scale mode
setting) · web: `components/pos/pos-overlay.tsx`, `components/pos/pos-quick-grn-panel.tsx`,
`app/(dashboard)/settings/page.tsx`, new `lib/pos-checkout-latch.ts` and `lib/grn-line-cost.ts`, `lib/pos-settings.ts`.

**Tests:** `pos-security-wave1b/1c`, `exchange-loyalty-topup`, `pos-price-qty`, `default-system-roles.spec`,
`pos-unlock-token.helper.spec`, the helper specs above, and web `pos-checkout-latch.test.ts`, `grn-line-cost.test.ts`.
**Ops:** `docs/ops-sql/step1b-audit-2026-11.sql` (read-only; validated on the isolated database).
`bank-account.helper.ts` was not modified.

## C. Results (exact)

The runner guard printed before every run: `database=hexa_e2e_wave1, role=hexa_e2e, superuser=false, tables=162,
migrations=60 successful/0 incomplete, Redis=PONG` (PostgreSQL 127.0.0.1:5434, Redis 127.0.0.1:6390). Batches are memory-safe: one
process running many suites runs out of memory, and two earlier attempts aborted and were rerun in smaller batches.

| Run | Suites | Tests |
|---|---|---|
| e2e: bank-account-admin, supplier-lookup, search, pos-upgrade | 4 / 4 pass | 76 |
| e2e: cash-controls, qr-fee, customer-bank-bill-message, pos-payments-cashout | 4 / 4 pass | 65 |
| e2e: supplier-advance, opening-float, po-grn-stock-sync | 3 / 3 pass | 28 |
| e2e: app, concurrent-login, money-controls, tenant-middleware | 4 / 4 pass | 69 |
| e2e: products-opening-stock, security-tenant-isolation, system-roles | 3 / 3 pass | 42 |
| e2e: wallet-ledger, pos-price-qty | 2 / 2 pass | 40 |
| e2e: pos-security-wave1, wave1b, wave1c | 3 / 3 pass | 80 |
| e2e: exchange-loyalty-topup, refund-accounting | 2 / 2 pass | 28 |
| e2e: stock-idempotency-mrp, stock-supplier-security-wave1 | 2 / 2 pass | 28 |
| **e2e total** | **27 / 27 pass** | **456 pass, 0 fail, 0 skip** (441 before, +15 new) |
| API unit (`jest --runInBand --testPathIgnorePatterns /test/`) | 99 / 99 pass | **899** (884 before) |
| Web unit (`node --test src/lib/**/*.test.ts`) | – | **118 pass** (107 before), 0 skipped |
| `tsc --noEmit`, api (src) and web | clean | – |

Found and resolved during the run: one `stock-idempotency-mrp` hook timeout (transient; the spec passes alone in 8 s and no
database connections were leaked), and one genuine ordering issue: a Cashier sending a cost for a foreign supplier received 403
before 404. Supplier ownership is now checked first.

## D. Prerequisites still open (so the browser phase has NOT started)

1. **Owner confirmation** of decisions 1–6; they were applied as proposed.
2. **Existing shops:** the new Branch Manager `sales:create` applies to **new** shops only. Existing shops change only through the
   reviewed per-tenant role step; part C of `step1b-audit-2026-11.sql` lists who lacks it.
3. **Run `step1b-audit-2026-11.sql` on a production replica or restored backup before release** (no production access was used
   here). Part A lists shops that sold fractions of a piece-only product in the last 180 days, which the new API rule would
   refuse; part B shows the scale mode per shop (all UNSET = unchanged). Any non-zero part A row needs review first.
4. **Discount policy** for Branch Managers is still undefined (limits per line / bill, approval above); nothing was invented.
5. **Browser proof (Step 2)** for the checkout latch and key lifetime (P-F8, P-F11), the Quick GRN panel as Cashier and as
   Manager, the scale-mode selector, and the above-MRP path (no POS screen sets a price above MRP, so the reason is API-only today).
6. Still unverified from the earlier scope: period lock, internal transfers, the WhatsApp payment notice (mock provider), Customer
   History and POS Summary browser flows, Day-End print and Sinhala rendering, P-F19 and P-F22 (web only).

## E. Risks introduced by these changes

- **Cash in the sale transaction:** a failure to write the movement now fails the sale (by design). It adds one insert to the
  transaction; the lock semantics are the old ones (`FOR SHARE` on the wallet row).
- **P-F16:** shops that sold fractions of piece-only products through non-screen routes will be refused; run audit A first.
- **Quick GRN:** the POS panel now defaults each line to the catalogue cost instead of the last buying price; managers who relied
  on the last price must type it (an edit, which they are allowed to make).

**Release status: NO-GO** until D1–D6 are cleared.
