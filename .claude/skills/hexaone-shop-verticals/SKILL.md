---
name: hexaone-shop-verticals
description: Add or change a HexaOne business vertical (ShopType such as GROCERY / supermarket, CLOTHING, HARDWARE) or a per-vertical module flag, default categories, units, variant presets, labels or return reasons. Use whenever a feature should appear only for some shop types, or when tailoring the product for supermarkets.
---

# Shop verticals & module flags

A tenant's `shopType` (Prisma enum `ShopType` on `Tenant`) selects a `ShopProfile`: default categories, units, variant attributes, label templates, and `modules` booleans (brands, variants, returns, promotions, loyalty, expiry, batch, quotations, workshop, …). The supermarket edition is the **GROCERY** profile ("Supermarket, mini-mart — weight, volume, expiry tracking").

## The profile is defined in THREE places — keep them identical
1. `apps/api/src/shared/shop-profiles.ts` — source of truth (backend).
2. `apps/web/src/lib/shop-profiles.ts` — frontend mirror (same content, different header comment).
3. `apps/api/prisma/src/shared/shop-profiles.js` — compiled copy used by the seed bundle.
After editing, diff 1 vs 2: `diff apps/api/src/shared/shop-profiles.ts apps/web/src/lib/shop-profiles.ts` — only the header comment should differ.

## Adding a module flag
1. Add the key to `ShopProfile['modules']` and set it for **every** ShopType (TypeScript will fail otherwise) — in both files.
2. Backend gate: `await assertShopModule(this.prisma, tenantId, 'myModule')` (`@/shared/shop-module.helper`) at the top of service methods.
3. Frontend gate: sidebar item `...(hasShopModule(profile, "myModule") ? [ ... ] : [])` in `components/layout/sidebar.tsx`; page wrapped in `<ModuleGate>`.
4. Feature lists/marketing: `apps/web/src/lib/shop-features.ts` (`VERTICAL_FEATURES`) and `erp-capabilities.ts`.

## Adding a new ShopType (e.g. SUPERMARKET split from GROCERY)
1. Prisma enum `ShopType` + migration `ALTER TYPE "ShopType" ADD VALUE IF NOT EXISTS 'SUPERMARKET';` (see `hexaone-prisma-schema`, precedent: `20260707190000_shop_type_general`).
2. Profile entry in all three shop-profiles files.
3. Per-vertical copy & logic in `apps/web/src/lib/shop-vertical.ts` (return reasons, sidebar labels, page copy), `shop-workspace.ts`.
4. Tenant registration list: `GET /tenants/shop-types` reads `SHOP_TYPE_LIST` — confirm it exports profile objects.
5. Grep for exhaustive switches: `grep -rn "ShopType\.\(GROCERY\|BAKERY\)" apps/` and handle the new type everywhere GROCERY is handled.
6. Update `docs/sales-agent.md` business-type section.

Prefer extending GROCERY with flags over a new ShopType unless the boss explicitly wants a separate vertical — fewer branches to keep in sync.

## Grocery/supermarket facts already in code
- Units `pcs, kg, g, L, ml`; default unit `kg`; variant attribute `Weight` (250g…5kg).
- Modules on: brands, variants, returns, promotions, expiry, batch. Off: loyalty, quotations, collections, hang tags, workshop/vehicle/fashion modules.
- Return reasons add `EXPIRED`, `QUALITY_ISSUE`.
- Label templates: `sticker`, `shelf`.
