/**
 * Theme-aware semantic status colours (success / warning / destructive / info) and accessible control borders.
 *
 * The Theme Customizer lets users choose the *fill* colour of each status. These helpers keep that choice as
 * the visual identity and derive the companions that WCAG needs:
 *   fill        – filled backgrounds (buttons, solid badges); darkened only if no foreground reaches AA
 *   foreground  – text on the fill (white when it passes, otherwise dark slate)
 *   text        – the status colour as text/icon on a surface (card/page), shifted just enough for AA
 *   hover       – hover state of the fill (also checked against its foreground)
 *   border      – soft outline for tinted surfaces (decorative)
 */
import { contrastRatio, hexToRgb, mix, rgbToHex, rgbToHslChannels, type RGB } from "./wcag.ts";

export const TEXT_AA = 4.5;
export const UI_BOUNDARY = 3;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
export const DARK_FOREGROUND: RGB = hexToRgb("#1F2937");
export const TINT = 0.15; // share of the status fill laid over the surface for soft badges / alerts
const MARGIN = 0.05; // keep a hair above the line so rounding to hex/HSL never drops under AA

export type StatusKind = "success" | "warning" | "destructive" | "info";

export interface StatusTokens {
  fill: RGB;
  foreground: RGB;
  hover: RGB;
  text: RGB;
  border: string;
}

function shiftUntil(color: RGB, toward: RGB, ok: (c: RGB) => boolean): RGB {
  if (ok(color)) return color;
  for (let a = 0.01; a <= 1; a += 0.01) {
    const c = mix(toward, a, color);
    if (ok(c)) return c;
  }
  return toward;
}

export function deriveStatusTokens(fillHex: string, kind: StatusKind, isDark: boolean, surface: RGB): StatusTokens {
  const base = hexToRgb(fillHex);
  const preferWhite = kind !== "warning";

  let fill = base;
  let foreground: RGB;
  if (preferWhite) {
    fill = shiftUntil(base, BLACK, (c) => contrastRatio(WHITE, c) >= TEXT_AA + MARGIN);
    foreground = WHITE;
  } else if (contrastRatio(DARK_FOREGROUND, base) >= TEXT_AA + MARGIN) {
    foreground = DARK_FOREGROUND;
  } else if (contrastRatio(WHITE, base) >= TEXT_AA + MARGIN) {
    foreground = WHITE;
  } else {
    fill = shiftUntil(base, WHITE, (c) => contrastRatio(DARK_FOREGROUND, c) >= TEXT_AA + MARGIN);
    foreground = DARK_FOREGROUND;
  }

  const hoverTarget = foreground === WHITE ? BLACK : WHITE;
  const hover = shiftUntil(mix(hoverTarget, 0.1, fill), hoverTarget, (c) => contrastRatio(foreground, c) >= TEXT_AA + MARGIN);

  // Text is also used on the status's own tinted surface (badges/alerts: ~15% of the fill over the card), which is the worst case.
  const tinted = mix(fill, TINT, surface);
  const text = shiftUntil(
    base,
    isDark ? WHITE : BLACK,
    (c) => contrastRatio(c, surface) >= TEXT_AA + MARGIN && contrastRatio(c, tinted) >= TEXT_AA + MARGIN,
  );
  const border = `${rgbToHslChannels(text)} / 0.4`;
  return { fill, foreground, hover, text, border };
}

/**
 * Border for interactive controls (input, select, textarea, checkbox, switch track): the soft card border
 * is kept for decoration; controls get the lightest neutral that still reaches 3:1 against the surface.
 */
export function deriveControlBorder(surface: RGB, isDark: boolean): RGB {
  const toward = isDark ? WHITE : BLACK;
  return shiftUntil(surface, toward, (c) => contrastRatio(c, surface) >= UI_BOUNDARY + MARGIN);
}

/**
 * Text colour for a brand/accent colour used as TEXT (links, active labels) on `surface`, also checked on its own
 * tinted surface. Returns the accent unchanged when it already passes.
 */
export function deriveAccentText(accent: RGB, isDark: boolean, surface: RGB): RGB {
  const tinted = mix(accent, TINT, surface);
  return shiftUntil(
    accent,
    isDark ? WHITE : BLACK,
    (c) => contrastRatio(c, surface) >= TEXT_AA + MARGIN && contrastRatio(c, tinted) >= TEXT_AA + MARGIN,
  );
}

/** Readable foreground for text on `fill`: white when it reaches AA, otherwise the dark slate used for warning buttons. */
export function deriveOnColor(fill: RGB): RGB {
  return contrastRatio(WHITE, fill) >= TEXT_AA + MARGIN ? WHITE : DARK_FOREGROUND;
}

export const toHex = rgbToHex;
export const toChannels = rgbToHslChannels;
