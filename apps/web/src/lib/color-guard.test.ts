// Run: pnpm --filter ./apps/web test:unit
// Colour guard-rail: fails when a token or sidebar skin violates WCAG 2.1 AA.
// Token values are parsed from the real globals.css; skins are resolved from the real swatch list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { contrastRatio, hexToRgb, hslChannelsToRgb, mix, rgbToHslChannels, type RGB } from "./wcag.ts";
import { deriveAccentText, deriveControlBorder, deriveOnColor, deriveStatusTokens, TINT, type StatusKind } from "./semantic-colors.ts";
import { measureSidebarSkin, resolveSidebarSkin } from "./sidebar-skin-palette.ts";
import { SIDEBAR_SKIN_SWATCHES, TOPBAR_SKIN_SWATCHES } from "./theme-layout.ts";
import { CHART_CHROME } from "./chart-colors.ts";

const TEXT = 4.5;
const UI = 3;

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
/** The design-system block for `selector` is the one that defines `--card` (there is also a legacy `--tc-*` block). */
function block(selector: string): Record<string, string> {
  let from = 0;
  for (;;) {
    const start = css.indexOf(selector, from);
    assert.ok(start >= 0, `design-system block ${selector} not found in globals.css`);
    const open = css.indexOf("{", start);
    const end = css.indexOf("}", open);
    const body = css.slice(open, end);
    if (/--card:/.test(body)) {
      const vars: Record<string, string> = {};
      for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].replace(/\/\*.*?\*\//g, "").trim();
      return vars;
    }
    from = start + selector.length;
  }
}

const THEMES = { light: block(":root {"), dark: block(".dark {") } as const;
const rgb = (t: Record<string, string>, name: string): RGB => {
  assert.ok(t[name], `token --${name} missing`);
  return hslChannelsToRgb(t[name].split("/")[0]);
};
const fmt = (n: number) => n.toFixed(2);

function check(label: string, ratio: number, min: number, failures: string[]) {
  if (ratio < min) failures.push(`${label}: ${fmt(ratio)} < ${min}`);
}

for (const mode of ["light", "dark"] as const) {
  const t = THEMES[mode];

  test(`${mode}: core text pairs meet AA`, () => {
    const f: string[] = [];
    check("foreground/background", contrastRatio(rgb(t, "foreground"), rgb(t, "background")), TEXT, f);
    check("foreground/card", contrastRatio(rgb(t, "card-foreground"), rgb(t, "card")), TEXT, f);
    check("muted-foreground/card", contrastRatio(rgb(t, "muted-foreground"), rgb(t, "card")), TEXT, f);
    check("muted-foreground/background", contrastRatio(rgb(t, "muted-foreground"), rgb(t, "background")), TEXT, f);
    check("primary-foreground/primary", contrastRatio(rgb(t, "primary-foreground"), rgb(t, "primary")), TEXT, f);
    check("popover-foreground/popover", contrastRatio(rgb(t, "popover-foreground"), rgb(t, "popover")), TEXT, f);
    assert.deepEqual(f, [], f.join("\n"));
  });

  test(`${mode}: status tokens (fill, foreground, text, hover) meet AA`, () => {
    const f: string[] = [];
    const card = rgb(t, "card");
    const pt = rgb(t, "primary-text");
    check("primary-text on card", contrastRatio(pt, card), TEXT, f);
    check("primary-text on its tint", contrastRatio(pt, mix(rgb(t, "primary"), TINT, card)), TEXT, f);
    check("primary-text on page background", contrastRatio(pt, rgb(t, "background")), TEXT, f);
    for (const k of ["success", "warning", "destructive", "info"]) {
      const fill = rgb(t, k), fg = rgb(t, `${k}-foreground`), hover = rgb(t, `${k}-hover`), text = rgb(t, `${k}-text`);
      check(`${k} foreground on fill`, contrastRatio(fg, fill), TEXT, f);
      check(`${k} foreground on hover`, contrastRatio(fg, hover), TEXT, f);
      check(`${k} text on card`, contrastRatio(text, card), TEXT, f);
      check(`${k} text on tinted surface`, contrastRatio(text, mix(fill, TINT, card)), TEXT, f);
      check(`${k} text on page background`, contrastRatio(text, rgb(t, "background")), TEXT, f);
    }
    assert.deepEqual(f, [], f.join("\n"));
  });

  test(`${mode}: interactive control boundary and focus ring reach 3:1`, () => {
    const f: string[] = [];
    check("input border/card", contrastRatio(rgb(t, "input"), rgb(t, "card")), UI, f);
    check("focus ring/card", contrastRatio(rgb(t, "ring"), rgb(t, "card")), UI, f);
    check("focus ring/background", contrastRatio(rgb(t, "ring"), rgb(t, "background")), UI, f);
    assert.deepEqual(f, [], f.join("\n"));
  });

  test(`${mode}: sidebar tokens meet AA`, () => {
    const f: string[] = [];
    const bg = rgb(t, "sidebar-background");
    check("sidebar-foreground/bg", contrastRatio(rgb(t, "sidebar-foreground"), bg), TEXT, f);
    check("sidebar-accent-foreground/accent", contrastRatio(rgb(t, "sidebar-accent-foreground"), rgb(t, "sidebar-accent")), TEXT, f);
    assert.deepEqual(f, [], f.join("\n"));
  });
}

test("derived status tokens meet AA for every customizer default in both themes (after HSL rounding)", () => {
  const f: string[] = [];
  const defaults: Array<[StatusKind, string]> = [
    ["success", "#10B981"], ["warning", "#F59E0B"], ["destructive", "#EF4444"], ["info", "#2563EB"],
  ];
  for (const mode of ["light", "dark"] as const) {
    const card = rgb(THEMES[mode], "card");
    for (const [k, hex] of defaults) {
      const d = deriveStatusTokens(hex, k, mode === "dark", card);
      const round = (c: RGB) => hslChannelsToRgb(rgbToHslChannels(c)); // what the browser actually receives
      check(`${mode} ${k} fg/fill`, contrastRatio(round(d.foreground), round(d.fill)), TEXT, f);
      check(`${mode} ${k} fg/hover`, contrastRatio(round(d.foreground), round(d.hover)), TEXT, f);
      check(`${mode} ${k} text/card`, contrastRatio(round(d.text), card), TEXT, f);
    }
  }
  assert.deepEqual(f, [], f.join("\n"));
});

test("derived status tokens stay accessible for arbitrary customizer colours", () => {
  const f: string[] = [];
  const samples = ["#FFFF00", "#FFD700", "#00FF00", "#FF0000", "#00B7FF", "#FF69B4", "#9CA3AF", "#111111", "#7C3AED"];
  for (const mode of ["light", "dark"] as const) {
    const card = rgb(THEMES[mode], "card");
    for (const hex of samples) for (const k of ["success", "warning", "destructive", "info"] as StatusKind[]) {
      const d = deriveStatusTokens(hex, k, mode === "dark", card);
      check(`${mode} ${k}(${hex}) fg/fill`, contrastRatio(d.foreground, d.fill), TEXT, f);
      check(`${mode} ${k}(${hex}) text/card`, contrastRatio(d.text, card), TEXT, f);
    }
  }
  assert.deepEqual(f, [], f.join("\n"));
});

test("control border helper reaches 3:1 on light and dark surfaces", () => {
  const f: string[] = [];
  const cases: Array<[string, boolean]> = [
    ["#FFFFFF", false], ["#F5F7FA", false], ["#E5E7EB", false],
    ["#16181D", true], ["#0D0D0D", true], ["#334155", true],
  ];
  for (const [hex, dark] of cases) {
    const s = hexToRgb(hex);
    check(`control border on ${hex} (${dark ? "dark" : "light"})`, contrastRatio(deriveControlBorder(s, dark), s), UI, f);
  }
  assert.deepEqual(f, [], f.join("\n"));
});

test("all coloured sidebar skins: text, muted text, active and hover rows meet AA across the gradient", () => {
  const coloured = SIDEBAR_SKIN_SWATCHES.filter((s) => s.id !== "light" && s.id !== "sidebarcolorone");
  assert.equal(coloured.length, 13, "expected 13 coloured sidebar skins");
  const f: string[] = [];
  for (const skin of coloured) {
    const r = resolveSidebarSkin(skin.css);
    const m = measureSidebarSkin(r);
    check(`${skin.label} text`, m.text, TEXT, f);
    check(`${skin.label} muted text`, m.muted, TEXT, f);
    check(`${skin.label} active label`, m.active, TEXT, f);
    check(`${skin.label} muted label on hover`, m.hoverMuted, TEXT, f);
  }
  assert.deepEqual(f, [], f.join("\n"));
});

test("sidebar skin identity: adjusted stops keep the original hue family", () => {
  for (const skin of SIDEBAR_SKIN_SWATCHES.filter((s) => s.id !== "light" && s.id !== "sidebarcolorone")) {
    const r = resolveSidebarSkin(skin.css);
    const original = (skin.css.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map(hexToRgb);
    r.stops.map(hexToRgb).forEach((c, i) => {
      const hue = (rgb: RGB) => parseInt(rgbToHslChannels(rgb), 10);
      const d = Math.abs(hue(c) - hue(original[i]));
      assert.ok(Math.min(d, 360 - d) <= 12, `${skin.label}: hue drifted ${d}° at stop ${i}`);
    });
  }
});

test("default light / dark sidebar chrome meets AA", () => {
  const f: string[] = [];
  check("light fg", contrastRatio(hexToRgb("#0F172A"), hexToRgb("#FFFFFF")), TEXT, f);
  check("light muted", contrastRatio(hexToRgb("#64748B"), hexToRgb("#FFFFFF")), TEXT, f);
  check("light active", contrastRatio(hexToRgb("#2563EB"), hexToRgb("#EFF6FF")), TEXT, f);
  // dark chrome: muted is #6B7280 lifted 50% toward #CBD5E1 (see sidebar.tsx)
  const darkBg = hexToRgb("#0D0D0D");
  check("dark fg", contrastRatio(hexToRgb("#D8DFEE"), darkBg), TEXT, f);
  check("dark muted (lifted)", contrastRatio(mix(hexToRgb("#CBD5E1"), 0.5, hexToRgb("#6B7280")), darkBg), TEXT, f);
  check("dark active", contrastRatio(hexToRgb("#60A5FA"), darkBg), TEXT, f);
  assert.deepEqual(f, [], f.join("\n"));
});

test("all 13 coloured topbar skins: header text, muted text and hover rows meet AA across the gradient", () => {
  const topbar = TOPBAR_SKIN_SWATCHES.filter((s) => s.id !== "white" && s.id !== "topbarcolorone");
  assert.equal(topbar.length, 13, "expected 13 coloured topbar skins");
  const f: string[] = [];
  for (const skin of topbar) {
    // theme-colors.ts resolves the topbar through the same resolver as the sidebar, using the same swatch css
    const sidebar = SIDEBAR_SKIN_SWATCHES.find((s) => s.id === skin.id.replace("topbar", "sidebar"));
    assert.ok(sidebar, `no sidebar twin for ${skin.id}`);
    assert.equal(skin.css, sidebar.css, `${skin.id} swatch differs from its sidebar twin`);
    const m = measureSidebarSkin(resolveSidebarSkin(skin.css));
    check(`${skin.label} topbar text`, m.text, TEXT, f);
    check(`${skin.label} topbar muted`, m.muted, TEXT, f);
    check(`${skin.label} topbar hover`, m.hoverMuted, TEXT, f);
  }
  assert.deepEqual(f, [], f.join("\n"));
});

test("chart text and tooltip colours meet AA in both themes", () => {
  const f: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    const c = CHART_CHROME[mode];
    check(`${mode} axis tick/surface`, contrastRatio(hexToRgb(c.tick), hexToRgb(c.surface)), TEXT, f);
    check(`${mode} tooltip text/bg`, contrastRatio(hexToRgb(c.tooltipColor), hexToRgb(c.tooltipBg)), TEXT, f);
  }
  assert.deepEqual(f, [], f.join("\n"));
});

test("every text-primary variant used in the app has a dark-mode override in globals.css", () => {
  // Brand blue (#2563EB) is 3.3:1 on the dark card, so dark mode must re-colour it; this fails when a new variant is used without coverage.
  const files: string[] = [];
  const walk = (dir: URL) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const u = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
      if (e.isDirectory()) walk(u);
      else if (e.name.endsWith(".tsx")) files.push(readFileSync(u, "utf8"));
    }
  };
  walk(new URL("../", import.meta.url));
  const used = new Set<string>();
  for (const src of files) for (const m of src.matchAll(/[^\s"'`]*text-primary[^\s"'`]*/g)) {
    if (m[0].includes("text-primary-")) continue; // text-primary-foreground etc.
    used.add(m[0]);
  }
  const required: Record<string, string> = {
    "text-primary": String.raw`.dark .text-primary`,
    "hover:text-primary": String.raw`.dark .hover\:text-primary:hover`,
    "focus:text-primary": String.raw`.dark .focus\:text-primary:focus`,
    "group-hover:text-primary": String.raw`.group-hover\:text-primary`,
    "data-[state=active]:text-primary": String.raw`data-\[state\=active\]\:text-primary`,
    "text-primary/80": String.raw`.dark .text-primary\/80`,
    "hover:text-primary/80": String.raw`hover\:text-primary\/80`,
    "text-primary/60": String.raw`.dark .text-primary\/60`,
  };
  const missing: string[] = [];
  for (const u of used) {
    const need = required[u];
    if (!need) missing.push(`${u}: no dark-mode rule defined for this variant`);
    else if (!css.includes(need)) missing.push(`${u}: globals.css lacks ${need}`);
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("runtime theme defaults (DEFAULT_THEME_COLORS) meet AA — these override globals.css at runtime", () => {
  // theme-colors.ts is applied inline on :root, so its defaults, not only globals.css, decide what users see.
  const src = readFileSync(new URL("./theme-colors.ts", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("export const DEFAULT_THEME_COLORS"));
  const hex = (key: string) => {
    const m = block.match(new RegExp(String.raw`\b${key}:\s*"(#[0-9A-Fa-f]{6})"`));
    assert.ok(m, `DEFAULT_THEME_COLORS.${key} not found`);
    return hexToRgb(m[1]);
  };
  const f: string[] = [];
  for (const mode of ["light", "dark"] as const) {
    const M = mode === "light" ? "light" : "dark";
    const cap = (k: string) => `${M}${k}`;
    for (const surface of ["Background", "Card"]) {
      check(`${mode} foreground/${surface}`, contrastRatio(hex(cap("Foreground")), hex(cap(surface))), TEXT, f);
      check(`${mode} muted-foreground/${surface}`, contrastRatio(hex(cap("MutedForeground")), hex(cap(surface))), TEXT, f);
    }
  }
  check("light chrome text", contrastRatio(hex("lightChromeFg"), hex("lightChromeBg")), TEXT, f);
  check("light chrome muted", contrastRatio(hex("lightChromeMuted"), hex("lightChromeBg")), TEXT, f);
  check("dark chrome text", contrastRatio(hex("darkChromeFg"), hex("darkChromeBg")), TEXT, f);
  assert.deepEqual(f, [], f.join("\n"));
});

test("keyboard focus: globals.css defines a solid 2px ring-coloured outline for interactive roles, and skins override it", () => {
  assert.match(css, /button:focus-visible[\s\S]{0,400}outline:\s*2px solid hsl\(var\(--ring\)\)\s*!important/, "base focus outline missing");
  assert.match(css, /\.hex-retail-sidebar a:focus-visible[\s\S]{0,300}outline-color:\s*var\(--sb-fg\)/, "sidebar focus colour must follow the skin foreground");
  assert.match(css, /\.hex-retail-header a:focus-visible[\s\S]{0,300}outline-color:\s*var\(--retail-topbar-fg\)/, "coloured topbar focus colour must follow the topbar foreground");
});

test("custom brand accents: button text and accent-as-text stay AA for any accent colour", () => {
  const f: string[] = [];
  const accents = ["#FFD700", "#00E5FF", "#FFFF00", "#7C3AED", "#111111", "#FF69B4", "#2563EB", "#84CC16", "#F97316", "#FFFFFF", "#000000"];
  for (const mode of ["light", "dark"] as const) {
    const card = rgb(THEMES[mode], "card");
    for (const hex of accents) {
      const fill = hexToRgb(hex);
      check(`${mode} accent ${hex}: foreground on fill`, contrastRatio(deriveOnColor(fill), fill), TEXT, f);
      const text = deriveAccentText(fill, mode === "dark", card);
      check(`${mode} accent ${hex}: accent text on card`, contrastRatio(text, card), TEXT, f);
      check(`${mode} accent ${hex}: accent text on its tint`, contrastRatio(text, mix(fill, TINT, card)), TEXT, f);
    }
  }
  assert.deepEqual(f, [], f.join("\n"));
});
