/** Small WCAG helpers used to keep text on accent colours readable for any Theme Customizer accent. */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contrast ratio of an "H S% L%" colour against white. */
export function contrastOnWhite(hslChannels: string): number {
  const [h, s, l] = parseChannels(hslChannels);
  return 1.05 / (luminance(hslToRgb(h, s, l)) + 0.05);
}

function parseChannels(hslChannels: string): [number, number, number] {
  const m = hslChannels.match(/-?[\d.]+/g)?.map(Number) ?? [];
  if (m.length < 3 || m.some((n) => Number.isNaN(n))) return [221, 0.83, 0.53];
  return [m[0], m[1] / 100, m[2] / 100];
}

/**
 * Returns the accent unchanged when white on it already meets `minRatio`; otherwise lowers the
 * lightness just enough to reach it. The approved brand blue (#2563EB) therefore stays untouched.
 */
export function accentForWhiteText(hslChannels: string, minRatio = 4.5): string {
  const [h, s, l0] = parseChannels(hslChannels);
  let l = l0;
  while (l > 0.05 && 1.05 / (luminance(hslToRgb(h, s, l)) + 0.05) < minRatio) l -= 0.01;
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${(l * 100).toFixed(1)}%)`;
}
