---
name: supermarket-domain
description: Supermarket / grocery retail business rules for the HexaOne ERP and where each one lives in the code — POS checkout, weighed items and scale barcodes, FEFO expiry/batch lots, promotions, pricing, GRN with free qty and MRP, shifts and cash, returns, VAT, Sri Lankan context. Use when designing, implementing or reviewing any supermarket feature.
---

# Supermarket domain guide

Target market: Sri Lankan supermarkets and mini-marts (LKR, VAT, EPF/ETF payroll, Sinhala/English labels). Check existing code before building — much is already there.

## 1. POS checkout (`apps/api/src/modules/pos/pos.module.ts`, `apps/web/src/components/pos`)
- Sale is one `$transaction`: validate cart → price (`pricing.helper.ts` `calculateCartTotals`) → stock deduction (lots) → payments (`SalePayment`, split tender) → document number → commit → emit `pos.sale.completed` (→ GL outbox, audit, notifications).
- Fast lane needs: barcode-first entry, held bills (`HeldBill`), multi-counter (`x-pos-counter-id`), cashier PIN (`x-pos-cashier-token`, `pos-pin.helper.ts`), customer display, 6 layouts.
- Manager-approved discounts: `POST /workflows/discount-request`.
- Never let the client be the price authority — the server re-prices every line.

## 2. Weighed items & scale barcodes
- Product flags: `productKind = WEIGHTED`, `unit` kg/g, `allowDecimalSelling`, `weightScaleReady`.
- Manual weighing: web `lib/pos-weight.ts` — cashier types grams → `gramsToCartQty` (kg, 3 decimals).
- Label-scale barcodes: EAN-13 starting with `2`, digits 2–6 = PLU/article, 7–11 = price (cents) or weight×1000 — `parseScaleBarcode` in pos.module.ts; `resolveUnitPrice(catalogPrice, scaleAsPrice)` in pricing.helper.ts. Supermarkets differ on which mode the scale prints; keep it a tenant setting, test both modes, and validate the EAN-13 check digit.
- Qty is Float everywhere; round qty to 3 dp, money to 2 dp (`round2`).

## 3. Batch, expiry, FEFO (`modules/inventory/inventory-lots.helper.ts`)
- Stock is tracked in `InventoryLot` per batch/expiry; sales allocate with `allocateFromLots` using `lotOrderBy('FEFO')` (first-expiry-first-out) or FIFO.
- `normalizeBlockExpired` — tenant can block selling expired lots; `filterSellableLots`, `classifyExpiry` drive near-expiry/expired screens (`/inventory/expiry/*`).
- `Inventory.quantity` must equal the sum of lot quantities — use `reconcileLotTotals`; the `/inventory/expiry/reconcile` page exists for drift.
- Every movement writes `InventoryLog` with a `StockMovementType` (sale, return, GRN, transfer, adjustment, damage, count).

## 4. Purchasing / GRN (`modules/suppliers/procurement.*`, `supplier-ap.*`)
- PO → GRN → supplier invoice → payment allocation; purchase returns + debit notes.
- PO lines carry free qty, expiry, MRP and selling price (migrations `po_item_free_qty_expiry_mrp`, `po_item_selling_price`). Free qty raises stock but lowers effective unit cost — weighted average cost (`avgCost`) must use paid qty / total qty.
- GRN creates lots (batch + expiry) and posts GL via outbox (`GRN`).
- MRP rule (Sri Lanka): selling price must not exceed MRP printed on pack — validate at GRN and at price change.

## 5. Pricing & promotions (`modules/pricing`, `modules/promotions`)
- Line discount → promotion discount → customer tier → loyalty → tax, all in `calculateCartTotals`. Add new promo types (BOGO, mix & match, bundle price, happy hour, member price) as pure helper functions with specs first, then wire into the stack.
- Multiple selling prices per product exist (PO selling price / multi-price in POS).
- Gift vouchers: `GiftVoucher` model.

## 6. Cash & shifts (`modules/cash-management`)
- Shift open/close (`cash.shift.opened/closed`), cash registers per counter, cashier wallet + clearing (`cash.wallet.cleared` → GL), fund transfers, day close (`pos.day.closed`). Refunds post to the acting cashier's till.
- Blind cash count on close and over/short tracking are standard supermarket expectations.

## 7. Returns
- Grocery reasons: EXPIRED, QUALITY_ISSUE + common. Returned perishables usually go to damaged/write-off, not back to sellable stock — make the restock decision explicit per line.
- Emits `accounting.return.completed` → outbox `SALE_RETURN`.

## 8. Tax & accounting
- VAT via `TaxRate`, `VatReturn` (`accounting/tax.*`). Prices may be tax-inclusive — check `lineTaxAmount` before changing.
- All commerce money movement must reach the GL through the accounting outbox (skill `hexaone-accounting-posting`).

## 9. Reports supermarkets ask for
Daily sales by cashier/counter, hourly sales, category/department margin, fast/slow movers, dead stock & ABC (`/inventory/abc`, `/dead-stock`, `/aging`), near-expiry value, shrinkage from stock counts, supplier-wise purchases, VAT report.

## Known gaps to check against
See `docs/hexaone-erp-gap-analysis.md` (P0–P3) before starting a feature; update its status tag when you complete one.
