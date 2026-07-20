/** Thermal / browser receipt color themes — light = black on white (printer default), dark = white on navy. */

export type ReceiptThemeMode = "light" | "dark";

export type ReceiptThemeColors = {
  bg: string;
  fg: string;
  muted: string;
  rule: string;
  saveBorder: string;
  barcodePad: string;
};

export function resolveReceiptTheme(mode?: string | null): ReceiptThemeMode {
  return mode === "dark" ? "dark" : "light";
}

export function receiptThemeColors(mode?: string | null): ReceiptThemeColors {
  if (resolveReceiptTheme(mode) === "dark") {
    return {
      bg: "#0f172a",
      fg: "#f8fafc",
      muted: "#94a3b8",
      rule: "#64748b",
      saveBorder: "#94a3b8",
      barcodePad: "#ffffff",
    };
  }
  return {
    bg: "#ffffff",
    fg: "#000000",
    muted: "#000000",
    rule: "#000000",
    saveBorder: "#000000",
    barcodePad: "transparent",
  };
}

/** Shared CSS block for POS thermal / browser receipt HTML. */
export function receiptThemeStyleBlock(opts: {
  paperWidth: string;
  fontSize: string;
  theme?: string | null;
}): string {
  const c = receiptThemeColors(opts.theme);
  const pw = opts.paperWidth === "58mm" ? "58mm" : "80mm";
  const fs =
    opts.fontSize === "small" ? "11px" : opts.fontSize === "large" ? "14px" : "12px";
  return `*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${c.bg}!important;color:${c.fg}!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Courier New',monospace;font-size:${fs};padding:6mm;max-width:${pw};margin:0 auto}
h1{font-size:1.4em;font-weight:900;text-align:center;color:${c.fg}}
sub{font-size:0.85em;display:block;text-align:center;margin-bottom:1px;color:${c.muted}}
.d{border:none;border-top:1px dashed ${c.rule};margin:5px 0}
.row{display:flex;justify-content:space-between;margin:2px 0;font-size:0.9em;color:${c.fg}}
.iname{font-size:0.9em;font-weight:bold;margin-top:4px;color:${c.fg}}
.tot{display:flex;justify-content:space-between;font-size:1.15em;font-weight:900;border-top:2px solid ${c.rule};padding-top:4px;margin-top:4px;color:${c.fg}}
.save{display:flex;justify-content:space-between;margin:6px 0 2px;font-size:0.95em;font-weight:900;color:${c.fg};border:1px dashed ${c.saveBorder};padding:4px 6px}
.bc{text-align:center;margin:8px 0 4px;padding:6px 4px;background:${c.barcodePad};border-radius:2px}
.bc svg{max-width:100%;height:auto;display:inline-block}
.foot{text-align:center;margin-top:8px;font-size:0.8em;line-height:1.6;color:${c.muted}}
@media print{@page{margin:0;size:${pw} auto}html,body{background:${c.bg}!important;color:${c.fg}!important}body{padding:3mm}}`;
}
