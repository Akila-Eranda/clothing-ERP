# F-32: UI polish, accessibility and mobile — status and outstanding work

**Measured:** 6 Nov 2026 on the local Podman build of `remediation/2026-11` (headless Chrome, grocery demo shop, widths 390–1920 px). **Severity:** Low (no data or security impact). Nothing in the "outstanding" list has been changed yet.

## Done (fixed and browser-verified; in commit group 6)

| Item | Result |
|---|---|
| Phone header overflowed 59 px (desktop items shown) | header CSS no longer overrides Tailwind `hidden` / `sm:` / `md:` / `lg:`; 0 elements off-screen at 390 px |
| Desktop showed the phone-only search button | hidden where the search box shows |
| "Overlapping search placeholder" (breadcrumb running under the semi-transparent search box) | breadcrumb column clipped with an ellipsis; search box only from 1536 px |
| Search box covered POS / branch buttons below ~1400 px | no overlap at 390, 768, 1024, 1280, 1366, 1440, 1536, 1920 px |
| Products header buttons did not wrap on phones (page scrolled sideways) | buttons wrap; no horizontal scroll |
| Login on a bare host gave no feedback (UI-LOGIN-01 in the audit) | already fixed in existing code: shows "Open your shop login URL" |

## Outstanding

| # | Issue | Where | Users affected | Proposed fix | Effort |
|---|---|---|---|---|---|
| 1 | **POS shows garbled characters**: "â€”" instead of "—", "Â·" instead of "·", "â€¢" instead of "•", "â†’" instead of "→", "â€¦" instead of "…" | `components/pos/pos-overlay.tsx`: 89 sequences in visible text (+18 in comments) | every cashier | re-encode the file as UTF-8 (convert each sequence back; the mapping is mechanical), add `.editorconfig` (`charset = utf-8`), and a lint/CI check rejecting `Ã`/`Â`/`â€` sequences | S |
| 2 | Garbled box-drawing characters in comments | `components/products/standard-product-form.tsx`: 265, comments only | none (developers) | same conversion as #1 | XS |
| 3 | ~~**Header search box does nothing**~~ **DONE 6 Nov** (global search, see search-audit-2026-11.md): no change / submit handler, so typing searches nothing; the search icon only focuses it | `components/layout/header.tsx` | everyone on ≥ 1536 px (box), all sizes (icon) | either a real global search (products, customers, invoices: a new feature, needs an API endpoint), or hide the box / icon until it exists | M (search) / XS (hide) |
| 4 | Row "⋮" action buttons have no accessible name (10 per list page) | `TableActionsRow` from the `react-table-craft` library (re-exported in `components/table/table-actions-row.ts`) | screen-reader and voice-control users | pass an `aria-label` if the library supports it, otherwise wrap the trigger; one change fixes every list page | S |
| 5 | Sidebar Dark Mode switch has no accessible name or state | `components/layout/sidebar.tsx` (the `<button>` next to "Dark Mode") | screen-reader users | `role="switch" aria-checked={isDark} aria-label="Dark mode"` | XS |
| 6 | ~~List search fields are labelled only by placeholder text~~ **DONE 6 Nov** (shared box + 25 custom inputs) | `components/table/table-filter-bar.tsx` (shared by Products, Customers, Journals, …) | screen-reader users | `aria-label={searchPlaceholder}` | XS |
| 7 | "ERP Roadmap" placeholder page reachable by shop users | `/accounting/advanced` ("Command Center" in `sidebar.tsx`; titled "ERP Roadmap" in `lib/shop-vertical.ts`) | shop owners / accountants | hide from shop roles (platform only) or remove from the sidebar | XS |
| 8 | `/accounting/transactions` duplicates "GL Journals" | `sidebar.tsx`, `header.tsx`, `lib/shop-vertical.ts` | accountants (two menu entries for one thing) | keep one entry; redirect the other route | XS |
| 9 | ESLint baseline | web app: 21 errors (13 `no-explicit-any`, 4 unescaped entities, 2 empty object types, …), 227 warnings (169 unused variables, 42 hook dependencies, 10 `<img>`) | none directly | fix the 21 errors first; consider running lint in CI once clean | M |
| 10 | Web builds ignore TypeScript and ESLint errors | `next.config.ts` (`ignoreBuildErrors`, `ignoreDuringBuilds`) | indirectly everyone | switch on once #9 is clean (separate, reviewed change; could block builds) | S |

Effort: XS < 1 h, S ≈ half a day, M ≈ 1–3 days (including tests).

## Suggested order

1. #1 (cashiers see it daily), #5–#6, #4 (accessibility).
2. #7–#8 (navigation clean-up).
3. #3 decision (build search or hide).
4. #9 → #10.
