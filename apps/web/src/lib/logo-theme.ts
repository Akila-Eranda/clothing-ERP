import { hexToRgb } from "@/lib/theme-colors";
import type { ThemeColorsState } from "@/lib/theme-colors";
import { getSidebarSkinChromePatch, type SidebarSkin } from "@/lib/theme-layout";

const LOGO_LUMINANCE_THRESHOLD = 0.45;

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** Pull every #hex from a solid color or gradient CSS value. */
export function extractHexColors(css: string): string[] {
  const matches = css.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
  return matches.map((h) => (h.length === 4 ? expandShortHex(h) : h));
}

function expandShortHex(hex: string): string {
  const c = hex.slice(1);
  return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
}

export function isDarkChromeBackground(bg: string): boolean {
  const trimmed = bg.trim();
  if (!trimmed) return false;

  const hexes = extractHexColors(trimmed);
  if (hexes.length === 0) {
    const rgb = hexToRgb(trimmed);
    if (!rgb) return false;
    return relativeLuminance(rgb.r, rgb.g, rgb.b) < LOGO_LUMINANCE_THRESHOLD;
  }

  const avg =
    hexes.reduce((sum, hex) => {
      const rgb = hexToRgb(hex);
      return sum + (rgb ? relativeLuminance(rgb.r, rgb.g, rgb.b) : 0.5);
    }, 0) / hexes.length;

  return avg < LOGO_LUMINANCE_THRESHOLD;
}

/** Resolve the effective sidebar chrome background (matches theme-colors chromeFromPatch). */
export function resolveSidebarChromeBg(
  sidebarSkin: SidebarSkin,
  colors: ThemeColorsState,
  isDarkMode: boolean,
): string {
  const patch = getSidebarSkinChromePatch(sidebarSkin, isDarkMode);

  if (isDarkMode) {
    const bgCss = (patch.darkChromeBgCss ?? colors.darkChromeBgCss).trim();
    return bgCss || patch.darkChromeBg || colors.darkChromeBg;
  }

  const bgCss = (patch.lightChromeBgCss ?? colors.lightChromeBgCss).trim();
  return bgCss || patch.lightChromeBg || colors.lightChromeBg;
}

/** True → white logo; false → blue INNOVATION logo. */
export function resolveSidebarLogoOnDark(
  sidebarSkin: SidebarSkin,
  colors: ThemeColorsState,
  isDarkMode: boolean,
): boolean {
  const bg = resolveSidebarChromeBg(sidebarSkin, colors, isDarkMode);
  return isDarkChromeBackground(bg);
}
