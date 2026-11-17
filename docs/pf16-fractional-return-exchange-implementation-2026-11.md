# P-F16 — fractional return/exchange implementation follow-up

**Status:** Implemented and locally validated, including the duplicate-line status correction; database-backed API verification remains blocked.
**Investigation:** [P-F16 fractional return/exchange investigation](./pf16-fractional-return-exchange-investigation-2026-11.md)

## Approved behavior

The owner approved whole-number returns for piece/count products, fractional returns for weighted or fraction-enabled products, and the same current product quantity rule for outgoing exchange items as for POS sales. The owner also selected the legacy exception: if the original sale for a variant included a fractional quantity, allow fractional returns for that variant, subject to the existing cumulative remaining-quantity cap.

## Implementation

- Both `POST /api/v1/returns` return items and `POST /api/v1/pos/returns` return items are handled by `ReturnsService.create`; the service now applies the existing POS fraction rule using the tenant's current product/variant data.
- For piece/count products, fractional return quantities are rejected unless the original sale included a fractional line for that variant. Whole-number returns remain accepted.
- Outgoing exchange items use the existing POS quantity rule for the exchange product.
- Return variant metadata is queried with a tenant constraint. Existing original-sale row locking, idempotency handling, aggregate return cap, refund calculation, stock effects, and accounting flow were not intentionally changed.
- Sale completion now compares total returned quantity with total sold quantity per variant, rather than comparing one aggregate return quantity with each individual duplicate sale line.
- No schema, DTO, migration, or `bank-account.helper.ts` changes were made.

### Historical fractional-sale limitation

Sale lines do not snapshot the product's sale-time fraction settings. The approved legacy exception therefore uses the original sale quantity as its signal: if **any** original line for a variant has a fractional quantity, fractional returns for that variant are allowed, while `priceReturn` continues to cap cumulative returns against the aggregate quantity sold for that variant.

This is not a per-sale-line fractional allowance. Where one variant appears on multiple sale lines, capacity remains aggregate-by-variant, matching the existing return-pricing behavior; the implementation does not allocate returned quantities or refund value to a particular original line. No historical records were changed.

### Duplicate same-variant sale-line issue

The prior status calculation could mark a sale fully refunded too early: it aggregated returned quantity by variant but compared that aggregate against each individual sale line. This is now fixed by aggregating original sale-line quantities by variant and comparing at the existing three-decimal return precision. Focused helper regressions cover duplicate lines and fractional totals. The database-backed status transition was not runtime-tested.

## Files touched

- `apps/api/src/modules/returns/returns-pricing.helper.ts` — added the product-aware return quantity rejection helper, approved historical exception, and aggregate sale-completion predicate.
- `apps/api/src/modules/returns/returns.module.ts` — applies product-aware validation to return and outgoing exchange items; constrains variant lookups to the tenant; fixes premature `REFUNDED` status for duplicate sale lines.
- `apps/api/src/modules/returns/returns-pricing.helper.spec.ts` — covers piece/count, weighted, fraction-enabled, legacy fractional-sale behavior, cumulative cap, duplicate sale lines, and fractional aggregate precision.
- `apps/api/test/money-controls.e2e-spec.ts` — adds `/api/v1/returns` regression cases for piece, weighted/fraction-enabled, legacy fractional returns, and outgoing exchange quantities.
- `apps/api/test/pos-security-wave1c.e2e-spec.ts` — adds `/api/v1/pos/returns` piece-quantity regression coverage.

## Validation evidence

Executed from `apps/api`:

```text
corepack pnpm test -- --runInBand src/modules/returns/returns-pricing.helper.spec.ts src/modules/returns/return-idempotency.helper.spec.ts src/modules/pos/pos-quantity.helper.spec.ts
Test Suites: 3 passed, 3 total
Tests:       25 passed, 25 total
```

```text
corepack pnpm type-check
Passed (exit code 0)
```

```text
corepack pnpm exec tsc --noEmit -p test/tsconfig.json
Passed (exit code 0)
```

```text
corepack pnpm build
Passed (exit code 0)
```

Database-backed E2E tests, including the newly added HTTP regression cases and existing idempotency/tenant-isolation cases, were **not run**. `TEST_DATABASE_URL`, `E2E_DATABASE_PASSWORD`, and `E2E_REDIS_PASSWORD` were all unset, so an approved isolated database environment could not be confirmed. No database or production service was accessed, and no browser workflow was run.

Existing unrelated worktree changes were preserved. This implementation did not stage, commit, or push files; the protected `bank-account.helper.ts` and database schema were not changed by this implementation.

## Remaining verification

The helper tests, API type-check, E2E TypeScript compilation, and API build pass. Actual endpoint behavior, database consistency, idempotency, tenant isolation, stock effects, and accounting behavior still require the API E2E suite to run against an explicitly approved isolated test environment. These results do not establish production readiness.
