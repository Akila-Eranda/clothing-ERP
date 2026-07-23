/** Thermal / browser receipt color themes — light = black on white (printer default), dark = white on navy. */

/** Fixed credit line printed at the bottom of every thermal sale receipt. */
export const RECEIPT_SOFTWARE_CREDIT = "Software by Hexalyte Innovation 0703130100";

export function receiptSoftwareCreditHtml(): string {
  return `<div class="soft">${RECEIPT_SOFTWARE_CREDIT}</div>`;
}

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
    muted: "#333333",
    rule: "#000000",
    saveBorder: "#000000",
    barcodePad: "transparent",
  };
}

/** Format LKR amounts for thermal receipts. */
export function receiptMoney(n: number): string {
  return `LKR ${n.toFixed(2)}`;
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
    opts.fontSize === "small" ? "11px" : opts.fontSize === "large" ? "14px" : "12.5px";
  return `*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${c.bg}!important;color:${c.fg}!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Courier New',Courier,monospace;font-size:${fs};line-height:1.35;padding:4mm 3.5mm;max-width:${pw};margin:0 auto;letter-spacing:0}
.hdr{text-align:center;margin-bottom:2px}
.logo{max-width:72px;max-height:48px;display:block;margin:0 auto 6px;object-fit:contain}
.shop,.hdr h1,h1{font-size:1.35em;font-weight:900;text-align:center;letter-spacing:0.04em;text-transform:uppercase;color:${c.fg};line-height:1.2;margin:0}
.tag,.hdr .tag{font-size:0.82em;display:block;text-align:center;margin:2px 0 0;color:${c.muted};font-weight:600}
.info,sub{font-size:0.8em;display:block;text-align:center;margin:1px 0;color:${c.muted};line-height:1.4}
.badge{display:block;text-align:center;font-size:0.78em;font-weight:900;letter-spacing:0.18em;text-transform:uppercase;margin:8px 0 2px;padding:3px 0;border-top:1px solid ${c.rule};border-bottom:1px solid ${c.rule};color:${c.fg}}
.badge.warn{letter-spacing:0.08em}
.d,.rule{border:none;border-top:1px dashed ${c.rule};margin:7px 0}
.dbl{border:none;border-top:2px solid ${c.rule};margin:7px 0}
.meta{margin:2px 0 0}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin:2px 0;font-size:0.88em;color:${c.fg}}
.row span:first-child{flex:1;min-width:0;color:${c.muted}}
.row span:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:${c.fg}}
.row b,.row strong{color:${c.fg};font-weight:800}
.sec{font-size:0.72em;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;margin:2px 0 4px;color:${c.fg}}
.item{margin:0 0 5px;padding:0}
.iname{font-size:0.9em;font-weight:800;margin:0 0 1px;color:${c.fg};word-break:break-word;line-height:1.25}
.irow{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:0.86em;color:${c.fg}}
.irow .q{color:${c.muted};flex:1;min-width:0}
.irow .a{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap}
.disc{display:flex;justify-content:space-between;font-size:0.8em;margin:1px 0 0;padding-left:8px;color:${c.muted}}
.sums{margin-top:2px}
.tot{display:flex;justify-content:space-between;align-items:center;font-size:1.12em;font-weight:900;border-top:2px solid ${c.rule};border-bottom:2px solid ${c.rule};padding:6px 0;margin:6px 0 4px;color:${c.fg};letter-spacing:0.02em}
.tot span:last-child{font-variant-numeric:tabular-nums}
.save{display:flex;justify-content:space-between;margin:6px 0 2px;font-size:0.9em;font-weight:800;color:${c.fg};border:1px dashed ${c.saveBorder};padding:5px 7px}
.pay{margin:2px 0}
.bc{text-align:center;margin:10px 0 4px;padding:8px 4px 4px;background:${c.barcodePad};border-top:1px dashed ${c.rule};border-bottom:1px dashed ${c.rule}}
.bc svg{max-width:100%;height:auto;display:inline-block}
.foot{text-align:center;margin-top:8px;font-size:0.82em;line-height:1.55;color:${c.muted};font-weight:600}
.foot.strong{font-weight:900;color:${c.fg};letter-spacing:0.04em;text-transform:uppercase;font-size:0.78em}
.soft{text-align:center;margin-top:8px;padding-top:4px;border-top:1px dotted ${c.rule};font-size:0.62em;line-height:1.4;color:${c.muted};opacity:0.95;letter-spacing:0.02em}
@media print{@page{margin:0;size:${pw} auto}html,body{background:${c.bg}!important;color:${c.fg}!important}body{padding:2.5mm 2mm}}`;
}
