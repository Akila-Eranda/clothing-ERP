/**
 * Accessible colour resolution for the coloured sidebar skins.
 *
 * The swatch colours in `SIDEBAR_SKIN_SWATCHES` define each skin's visual identity. For every skin we
 * measure the actual gradient at several positions, pick the foreground (light or dark) that reads best,
 * and — only when no foreground reaches the target on the original colours — nudge the gradient toward
 * black (for light text) or white (for dark text) by the smallest amount that passes. Nothing silently
 * falls back to white text.
 */
import {
  contrastRatio,
  hexToRgb,
  mix,
  rgbToHex,
  worstContrast,
  worstContrastWithAlpha,
  type RGB,
} from "./wcag.ts";

export const SIDEBAR_TEXT_TARGET = 4.5;
/** Safety margin so rounding and gradient interpolation never land under AA. */
const TARGET = 4.55;
const SAMPLES = 13;

const LIGHT_FG: RGB = [255, 255, 255];
const DARK_FG: RGB = hexToRgb("#0F172A");

/** Overlay strengths (share of the foreground colour laid over the skin). */
export const MUTED_ALPHA = 0.9; // secondary text / icons
export const HOVER_ALPHA = 0.08;
export const ACTIVE_ALPHA = 0.14;
export const BORDER_ALPHA = 0.2;

export interface ResolvedSidebarSkin {
  /** Final CSS background (original gradient with stops adjusted only if needed). */
  css: string;
  /** Adjusted stop colours, in source order. */
  stops: string[];
  tone: "light-text" | "dark-text";
  /** True when the original colours had to be nudged to reach AA. */
  adjusted: boolean;
  fg: string;
  muted: string;
  icon: string;
  hover: string;
  activeBg: string;
  activeFg: string;
  border: string;
}

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

function rgba(c: RGB, a: number): string {
  return `rgba(${c.map((v) => Math.round(v)).join(",")},${a})`;
}

/** All contrast pairs a skin must satisfy for a given foreground. Returns the worst ratio. */
function worstForFg(fg: RGB, stops: RGB[]): number {
  return Math.min(
    worstContrast(fg, stops, SAMPLES), // primary labels
    worstContrastWithAlpha(fg, MUTED_ALPHA, stops, SAMPLES), // muted labels & icons
    worstOnOverlay(fg, stops, ACTIVE_ALPHA, 1), // active label on the active pill
    worstOnOverlay(fg, stops, HOVER_ALPHA, MUTED_ALPHA), // muted label on a hovered row
  );
}

/** Contrast of `fg` (at `fgAlpha`) over the skin with a fg-coloured overlay of `overlayAlpha`. */
function worstOnOverlay(fg: RGB, stops: RGB[], overlayAlpha: number, fgAlpha: number): number {
  let worst = Infinity;
  for (let k = 0; k < SAMPLES; k++) {
    const t = k / (SAMPLES - 1);
    const pos = t * (stops.length - 1);
    const i = Math.min(Math.floor(pos), Math.max(stops.length - 2, 0));
    const base = stops.length === 1 ? stops[0] : mix(stops[i + 1], pos - i, stops[i]);
    const row = mix(fg, overlayAlpha, base);
    worst = Math.min(worst, contrastRatio(mix(fg, fgAlpha, row), row));
  }
  return worst;
}

function shift(stops: RGB[], toward: RGB, amount: number): RGB[] {
  return stops.map((s) => mix(toward, amount, s));
}

export function resolveSidebarSkin(css: string): ResolvedSidebarSkin {
  const original = css.match(HEX_RE) ?? [];
  const base = original.map(hexToRgb);
  if (base.length === 0) throw new Error(`Skin has no hex colour stops: ${css}`);

  // 1. Pick the better foreground on the untouched colours.
  const lightScore = worstForFg(LIGHT_FG, base);
  const darkScore = worstForFg(DARK_FG, base);
  let tone: ResolvedSidebarSkin["tone"] = lightScore >= darkScore ? "light-text" : "dark-text";
  let stops = base;
  let adjusted = false;

  // 2. If the best foreground still misses the target, move the background the smallest amount.
  if (Math.max(lightScore, darkScore) < TARGET) {
    const find = (fg: RGB, toward: RGB): { amount: number; stops: RGB[] } => {
      for (let a = 0.01; a <= 0.9; a += 0.01) {
        const next = shift(base, toward, a);
        if (worstForFg(fg, next) >= TARGET) return { amount: a, stops: next };
      }
      return { amount: 1, stops: base };
    };
    const darker = find(LIGHT_FG, [0, 0, 0]);
    const lighter = find(DARK_FG, [255, 255, 255]);
    // White text is the established look of coloured skins: keep it unless darkening would change the skin far more than lightening.
    if (darker.amount <= lighter.amount * 1.6) {
      tone = "light-text";
      stops = darker.stops;
    } else {
      tone = "dark-text";
      stops = lighter.stops;
    }
    adjusted = true;
  }

  const fgRgb = tone === "light-text" ? LIGHT_FG : DARK_FG;
  const newHex = stops.map(rgbToHex);
  let i = 0;
  const outCss = adjusted ? css.replace(HEX_RE, () => newHex[i++]) : css;

  return {
    css: outCss,
    stops: newHex,
    tone,
    adjusted,
    fg: rgbToHex(fgRgb),
    muted: rgba(fgRgb, MUTED_ALPHA),
    icon: rgba(fgRgb, MUTED_ALPHA),
    hover: rgba(fgRgb, HOVER_ALPHA),
    activeBg: rgba(fgRgb, ACTIVE_ALPHA),
    activeFg: rgbToHex(fgRgb),
    border: rgba(fgRgb, BORDER_ALPHA),
  };
}

/** Scores used by tests/reports: worst ratios across SAMPLES positions for a resolved skin. */
export function measureSidebarSkin(r: ResolvedSidebarSkin) {
  const stops = r.stops.map(hexToRgb);
  const fg = hexToRgb(r.fg);
  return {
    text: worstContrast(fg, stops, SAMPLES),
    muted: worstContrastWithAlpha(fg, MUTED_ALPHA, stops, SAMPLES),
    active: worstOnOverlay(fg, stops, ACTIVE_ALPHA, 1),
    hoverMuted: worstOnOverlay(fg, stops, HOVER_ALPHA, MUTED_ALPHA),
  };
}
