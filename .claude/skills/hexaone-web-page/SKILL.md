---
name: hexaone-web-page
description: Build or change Next.js frontend screens in apps/web of the HexaOne ERP — dashboard pages, modals, tables, forms, sidebar entries, POS UI. Use whenever editing apps/web/src so pages use the shared Button/Table modules, the api client, module gating and the existing theme instead of ad-hoc UI.
---

# HexaOne web conventions (apps/web)

Stack: Next.js 15 App Router, React 19, TypeScript, Tailwind + shadcn-style components, TanStack Table, Zustand stores, sonner toasts, next-intl (`messages/en.json`), lucide-react icons. Alias `@/` → `apps/web/src/`.

## Where things go
- Tenant app pages: `src/app/(dashboard)/<route>/page.tsx` (`"use client"`). Auth pages: `src/app/(auth)`. Platform admin: `src/app/admin`. POS full screen + customer display: `src/app/pos`, components in `src/components/pos`.
- Feature components: `src/components/<domain>/` (e.g. `components/brands/add-brand-modal.tsx`). Pure logic: `src/lib/*.ts`. Global state: `src/stores/*-store.ts` (auth, branch, cart, ui, theme).

## Mandatory shared modules (from .cursor/rules/shared-ui-modules.mdc)
```ts
import { Button } from "@/components/ui/button";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
```
Button variants — never hard-code `bg-emerald-600` etc.:
| Use | Variant |
|---|---|
| Primary | `default` |
| Secondary / cancel / refresh | `outline` |
| Positive confirm | `success` |
| Warning | `warning` |
| Hard destructive | `danger` |
| Soft destructive | `destructive` |
| Icon only | `ghost` + `size="icon-sm"` |
| Filter chips | `chip` idle, `success` selected |

Other shared UI: `PageKpiGrid` (`ui/page-kpi`), `TableStatusBadge`, `EmptyState`, `ModalFooter`, `Dialog`/`Sheet`, `Badge`, `Tabs`.
Exceptions: POS shell (`--pos-*` tokens, `pos-layouts.css`), print/receipt HTML, cart line editors, financial statement layouts.

## Data access
- Always go through `api` from `@/lib/api` (`api.get/post/put/patch/delete`). It attaches the bearer token, `x-tenant-id`, `x-branch-id`, POS cashier/counter headers and handles refresh. Never call `fetch`/`axios` directly to the API.
- Responses are `{ success, data, meta }`; normalise lists with `parseApiList` (`@/lib/parse-api-list`).
- Errors → `toast.error(...)`; success → `toast.success(...)`.

## Vertical & permission gating
- Wrap vertical-only pages in `<ModuleGate>` (`@/components/shop/module-gate`) and add sidebar items via `hasShopModule(profile, "<module>")` in `components/layout/sidebar.tsx`.
- Vertical copy/labels come from `@/lib/shop-vertical` (`getSidebarLabels`, `get*PageCopy`) and `useShopWorkspace()` / `useShopProfile` — don't hard-code "Product"/"Item" wording per vertical.
- Permission-driven visibility: `@/lib/role-access.ts`, `@/lib/workflow-access.ts`.

## Reference page
`src/app/(dashboard)/brands/page.tsx` shows the full pattern: column builder with `DataTableColumnHeader`, `ClientSideTable`, KPI grid, add/edit modal, CSV import, ModuleGate, vertical copy.

## POS-specific helpers (don't duplicate)
`pos-weight.ts` (gram ↔ kg qty), `pos-barcode.ts` (scan normalisation/lookup), `pos-totals.ts`, `pos-settings.ts`, `pos-layouts.ts` + `pos-layout-contract.ts` (6 layouts), `pos-customer-display.ts`, `receipt-print.ts`, `stores/cart-store.ts`.

## Verify
```bash
cd apps/web
pnpm type-check
pnpm lint
pnpm build        # catches server/client boundary + route errors
```
For visual checks run `pnpm dev` (port 3000, API at `NEXT_PUBLIC_API_URL`, default http://localhost:3001/api/v1).
