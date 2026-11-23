# HEXALYTE ERP – System Colors Audit

Date: 2026-11-23 · Scope: `apps/web` (tokens in `globals.css`, `retail-theme.css`, `theme-layout.ts`, `components/layout/sidebar.tsx`)
Method: token values read from source, WCAG 2.1 contrast computed with a script (text 4.5:1, UI borders 3:1). Gradients are checked at their worst stop. No code was changed by this audit.

## 1. Summary

| Area | Result |
|---|---|
| Core text (foreground / card, light + dark) | PASS (14:1) |
| Muted text | PASS on cards, marginal on page background (light 4.38) |
| Brand primary (white on blue) | PASS (5.17) |
| Success / Warning / Destructive as button or text colour (light) | **FAIL** (2.1 – 3.8) |
| Borders / input borders (light) | **FAIL** vs 3:1 UI rule (1.24 / 1.34) |
| Sidebar default light + dark | PASS except dark muted (4.02) |
| Sidebar coloured skins | **8 of 13 FAIL** on normal text, **9 of 13 FAIL** on muted text |
| Colour consistency in components | Mixed: tokens and hard-coded colours used side by side |

Most important finding: the sidebar skins Sunset, Ocean, Steel, Mint, Lilac and Teal render white text on light gradients. Sunset muted text is 1.71:1, which is effectively invisible. This matches the "sidebar text not showing" complaint when one of these skins is selected.

## 2. Token inventory

- Palette is HSL CSS variables, light in `:root`, dark in `.dark` (plus a legacy `--tc-*` set for the theme customizer).
- Brand: primary `221 83% 53%` (#2563EB), hover `224 76% 48%` (#1D4ED8). Same primary in light and dark.
- Status: success `160 84% 39%` (#10B981), warning `38 92% 50%` (#F59E0B), destructive `0 84% 60%` (#EF4444), info = primary. Same values in both modes.
- Surfaces light: background #F5F7FA, card #FFFFFF, border #E5E7EB. Dark: background `220 13% 7%`, card `220 13% 11%`, border `220 13% 18%`.
- Sidebar: separate `--sidebar-*` and `--sb-*` vars. Default light = white, default dark = DreamsPOS chrome (#0d0d0d, fg #d8dfee, muted #6b7280, active #60a5fa). 13 coloured skins (`SIDEBAR_SKIN_SWATCHES`) force white text.

## 3. Contrast results

### Light mode
| Pair | Ratio | Verdict |
|---|---|---|
| foreground on card | 14.00 | PASS |
| foreground on background | 13.06 | PASS |
| muted-foreground on card | 4.70 | PASS |
| muted-foreground on background | 4.38 | FAIL (just under) |
| white on primary | 5.17 | PASS |
| primary text on card | 5.17 | PASS |
| white on destructive / destructive text on card | 3.78 | FAIL |
| white on success / success text on card | 2.59 | FAIL |
| white on warning / warning text on card | 2.13 | FAIL |
| border on card | 1.24 | FAIL (UI 3:1) |
| input border on card | 1.34 | FAIL (UI 3:1) |

### Dark mode
| Pair | Ratio | Verdict |
|---|---|---|
| foreground on card | 14.32 | PASS |
| muted-foreground on card / background | 6.73 / 7.36 | PASS |
| white on primary | 5.17 | PASS |
| primary (#2563EB) as TEXT on card | 3.34 | FAIL (use accent-foreground, 6.07) |
| destructive / success / warning text on card | 4.57 / 6.66 / 8.09 | PASS |
| white on success / warning (filled buttons) | 2.59 / 2.13 | FAIL |

### Sidebar
| Skin | White text | Muted text (white 72%) |
|---|---|---|
| Default light (#64748B on white) | 4.76 PASS | – |
| Default dark (muted #6b7280 on #0d0d0d) | 14.54 PASS | 4.02 FAIL |
| Slate | 7.06 PASS | 4.59 PASS |
| Charcoal | 13.97 PASS | 8.00 PASS |
| Blue | 7.23 PASS | 4.57 PASS |
| Purple | 9.30 PASS | 5.35 PASS |
| Wine grad | 7.97 PASS | 4.94 PASS |
| Navy grad | 4.89 PASS | 3.38 FAIL |
| Violet grad | 4.82 PASS | 3.26 FAIL |
| Teal | 4.30 FAIL | 2.98 FAIL |
| Mint grad | 3.23 FAIL | 2.39 FAIL |
| Lilac grad | 3.19 FAIL | 2.40 FAIL |
| Steel grad | 3.20 FAIL | 2.42 FAIL |
| Ocean grad | 2.68 FAIL | 2.04 FAIL |
| Sunset grad | 2.10 FAIL | 1.71 FAIL |

## 4. Consistency findings

- Semantic Tailwind tokens (`bg-primary`, `text-muted`, `border-border`, …) are used about 4,200 times, but raw palette classes are still common: emerald ~540, red ~400, amber ~390, slate ~170, blue ~170, violet ~150, gray ~110, indigo ~65 (all 100+ hits are in `.tsx`). Status colours therefore do not all come from the same source and will not follow a theme change.
- Hard-coded hex values appear in 51 `.tsx` files. Most frequent: #FFFFFF (154), #EF4444 (38), #10B981 (38), #64748B (33), #0F172A (31), #475569, #3B82F6, #94A3B8. Several (#EF4444, #10B981, #2563EB) duplicate tokens; others (#6A8AB8, #8B5CF6, #6366F1, #7C3AED, #4F46E5) are off-palette accents, so there are at least 5 purple/indigo variants.
- Two token systems coexist (`--tc-*` and the main set) plus `--retail-sidebar-*` and `--sb-*`, which makes it hard to know the source of a colour.
- Success/warning/destructive use the same value in light and dark, so they are tuned for neither.

## 5. Recommendations (priority order)

1. **Sidebar coloured skins (High).** Make text colour depend on the background: compute luminance per skin and use dark text (#0F172A) on Sunset/Ocean/Steel/Mint/Lilac/Teal, or darken those gradients so white text passes 4.5. Raise muted from white 72% to ~85% for all skins.
2. **Status colours for text and filled buttons (High).** Introduce darker "on-light" shades, e.g. success #047857 (white on it ≈ 5.5), destructive #DC2626 (4.83), warning text #B45309 (5.0). Keep warning filled buttons with dark text (#1F2937) instead of white.
3. **Borders (Medium).** Keep the soft card border for decoration, but give input and control borders ≥ 3:1 (about `220 9% 60%` in light mode).
4. **Dark sidebar muted (Low).** Change #6b7280 to #8b94a5 (≈ 6:1).
5. **Dark mode primary text (Low).** Use `accent-foreground` (214 100% 65%) for blue links/text instead of #2563EB.
6. **Consolidate colours (Medium, ongoing).** Replace hard-coded hex and raw palette classes for status colours with tokens (`success`, `warning`, `destructive`, `info`), collapse the purple/indigo variants to one accent, and retire the legacy `--tc-*` set.
7. **Guard rail.** Add a unit test that runs the contrast script over tokens and skins so new skins cannot ship below 4.5:1.

## 6. Limits of this audit

Computed from source tokens, not screenshots of every page. Components that use hard-coded colours were counted, not individually reviewed. Gradients were tested at their end stops only, which is conservative for text placed in the middle. The contrast script lives in the session scratchpad and is not committed.
