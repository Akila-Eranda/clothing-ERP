# HEXALYTE ERP – Global Color System & WCAG Remediation Report

Date: 2026-11-23 · Source of truth: `docs/QA/SYSTEM_COLORS_AUDIT.md` · Scope: `apps/web`
**Nothing was committed, pushed or deployed. Production was not accessed.**

## 1. Initial audit findings (recap)
- 9 of 13 coloured sidebar skins failed AA for muted text, 8 for normal text (Sunset 2.10, Ocean 2.68, Steel 3.20, Lilac 3.19, Mint 3.23, Teal 4.30).
- Light status colours failed as text/fill: success 2.59, warning 2.13, destructive 3.78 (white on fill / text on card).
- Light card border 1.24 and input border 1.34 (vs 3:1 for controls). Muted text on page background 4.38–4.43.
- Dark: blue text on card 3.34; dark sidebar muted 4.02 (**already lifted in `sidebar.tsx` by a `color-mix`; audit finding was stale**, now covered by a test).
- Status customizer values (`--success` etc.) were applied inline by `theme-colors.ts`, so a CSS-only fix would have been overridden. The fix therefore lives in the theme engine as well as in `globals.css`.

## 2. Final token architecture
| Layer | Where | What |
|---|---|---|
| WCAG maths | `src/lib/wcag.ts` | luminance, contrast, mix, gradient sampling (pure, no DOM) |
| Sidebar skins | `src/lib/sidebar-skin-palette.ts` | per skin: samples the real gradient (13 positions), picks light/dark foreground, nudges the gradient only if no foreground reaches AA; outputs css, fg, muted, icon, hover, activeBg, activeFg, border |
| Status + controls | `src/lib/semantic-colors.ts` | from the customizer colour derives `fill`, `foreground`, `hover`, `text`, `border` per status for the active theme; `deriveControlBorder` gives ≥3:1 control borders |
| Runtime | `src/lib/theme-colors.ts` | applies `--{success,warning,destructive,info}` plus `-foreground/-hover/-text/-border`, and `--input` |
| Defaults | `src/app/globals.css` | same tokens for light and dark (used before hydration / without customizer) |
| Tailwind | `tailwind.config.ts` | `success/warning/destructive/info` with `DEFAULT, foreground, hover, text, border` |
| Guard rail | `src/lib/color-guard.test.ts` | parses the real `globals.css` and real skin list |

Principles kept: customizer colour = identity (success green, amber, red, brand blue #2563EB unchanged); no purple/violet brand colour added; no skin removed; layout, spacing and typography untouched.

## 3. All 13 sidebar skins – before / after
Before = audit (white text, worst end stop). After = measured over 13 gradient positions. "Text" = primary label, "Muted" = secondary label/icon, "Active" = label on active pill, "Hover" = muted label on hovered row. Target 4.5.

| Skin | Before text / muted | Original stops | Final stops | Fg | Text | Muted | Active | Hover |
|---|---|---|---|---|---|---|---|---|
| Slate | 7.06 / 4.59 | #505969 | unchanged | white | 7.06 | 6.10 | 4.97 | 5.04 |
| Charcoal | 13.97 / 8.00 | #2C2C2C | unchanged | white | 13.97 | 11.60 | 8.93 | 9.18 |
| Blue | 7.23 / 4.57 | #1D51B6 | unchanged | white | 7.23 | 6.19 | 5.26 | 5.23 |
| Purple | 9.30 / 5.35 | #6C0BA9 | unchanged | white | 9.30 | 7.72 | 7.07 | 6.78 |
| Teal | 4.30 / 2.98 | #0B897D | #096e64 | white | 6.13 | 5.30 | 4.57 | 4.53 |
| Navy grad | 4.89 / 3.38 | #4B749F → #243748 | #406387 → #1f2f3d | white | 6.26 | 5.44 | 4.54 | 4.57 |
| Ocean grad | 2.68 / 2.04 | #18ACCF → #0F59AD | #0f697e → #09366a | white | 6.28 | 5.43 | 4.65 | 4.62 |
| Steel grad | 3.20 / 2.42 | #7D90B8 → #103783 | #525f79 → #0b2456 | white | 6.42 | 5.58 | 4.61 | 4.66 |
| Violet grad | 4.82 / 3.26 | #8E4BEB → #472282 | #7a41ca → #3d1d70 | white | 6.11 | 5.28 | 4.60 | 4.55 |
| Mint grad | 3.23 / 2.39 | #309F92 → #0C5666 | #206b62 → #083a44 | white | 6.29 | 5.45 | 4.61 | 4.61 |
| Sunset grad | 2.10 / 1.71 | #FF9966 → #FF5E62 | unchanged | **#0F172A (dark)** | 5.98 | 5.35 | 4.68 | 4.71 |
| Wine grad | 7.97 / 4.94 | #760762 → #883907 | unchanged | white | 7.97 | 6.78 | 5.72 | 5.70 |
| Lilac grad | 3.19 / 2.40 | #4471CC → #AE7BD4 | #2d4b87 → #73518c | white | 6.39 | 5.55 | 4.63 | 4.66 |

Notes
- Sunset keeps its warm bright look and switches to dark text and the blue logo; the other bright skins keep white text and are darkened by the smallest amount that passes (a test asserts hue drift ≤ 12° per stop). **Ocean, Steel, Lilac and Teal are visibly darker than their swatches**; this is the cost of white text on a light gradient. Swatches in the Theme Customizer still show the original colours.
- Default light sidebar 4.76 (muted #64748B on white) and default dark sidebar chrome (muted lifted to ≈ 5.3) pass.
- Real-browser check (Chrome, production build, 86 visible labels, background sampled along the gradient at each label position): worst label contrast **4.76 (light) / 5.31 (dark) on all 15 skins**, no skin shows missing labels.
- Active/hover/selected: translucent overlays of the foreground (14 % / 8 %). Active vs plain row is distinguished by background, weight and the nested dot/indicator; the overlay alone is not a 3:1 boundary, so it is not claimed as one.
- Also fixed: solid active pill used hard-coded `text-white` (invisible on Sunset), Logout icon was red-500 (poor on gradients) and the sidebar border used white overlays; all now follow the skin tokens.

## 4. Status colours (light / dark), derived from customizer defaults
Contrast of: foreground on fill, foreground on hover, text on card, text on its own 15 % tint (badge/alert).

| Theme | Status | fg/fill | fg/hover | text/card | text/tint |
|---|---|---|---|---|---|
| light | success | 4.63 | 5.50 | 5.60 | 4.60 |
| light | warning (dark fg #1F2937) | 6.83 | 7.36 | 5.14 | 4.59 |
| light | destructive | 4.62 | 5.50 | 5.74 | 4.64 |
| light | info | 5.17 | 6.10 | 5.70 | 4.62 |
| dark | success | 4.63 | 5.50 | 6.81 | 5.87 |
| dark | warning | 6.83 | 7.36 | 8.04 | 6.14 |
| dark | destructive | 4.62 | 5.50 | 5.17 | 4.56 |
| dark | info | 5.17 | 6.10 | 5.22 | 4.57 |

The derivation is also tested for arbitrary customizer colours (yellow, gold, lime, red, cyan, pink, grey, near-black, violet) in both themes, after HSL rounding.
Starting values from the audit were used as a reference, not copied: the fills keep the customizer hue, e.g. success fill is `#0c855d` rather than #047857.

## 5. Form control boundaries
- `--input` (used by `border-input` in Input, Select, Textarea and the Switch track) is now derived to ≥3:1 against the card: light 0 0% 57 % (3.05+), dark 220 2% 41 %. Card/divider borders (`--border`) stay soft.
- Focus ring (`--ring`) vs card/background ≥3:1 in both themes (tested).
- Native checkboxes/radios are not styled by the design system (browser defaults) and were not changed: **NOT VERIFIED** for custom accent colours.

## 6. Files changed (46 modified, 4 new; nothing committed)
New: `lib/wcag.ts`, `lib/semantic-colors.ts`, `lib/sidebar-skin-palette.ts`, `lib/color-guard.test.ts`.
Core: `app/globals.css`, `tailwind.config.ts`, `tsconfig.json` (`allowImportingTsExtensions`, so tests and sources share modules), `lib/theme-colors.ts`, `components/layout/sidebar.tsx`.
Shared UI: `components/ui/button.tsx` (destructive/danger/success/warning use `-foreground`/`-hover` tokens), `badge.tsx` (success/warning/danger/destructive/info/soft*/gold use tokens), `page-kpi.tsx`.
Migration (mechanical `text-destructive` → `text-destructive-text`, 91 replacements): 3 auth pages + 11 dashboard pages + 31 components (full list in `git status`).

## 7. Legacy tokens
- `--tc-*`: retained. Consumers: `globals.css` and `theme-colors.ts` only (set but not read by components I could find); removal was not attempted without an owner decision.
- `--retail-sidebar-*` and the per-skin rules in `retail-theme.css`: retained; the sidebar no longer reads them for coloured skins (it uses `--sb-*` from the resolved palette); other consumers were not audited.
- `--sb-*`: retained and extended with `--sb-solid-fg`.
- Removal of any legacy token: **NOT DONE**.

## 8. Raw colour migration map
| Old | New | Where |
|---|---|---|
| `text-destructive` | `text-destructive-text` | 91 uses in 42 files |
| `bg-destructive text-white hover:bg-destructive/90` | `bg-destructive text-destructive-foreground hover:bg-destructive-hover` | Button |
| `bg-[hsl(var(--success))] text-white` | `bg-success text-success-foreground hover:bg-success-hover` | Button |
| `bg-[hsl(var(--warning))] text-white` | `bg-warning text-warning-foreground hover:bg-warning-hover` | Button |
| `emerald/amber/red-* ` tinted badges | `border-X-border bg-X/10 text-X-text` | Badge |
| emerald/amber/red KPI colours | `text-X-text bg-X/10` | page-kpi |
| `text-primary` (dark) | `.dark .text-primary` → `--accent-foreground` | globals.css (also `hover:`/`focus:`) |
| Logout icon `text-red-500` | skin foreground / `text-destructive-text` | sidebar |
| `--muted-foreground` light | 215 16% 45 %; customizer default `#64748B` → `#5F6F85` (stored old default is migrated, custom values untouched) | globals.css, theme-colors.ts |

Intentionally retained: Badge `purple/violet` (categorical value colours), KPI neutral aliases, chart series colours, `#FFFFFF`-heavy print/receipt templates and product imagery.
**Not migrated (remaining work):** ~1,600 raw `bg/text/border-{red,green,blue,amber,orange,emerald,rose,teal,sky,lime}-N` usages and hard-coded hex values in 51 TSX files outside the shared components. These were not reviewed one by one, so no claim is made about their contrast. `group-hover:`/`peer:` variants of `text-primary` in dark mode are not covered by the CSS override.

## 9. Test results
| Check | Result |
|---|---|
| Web unit tests (`node --test src/lib/**/*.test.ts`) | **155 / 155 pass** (14 new colour tests) |
| New colour guard tests | pass; they parse the real `globals.css`, resolve all 13 real skins and fail on violations (the first run caught the real 4.39 muted-text, tinted-badge and parse problems before they were fixed) |
| TypeScript `tsc --noEmit` | pass, 0 errors |
| ESLint (`next lint`) | no new findings in changed files (1 pre-existing `<img>` warning); the repo already has unrelated pre-existing lint errors/warnings elsewhere |
| Production build (`next build`) | pass (twice, last after the final change) |
| Playwright E2E / axe-core in the web app | **NOT VERIFIED – the repo has no browser E2E suite or axe checks** (only API e2e specs, not run here). A custom Playwright measurement was used instead (below). |
| Real-browser sidebar sweep | 15 skins × light and dark, 1440 px: all labels ≥ 4.76 |

## 10. Remaining accessibility issues
- ~1,600 raw palette classes and hard-coded hex values outside shared components are unaudited (see §8).
- Topbar skins (`topbarcolor*`) share the same gradients and white text; they were **not** changed in this pass and likely have the same low contrast.
- Active-row overlay vs inactive row is not a 3:1 boundary (supported by weight/indicator).
- Checkbox/radio native styling not verified; theme-customizer custom accent/background combinations can still produce low contrast outside the derived tokens (primary text, sidebar default light accent).
- Dark-mode filled success/warning buttons are green/amber with white / dark text as derived above; visually slightly darker green than before (#10B981 → ≈ #0c855d).
- Dashboard charts and data visualisations were deliberately not changed and not re-audited.

## 11. Visual verification
Chrome via Playwright on the production build with seeded data (local, throw-away DB):
- 1440 px: default light, default dark, all 13 coloured skins in light and dark (screenshots reviewed: Sunset, Ocean).
- 820 px (icon-only rail by design): default, Sunset, Ocean screenshots reviewed (Ocean shown).
- 390 px (mobile drawer): default, Sunset, Ocean screenshots captured (Sunset reviewed): labels, active item, search, footer buttons readable.
- Theme persistence and theme switching (skin via stored layout preference, dark via stored theme) applied correctly on every load; an interactive customizer click-through and hover/collapsed states were **NOT VERIFIED** beyond what the screenshots show. Form controls, status badges and charts were not screenshotted in this pass (**NOT VERIFIED visually**; covered by token tests only).

## 12. Confirmation
No `git commit`, `git push`, deployment or production access took place. All changes are uncommitted working-tree edits in `apps/web` plus this report.
