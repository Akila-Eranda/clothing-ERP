# HEXALYTE ERP – Final Accessibility Completion Report

Date: 2026-11-23 · Builds on `GLOBAL_COLOR_SYSTEM_REMEDIATION_REPORT.md` · Scope: `apps/web`
**Nothing was committed, pushed or deployed. Production was not accessed.** All browser checks ran against a local production build (`next build` + `next start`) with a throw-away Postgres/Redis and seeded data, in Chrome driven by Playwright. Local servers and containers were stopped and removed afterwards.

## 0. Summary
| Item | Result |
|---|---|
| 1 Topbar skins | **Fixed.** All 15 topbar skins × light/dark: 30/30 measured runs have 0 violations (min text 4.58, min icon 3.29). |
| 2 Raw palette audit | Classified; 1,139 of 2,208 raw classes (52 %) were converted to tokens (the total fell to 1,069). 215 semantic-status classes remain raw (unreviewed). |
| 3 Charts | Axis/tooltip text verified AA; series colours **not changed**; some series fail 3:1 on white (documented, non-colour indicators exist). |
| 4 Form controls | Switch fixed (thumb/track 3:1); focus outline added for all interactive roles; native checkbox/radio: accent colour set, **no checkbox/radio instance exercised in a browser (NOT VERIFIED)**. |
| 5 Customizer in browser | Tested end to end; found and fixed a **real bug** (topbar skin overwrote sidebar colours). |
| 6 Dark-mode variants | `text-primary` variants covered by CSS + a test that fails when a new variant is used without coverage. |
| 7 Verification | 161/161 unit tests, `tsc` 0 errors, production build OK, ESLint: no findings on changed lines. axe-core executed (see §9). **POS terminal page still has contrast findings.** |

## 1. Topbar colour audit
Before (Playwright pixel measurement with only the sidebar resolver in place, header CSS untouched; 15 elements: breadcrumb, branch pill, POS/Desktop buttons, 4 icons, profile): every coloured skin failed. Example worst values: breadcrumb/"Main" 1.16–2.45, icons 1.05–1.58 (e.g. Teal "Main" 1.16, Ocean 1.52, Sunset 1.82). The original topbar used fixed white text on the swatch gradients (same numbers as the sidebar audit: Sunset 2.10, Ocean 2.68, Steel 3.20 …), plus white-on-brand-blue controls hard-coded in `retail-theme.css`.

Fix: `resolveTopbarChrome` (theme-colors.ts) now resolves every coloured topbar through the same gradient-sampling resolver as the sidebar; `retail-theme.css` gained a scoped block so the branch pill, Desktop button, live pill, icon buttons, profile chip, breadcrumb, search hint and focus outline use `--retail-topbar-*` (fg/muted/border/hover) on coloured skins. Default light branch pill text uses `--primary-hover` (4.48 → ≥ 5), default dark header muted text/chevron/branch pill use AA tokens.

After (final build, real pixels sampled behind each text/icon, gradient respected):
| Skin | Light text / icon (min) | Dark text / icon (min) |
|---|---|---|
| White (default) | 5.17 / 3.36 | ≥ 4.58 / ≥ 3.29 |
| Snow | 4.67 / 3.29 | same |
| Slate | 5.07 / 4.83 | same |
| Charcoal, Blue, Purple | 5.17 / 5.09–5.17 | same |
| Teal | 4.58 / 4.47 | same |
| Navy, Ocean, Steel, Violet, Mint, Wine | 5.17 / 5.17 | same |
| Sunset | 4.77 / 5.17 | same |
| Lilac | 4.72 / 5.11 | same |
Targets: text 4.5, icons 3. (Per-run results are in the Playwright output; summary: 30 runs, 0 violations.)
Not measured per element: hover/active states of header controls were measured only for the icon-button hover (text ≥ 5.17, icon ≥ 3.36). The logo image is a raster asset and was not measured; the logo variant follows the foreground tone on the **sidebar** only.

Automated test: `color-guard.test.ts` → "all 13 coloured topbar skins …" asserts the topbar swatches equal their sidebar twins and that the resolved palette meets AA for text, muted text and hover rows.

## 2. Raw palette usage audit
Method: scripted classification of every Tailwind raw colour class in `.tsx` (2,208 occurrences before). Rules: neutrals (slate/gray/zinc…) = decorative/text, left alone; classes inside chart/print/receipt/label/QR/brand files or on chart attribute lines (`fill=`, `stroke=`, `<Cell>`…) = retained; lines on dark surfaces = retained; gradients = decorative; violet/purple/pink = decorative accent; red/green/amber families = semantic status; blue/sky/cyan = primary family; hover/focus variants = interactive.

| Class | Before | After | Action |
|---|---|---|---|
| Semantic status (red/rose, green/emerald, amber/yellow/orange) | ~1,126 (text 510, tints 295, solid 49+…) | 215 | text 500–800 → `text-{status}-text` (524), `bg/border-X-500/NN` tints → tokens (~390), solid fill + white text → `bg-X text-X-foreground` (20), paired `dark:text-*` removed |
| Interactive state (hover/focus) | 52 | 31 | hover/focus text variants migrated with the above |
| Primary-family (blue) text on `bg-primary/10..20` tints | 163 | 195 (re-counted) | 47 lines → `text-primary-text` (AA on tint) |
| Chart / print / brand | 320 | 64 | retained (series colours, receipts) |
| Decorative gradients / accents (violet, pink…) | 254 | 281 | retained |
| Neutral | 283 | 283 | retained |
| **Total raw classes** | **2,208** | **1,069** | |
Caveat: the category rows use slightly different exclusion rules in the "before" and "after" runs (the later run only retains chart-attribute lines in chart-hosting files, so the chart/print/brand row shrinks and the others grow); only the **total** is directly comparable. Migration counts: 569 lines in 120 files (pass 1), 101 lines in 6 chart-hosting files (pass 2, non-chart-attribute lines only), 47 primary-tint lines in 36 files. Files with token migrations are listed by `git diff --stat` (162 files changed under `apps/web` in total, 1,207 insertions / 929 deletions, almost all single class swaps).
Not done / remaining: 215 raw semantic classes (mostly `bg-X-50/100/200` surfaces, borders, solid fills without `text-white` on the same line) and 195 blue/primary-family classes were not individually reviewed; 5 files with receipt/print/label/brand names were skipped deliberately. Hex colours in 51 TSX files were not migrated (POS terminal palette, print templates, charts). No blind global replace was used; each rule was scripted, dry-run first, then type-checked.
Behaviour notes: red text is slightly darker (`#EF4444` → ≈ `#BB3535` light), WALLET/orange chips on the sales page became the warning amber with dark text.

## 3. Charts
- Text: axis ticks `#64748b` on white 4.76, `#94a3b8` on dark card ≥ 7; tooltip text ≥ 13 (both themes). Covered by an automated test (`chart-colors.ts` is now the single source for `useChartTheme`).
- Series colours (identity, unchanged): 14 colours in use. On a white card several are below 3:1 as filled shapes (e.g. `#10B981` 2.5, `#F59E0B` 2.1, `#F97316`, `#84CC16`, `#14B8A6`); `#6366F1`, `#8B5CF6`, `#3B82F6`, `#64748B`, `#EF4444` pass. **Not changed**, to keep the meaning of the charts.
- Non-colour indicators present: legends with text and values next to every donut/series, tooltips, axis labels, tabular data in Reports. No patterns were added; this is a known limitation.
- axe-core reported **0** colour-contrast violations on `/dashboard` (4 themes) and 0 for text in the charts' surrounding widgets after the fixes below. axe cannot judge SVG fills.
- Fixed on the dashboard (legacy "dp" CSS): success/danger/orange text and badges (`#10b981` 2.53 / `#ef4444` 3.76 → AA tokens), dark-mode blue links (3.46 → AA), dark badge fills.

## 4. Native form controls
Measured in Chrome on `/settings` (5 `role=switch` instances):
| Control | Light | Dark |
|---|---|---|
| Radix Switch unchecked: track vs card / thumb vs track | 3.15 / 3.15 (before: 3.15 / 2.94) | 3.12 / 3.12 |
| Radix Switch checked | 5.17 / 5.17 | 3.47 / 3.47 |
| Sidebar dark-mode switch (custom) | 4.34 / 4.76 (before 1.36 / 1.48) | 4.26 / 5.66 (before 2.83) |
- Keyboard focus: previously `ring-primary/20–40` shadows (≈ 1.2–2.2:1). Now a solid 2px outline in `--ring` (≥ 3:1, tested), skin foreground inside the sidebar and coloured topbar. Tab walk (4 theme/skin combinations, 40 sidebar stops + header + main): all stops had a solid ≥ 2px outline (the only exception was a `md:hidden` button that is not focusable at 1440px).
- Disabled controls keep the existing `opacity-50` (exempt from contrast rules); not measured.
- Checkbox/radio: `accent-color: hsl(var(--primary))` applied globally; existing components already used `accent-primary`. **No checkbox or radio was present on the pages I exercised, so checked/unchecked/hover were NOT VERIFIED in a browser.**
- Custom accent colours (Colors tab, real UI): yellow `#ffd700`, cyan `#00e5ff`, violet, near-black — before: white button text 1.39 / 1.53; after: `--primary-foreground` picks AA text (10.55 / 9.54 / 5.67 / 18.76) and `--primary-text` ≥ 5.1 on cards in both themes. Primary Button variants and 5 raw `bg-primary text-white` lines now use `text-primary-foreground`.

## 5. Theme customizer – browser results (final build)
Driven through the real UI (FAB → tabs → swatches), no page errors:
- Topbar: 15 swatches clicked → `data-topbar` updated each time; header measured each time: 0 violations.
- Sidebar: 15 swatches clicked → 0 violations each (min text 4.58 on Teal, worst of 42 elements).
- Persistence: Topbar=Ocean + Sidebar=Sunset survived a reload (`data-topbar`, `data-sidebar`, measurements unchanged); light↔dark via the customizer persisted across reload.
- Status colours: Success `#FFFF00`, Warning `#FFFFFF`, Destructive `#00FF00`, Info `#FFD700` entered in the Colors tab → derived tokens all AA (e.g. fg/fill 4.5–14.6, text/card 4.6–17.9) in light and dark. "Reset to defaults" restored skins and tokens (`--success` back to `160 84% 28%`).
- Collapsed sidebar (68 px, default / Sunset / Ocean): icons ≥ 4.76; hover state on a nav item and header icon measured: no violations.
- **Bug found and fixed (not a contrast issue):** choosing any coloured topbar skin wrote that skin's palette into the shared light-chrome colour store, so the default light sidebar rendered the topbar's gradient with white text (ratios ≈ 1.0–2.3). It persisted in `localStorage` and also happened when returning to the Light sidebar from a coloured one. Fix in `stores/theme-layout-store.ts`: the topbar no longer patches shared chrome; leaving a coloured sidebar skin restores the default light chrome; a leaked palette (gradient CSS, or unreadable text/background) is repaired on load. This is a plausible root cause of the earlier "sidebar text not showing" report.

## 6. Dark-mode variant coverage
- Runtime defaults, not only `globals.css`, decide what users see: `DEFAULT_THEME_COLORS.darkMutedForeground` (`#6B7280`, 3.7:1 on the dark card) overrode the CSS token and caused the largest class of axe findings (≈ 16–25 per page in dark mode). Default is now `#9AA3B2` (stored old default is migrated, custom values kept). A new test reads these runtime defaults.
- `.dark .text-primary`, `hover:`, `focus:`, `group-hover:`, `data-[state=active]:`, and `/60`/`/80` opacity variants use `--primary-text` (derived AA token, also used by the dashboard, branch pill, section tabs). The test `every text-primary variant used in the app has a dark-mode override` fails if a new variant appears without a rule.
- `peer-*` and `disabled:` text-primary variants: none exist in the code base today; the test will flag them if added.
- Selected/active: section tabs and segment controls use `--primary-text` on their tint (was 4.49).

## 7. Automated tests and checks
| Check | Result |
|---|---|
| Web unit tests (`node --test src/lib/**/*.test.ts`) | **161 / 161 pass** |
| `color-guard.test.ts` | **20 / 20 pass**: light+dark tokens, status/accents (arbitrary customizer colours), control border, focus ring, 13 sidebar skins, 13 topbar skins, chart text, runtime defaults, text-primary dark coverage, focus CSS presence |
| TypeScript `tsc --noEmit` | 0 errors |
| ESLint (`next lint`) | 249 findings in the repo (20 errors, 229 warnings), **0 on changed lines**; baseline at `HEAD` not measured |
| Production build | passes (final build after the last source change) |
| Browser contrast (pixel-based, own Playwright harness, not committed) | sidebar 30/30, topbar 30/30, customizer flows, collapsed sidebar |
| axe-core | **Executed** — v4.11.4 (transitive dependency in `node_modules`, injected with Playwright; not a repo test) |
The harness scripts live in the session scratchpad and were not added to the repo.

### axe-core results (WCAG 2 A/AA tags, 10 pages × 4 themes = 40 scans)
Pages: dashboard, inventory, sales, products, customers, settings, POS, purchases, reports, expenses. Themes: light default, dark default, Sunset sidebar+topbar, Ocean sidebar+topbar.
| | Before this pass (first scan of 7 pages × 4 themes) | Final |
|---|---|---|
| `color-contrast` | 0–8 per page light, **16–25 per page dark**, POS 17 | **34 of 40 scans have 0**; remaining 40 nodes: POS (9–10 per scan, 4 scans), Reports (1 node in 2 Sunset/Ocean scans, muted label 4.18–4.37) |
| Other rules (not colour; pre-existing, not touched) | `button-name` 70 nodes, `svg-img-alt` 32, `label` 20, `select-name` 14 | unchanged |

## 8. Remaining known limitations
1. **POS terminal page** (`/pos`): its own dark-navy palette (`lib/pos-ui-theme.ts`, `pos-ui-colors.ts`, accent `#4f6ef7`) still has 9–10 contrast findings (accent text 3.2–4.0, `opacity-50` text 2.6, red-400 on navy 4.36, white on accent 4.28). Not changed because the POS has its own colour customizer and layout; needs a dedicated pass.
2. Chart series colours below 3:1 on white (see §3); no patterns added.
3. 215 raw semantic-colour classes and 195 blue-family classes not reviewed; hex colours in 51 TSX files outside the shared components.
4. Reports page: one muted label at 4.18–4.37 in the Sunset/Ocean runs (not located in code).
5. Native checkbox/radio states and disabled controls not measured in a browser.
6. axe-core structural findings (button names, SVG alt text, select/label names) exist on most pages and were out of scope.
7. Logo raster images were not contrast-measured; the sidebar logo variant follows the foreground tone.
8. Legacy `--tc-*`, `--retail-sidebar-*` tokens still exist (no removal attempted).
9. Ocean, Steel, Lilac and Teal sidebar/topbar gradients are visibly darker than their swatches (needed for AA with white text).
10. `apps/api/src/modules/pos/pos.module.ts` is also modified in the working tree; **that change is not from this work** (a cashier role check) and was not touched.

## 9. Safety confirmation
No `git commit`, `git push`, deployment or production access occurred. All changes are uncommitted edits in `apps/web` (plus the new `lib/chart-colors.ts`, `wcag.ts`, `semantic-colors.ts`, `sidebar-skin-palette.ts`, `color-guard.test.ts` and the three reports under `docs/QA`). No tests were disabled; failing checks found during the work (muted text 4.39, tinted badges, runtime default 3.7:1, leaked chrome palette) were fixed in the product code and are now guarded by tests.
