/**
 * Reusable WCAG 2.1 contrast utilities (pure, no DOM). Used by the sidebar skin palette
 * and by the automated colour guard-rail tests.
 */

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** "H S% L%" (shadcn channel format) -> RGB. */
export function hslChannelsToRgb(channels: string): RGB {
  const m = channels.match(/-?[\d.]+/g)?.map(Number) ?? [];
  const h = m[0] ?? 0;
  const s = (m[1] ?? 0) / 100;
  const l = (m[2] ?? 0) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function relativeLuminance([r, g, b]: RGB): number {
  const c = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Linear mix: `amount` of `fg` over `bg` (alpha compositing for opaque bg). */
export function mix(fg: RGB, amount: number, bg: RGB): RGB {
  return [0, 1, 2].map((i) => fg[i] * amount + bg[i] * (1 - amount)) as RGB;
}

/** Colour at position t (0..1) on a straight gradient between stops (sRGB interpolation, as browsers do). */
export function sampleStops(stops: RGB[], t: number): RGB {
  if (stops.length === 1) return stops[0];
  const pos = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  return mix(stops[i + 1], pos - i, stops[i]);
}

/** Worst (lowest) contrast of `fg` over `samples` evenly spaced points of the gradient. */
export function worstContrast(fg: RGB, stops: RGB[], samples = 11): number {
  let worst = Infinity;
  for (let k = 0; k < samples; k++) worst = Math.min(worst, contrastRatio(fg, sampleStops(stops, k / (samples - 1))));
  return worst;
}

/** Worst contrast of a (possibly translucent) overlay colour composited on the gradient, against that same gradient point. */
export function worstContrastWithAlpha(fg: RGB, alpha: number, stops: RGB[], samples = 11): number {
  let worst = Infinity;
  for (let k = 0; k < samples; k++) {
    const bg = sampleStops(stops, k / (samples - 1));
    worst = Math.min(worst, contrastRatio(mix(fg, alpha, bg), bg));
  }
  return worst;
}

/** RGB -> "H S% L%" (rounded, shadcn channel format). */
export function rgbToHslChannels([r, g, b]: RGB): string {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
