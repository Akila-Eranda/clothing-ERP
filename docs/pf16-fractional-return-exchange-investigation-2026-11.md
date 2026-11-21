# P-F16 — fractional return/exchange investigation

**Status:** Investigation only; no implementation option selected.
**Scope:** Return/exchange quantity validation, original-sale quantity handling, tests, and documented P-F16 evidence.
**Safety:** No application, test, DTO, schema, or migration files were changed. No database connection, database write, migration, production access, or deployment was performed. The inspected application files already had worktree changes; those changes were preserved.

## Conclusion

The normal return quantity is capped against the quantity sold for the same variant, including quantities from earlier non-rejected returns. The cap is serialized under a lock on the original sale. The current code therefore prevents a material cumulative return quantity greater than the original sale's aggregate quantity for that variant.

That cap does **not** implement the P-F16 fractional-product rule. Both return-item DTOs accept positive decimal quantities, and the return pricing helper checks positivity, item membership, and cumulative upper bounds—but not whether the product/line may be fractional. The exchange-item DTO also accepts decimals, and exchange quantities are priced and applied to stock without applying the POS sale fraction helper.

Historical project documentation records a disposable isolated-DB probe in which a 0.5 quantity for a piece product was accepted in a return and as an outgoing exchange item (HTTP 201; stock moved by 0.5). The probe was deleted. The retained E2E suite covers fractional *weighted* returns and cumulative over-return prevention, but not the missing piece-product return/exchange cases.

One related source-level edge is noted below: sale status calculation compares an aggregate returned-by-variant quantity against each individual sale line. If an original sale contains duplicate rows for the same variant, this can mark the sale fully refunded before the aggregate sold quantity has been returned. This would block a remaining valid return; it does not establish a path to return more than was sold. It has not been runtime-tested.

## Root cause

The POS sale flow has a product-aware fractional quantity guard, but the return/exchange flow does not reuse it. Return DTO validation only requires a numeric quantity of at least `0.001`; `priceReturn` has no product-policy input and enforces only positive quantity, original-variant membership, and cumulative quantity/value bounds. The exchange-item path similarly selects the variant's selling price without reading its fraction-related product fields or validating the quantity. Thus a request can pass the sale-time fraction policy while still being capped against the quantity sold.

## Affected APIs and validation path

| API | DTO / path | Current behavior |
|---|---|---|
| `POST /api/v1/returns` | `ReturnsController.create` → `CreateReturnDto`; return items use `ReturnItemDto` at [returns.module.ts](../apps/api/src/modules/returns/returns.module.ts) lines 38–43; outgoing exchange goods use `ExchangeItemDto` lines 45–52. | Authenticated route requiring `sales:create`. Return and exchange DTO quantities use `@IsNumber()` and `@Min(0.001)`; neither declares an integer constraint or product-fraction validation. This route accepts both return items and `exchangeItems`. |
| `POST /api/v1/pos/returns` | `PosController.processReturn` → `ReturnSaleDto` / its `ReturnItemDto` at [pos.module.ts](../apps/api/src/modules/pos/pos.module.ts) lines 90–107 and 3383–3396. | Authenticated route requiring `sales:create`. Its item quantity is also `@IsNumber()` / `@Min(0.001)`. `PosService.processReturn` forwards the items to `ReturnsService.create`, so the same return pricing/cumulative cap applies. This DTO has no outgoing `exchangeItems` field. |

Both route prefixes use URI version 1. The endpoint paths are corroborated by the existing HTTP E2E test calls in [money-controls.e2e-spec.ts](../apps/api/test/money-controls.e2e-spec.ts).

### Return quantity processing

In [returns.module.ts](../apps/api/src/modules/returns/returns.module.ts) lines 170–187, `ReturnsService.create` starts a transaction, locks the original `sales` row with `FOR UPDATE`, loads sale lines and earlier non-rejected return items, aggregates prior quantities by `variantId`, then calls `priceReturn`.

In [returns-pricing.helper.ts](../apps/api/src/modules/returns/returns-pricing.helper.ts) lines 24–64, `priceReturn`:

1. Rejects requested quantities that are not greater than zero.
2. Combines duplicate requested rows for a variant and rounds the combined quantity to 3 decimal places.
3. Requires the variant to occur on the original sale.
4. Sums original sale-line quantities for that variant and rejects when the new plus previous quantity exceeds the rounded sold quantity, subject to `EPS = 1e-6`.
5. Prices the return from the original sale totals, not the client-sent unit price.

The request does not identify a `SaleItem` row. Return capacity and refund price are therefore computed per variant, aggregating all matching original lines.

### Exchange quantity processing

On `/api/v1/returns`, `ReturnsService.create` looks up each outgoing exchange variant for the same tenant and selects its ID and selling price, then calculates `exchangeAmount` as price × requested quantity ([returns.module.ts](../apps/api/src/modules/returns/returns.module.ts), lines 153–164). That lookup does not select product kind, unit, or `allowDecimalSelling` and does not apply the POS fraction helper.

The exchange data retains the requested quantity. `applyStockEffects` later passes each outgoing exchange quantity to inventory adjustment as a sale movement ([returns.module.ts](../apps/api/src/modules/returns/returns.module.ts), lines 436–480). Thus decimal quantities in outgoing exchange items affect both price and stock.

## Original sale quantity and historical data

- The POS `SaleItemDto` quantity is numeric and has a positive minimum ([pos.module.ts](../apps/api/src/modules/pos/pos.module.ts), lines 109–118). The sale validation path calls `fractionalQuantityRejection` for catalog variants around lines 475–479.
- The current sale rule is implemented by `productAllowsFractions` in [pos-quantity.helper.ts](../apps/api/src/modules/pos/pos-quantity.helper.ts), lines 1–33: a product is fractional-capable when it is `WEIGHTED`, has `allowDecimalSelling` enabled, or uses one of the listed weight units. This describes the current sale rule; it has not been approved here as the return rule.
- Sale item creation persists each submitted line's quantity without converting the Prisma field to an integer ([pos.module.ts](../apps/api/src/modules/pos/pos.module.ts), lines 934–955). `SaleItem.quantity` is `Float` and `variantId` is nullable in [schema.prisma](../apps/api/prisma/schema.prisma), lines 1853–1873.
- `ReturnItem.quantity` is also `Float` ([schema.prisma](../apps/api/prisma/schema.prisma), lines 2102–2115). The schema therefore does not impose whole-number quantities for either record.
- The sale line stores a variant ID, quantity, product/variant names, SKU, price, discounts, tax, and total; it does not snapshot `productKind`, `unit`, or `allowDecimalSelling`. Those product settings are mutable current product data. The return service cannot infer the exact sale-time fraction policy from the sale line alone.
- The current `priceReturn` cap is aggregate-by-variant, not tied to an individual original sale line. It can correctly cap the sum of duplicate-variant lines, but cannot distinguish which line's quantity is being returned or allocate a specific line's price when the variant appears on multiple differently priced lines.

## Can current behavior return more than was sold?

**No material over-return path was identified for returned items in the current helper.** It checks aggregate new-plus-prior quantity against aggregate sold quantity per variant; the transaction lock serializes concurrent returns for the same sale. Existing E2E tests cover cumulative and concurrent over-return attempts. The small `EPS` tolerance and three-decimal aggregation are implementation details; they are not a business-rule recommendation.

**Fractional quantities can nevertheless be accepted for products whose current POS sale rule would reject them.** This includes fractional return quantities up to the remaining original quantity and fractional outgoing exchange quantities. The historical F-C1 probe specifically documented a 0.5 quantity accepted for a piece-good return and exchange.

**Related under-return/status risk:** [returns.module.ts](../apps/api/src/modules/returns/returns.module.ts), lines 493–505, aggregates returned quantities by variant, then checks `returnedByVariant >= si.quantity` for every individual sale row. For example, with duplicate same-variant sale rows of quantities 1 and 2, an aggregate return of 2 satisfies both per-row comparisons, although the aggregate sold quantity is 3. `applyStockEffects` can then set the sale status to `REFUNDED`; later `ReturnsService.create` rejects a sale already in that status. The source also maps submitted sale items individually into sale rows, without a DTO uniqueness check ([pos.module.ts](../apps/api/src/modules/pos/pos.module.ts), lines 934–955). This is a source-derived edge case, not reproduced in a database.

## Existing test evidence

### Run during this investigation

Only pure helper tests were executed; no database was used:

```text
Set-Location apps\api; corepack pnpm test -- --runInBand src/modules/returns/returns-pricing.helper.spec.ts src/modules/returns/return-idempotency.helper.spec.ts src/modules/pos/pos-quantity.helper.spec.ts

Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
```

Relevant cases in [returns-pricing.helper.spec.ts](../apps/api/src/modules/returns/returns-pricing.helper.spec.ts) include:

- Accepting 0.25 kg of a weighted item.
- Rejecting return quantities above the original sold quantity, both in one request and cumulatively.
- Combining duplicate request rows for the same variant before checking the cap.
- Rejecting unknown variants and zero/negative quantities.

`pos-quantity.helper.spec.ts` tests the product fraction rule used for POS **sales**. It does not test return or exchange DTOs.

### Existing integration/E2E evidence (not run here)

[money-controls.e2e-spec.ts](../apps/api/test/money-controls.e2e-spec.ts), around lines 158–308, contains DB-backed HTTP cases for:

- Cumulative over-return rejection and concurrent full-return serialization.
- Idempotent retries and conflicting request IDs.
- A 0.25 kg return.
- Exchange pricing using catalog price.
- Tenant isolation.

These are not tests of fractional piece returns or fractional outgoing exchange quantities. They were not run because they perform database writes and no approved isolated database was available.

[pos-security-wave1c.e2e-spec.ts](../apps/api/test/pos-security-wave1c.e2e-spec.ts), around lines 170–210, covers the P-F16 POS **sale** rule (reject fractional piece-good sales; retain supported fractional sales). It does not exercise returns/exchanges.

[returns-pricing.helper.spec.ts](../apps/api/src/modules/returns/returns-pricing.helper.spec.ts) is the relevant pure return helper spec. No retained return/exchange E2E case was found for fractional piece-good quantities or product-setting changes between sale and return.

### Historical P-F16 evidence

[step-1c-readiness-2026-11.md](./step-1c-readiness-2026-11.md), section 2, finding F-C1, records the isolated-DB probe: `POST /returns` accepted both a fractional return quantity and a fractional outgoing exchange quantity for a piece good (201), moving stock by 0.5. The report says the throwaway spec was deleted, the issue was not changed, and owner approval was required because legacy sales may contain fractional quantities. This is historical evidence; it was not rerun in this investigation.

The same document's later sections describe a read-only audit of existing fractional sale lines and product reconfiguration choices. That context reinforces that historical fractional sales exist as a policy concern; this investigation performed no database audit.

## Missing regression coverage

No retained test currently establishes the approved return/exchange policy for:

1. Fractional return of a piece product with an integer original sale quantity.
2. Fractional return of a product that was fractional-capable at sale time but whose current product settings have since changed.
3. Return of a historical fractional sale quantity and cumulative partial returns of that quantity.
4. Fractional outgoing exchange quantities for each relevant product configuration.
5. The same cases through both `/api/v1/returns` and `/api/v1/pos/returns` where applicable.
6. Duplicate same-variant sale lines with differing quantities/prices, verifying both remaining return capacity and sale status.
7. Boundary precision around the existing 3-decimal aggregation and `EPS` tolerance, once the owner-approved quantity precision is known.

## Possible implementation options (no option selected)

| Option | Potential approach | Trade-offs / information needed |
|---|---|---|
| A. Whole quantities for every return and outgoing exchange line | Add integer validation at the relevant DTO/service boundaries. | Simple and independent of mutable product metadata; would reject legitimate weighted returns and historical fractional sales. It may also make returns of old fractional sales impossible. |
| B. Apply the current product fraction rule | Reuse `productAllowsFractions` for returned and outgoing items using current product settings. | Aligns with the current POS sale rule. Product settings may have changed since the original sale; the sale row does not snapshot those settings. For returned goods, current settings may not describe the original transaction. |
| C. Base returned quantity on the original sale quantity | Permit only the fraction represented in the original sold quantity and enforce cumulative remaining quantity; choose a separate rule for outgoing exchange goods. | Preserves some legacy fractional-sale returns, as contemplated in F-C1. The owner must decide what counts as an eligible historical fractional line. Current return rows identify only `variantId`, not a specific sale-item line; duplicate lines and different line prices need defined behavior. |
| D. Snapshot sale-time fraction policy and reference original sale lines | Persist or otherwise make sale-time product/quantity policy available to return validation, then associate return quantities with that source. | Gives deterministic sale-time validation but may require schema/data design and treatment of legacy rows. Any schema change or migration requires separate explicit approval and is outside this investigation. |

## Decisions requiring owner approval

1. What quantity rule applies to returned items: whole-number only, current product configuration, original sale quantity/configuration, or another explicitly specified rule?
2. What separate quantity rule applies to new/outgoing exchange items? Should it match the normal POS sale rule?
3. How should old fractional sales be returned after product settings change, and what should happen when historical sale-time product settings were not recorded?
4. If the same variant appears on multiple sale lines, should capacity and refund value be aggregated by variant or tied to a specific original line?
5. What quantity precision/tolerance is acceptable for each approved category, replacing or retaining the current three-decimal aggregation and epsilon behavior?
6. Should the related duplicate-line `REFUNDED` status calculation be included in the eventual fix/test scope?

No implementation option has been selected, and no fix has been made. Awaiting owner approval.
