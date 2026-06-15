import JsBarcode from "jsbarcode";
import {
  printTagBarcodeValue,
  printTagBaseCode,
  sanitizeBarcodeText,
} from "@/lib/pos-barcode";

export type LabelFormat = "sticker" | "hangtag" | "shelf";

export interface PrintTagItem {
  productName: string;
  variantName: string;
  sku: string;
  unitCost: number;
  variant?: {
    barcode?: string | null;
    sellingPrice: number;
    color?: string | null;
    size?: string | null;
    style?: string | null;
    material?: string | null;
    product?: {
      barcode?: string | null;
      tags?: string[];
    };
  };
}

const SYSTEM_TAG_PREFIXES = ["unit:", "exp:", "batch:"];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function variantDisplayLine(item: PrintTagItem): string {
  const v = item.variant;
  const parts = [v?.size, v?.material, v?.color, v?.style].filter(Boolean);
  return parts.length ? parts.join(" / ") : item.variantName;
}

function tagsLine(item: PrintTagItem): string {
  const tags = (item.variant?.product?.tags ?? []).filter(
    (t) => t.trim() && !SYSTEM_TAG_PREFIXES.some((p) => t.startsWith(p)),
  );
  return tags.length ? tags.join(" · ") : "";
}

export function barcodeSvgMarkup(value: string): string {
  const safe = sanitizeBarcodeText(value);
  if (!safe) return "";
  if (typeof document === "undefined") {
    return `<span style="font-family:monospace;font-size:11px;font-weight:bold">${escapeHtml(safe)}</span>`;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, safe, {
      format: "CODE128",
      width: 1.2,
      height: 28,
      displayValue: true,
      fontSize: 8,
      margin: 1,
    });
    return svg.outerHTML;
  } catch {
    return `<span style="font-family:monospace;font-size:11px;font-weight:bold">${escapeHtml(safe)}</span>`;
  }
}

function labelPageSize(format: LabelFormat): string {
  if (format === "hangtag") return "60mm 100mm";
  if (format === "shelf") return "100mm 35mm";
  return "60mm 40mm";
}

function stickerHtml(item: PrintTagItem, shopName: string, serial: number): string {
  const barcodeVal = printTagBarcodeValue(printTagBaseCode(item), serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const variantLine = variantDisplayLine(item);
  const tags = tagsLine(item);
  return `
    <div class="label sticker">
      <p class="shop">${escapeHtml(shopName)}</p>
      <div class="head">
        <p class="name">${escapeHtml(item.productName)}</p>
        <p class="price">LKR ${price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</p>
      </div>
      ${variantLine ? `<p class="variant">${escapeHtml(variantLine)}</p>` : ""}
      ${tags ? `<p class="tags">${escapeHtml(tags)}</p>` : ""}
      <div class="barcode">${barcodeSvgMarkup(barcodeVal)}</div>
    </div>`;
}

function hangtagHtml(item: PrintTagItem, shopName: string, serial: number): string {
  const barcodeVal = printTagBarcodeValue(printTagBaseCode(item), serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const tags = tagsLine(item);
  const size = item.variant?.size;
  const color = item.variant?.color;
  return `
    <div class="label hangtag">
      <div class="band">${escapeHtml(shopName)}</div>
      <p class="name">${escapeHtml(item.productName)}</p>
      ${size || color ? `<p class="chips">${size ? `<span>${escapeHtml(size)}</span>` : ""}${color ? `<span>${escapeHtml(color)}</span>` : ""}</p>` : ""}
      ${tags ? `<p class="tags">${escapeHtml(tags)}</p>` : ""}
      <p class="price">LKR ${price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</p>
      <div class="barcode">${barcodeSvgMarkup(barcodeVal)}</div>
      <p class="code">${escapeHtml(barcodeVal)}</p>
    </div>`;
}

function shelfHtml(item: PrintTagItem, shopName: string, serial: number, unit?: string): string {
  const barcodeVal = printTagBarcodeValue(printTagBaseCode(item), serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const variantLine = variantDisplayLine(item);
  const tags = tagsLine(item);
  return `
    <div class="label shelf">
      <div class="band">${escapeHtml(shopName)}${unit ? `<span>/${escapeHtml(unit)}</span>` : ""}</div>
      <div class="row">
        <div>
          <p class="name">${escapeHtml(item.productName)}</p>
          ${variantLine ? `<p class="variant">${escapeHtml(variantLine)}</p>` : ""}
          ${tags ? `<p class="tags">${escapeHtml(tags)}</p>` : ""}
        </div>
        <p class="price">${price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</p>
      </div>
      <div class="barcode">${barcodeSvgMarkup(barcodeVal)}</div>
    </div>`;
}

function labelHtml(format: LabelFormat, item: PrintTagItem, shopName: string, serial: number, unit?: string): string {
  if (format === "hangtag") return hangtagHtml(item, shopName, serial);
  if (format === "shelf") return shelfHtml(item, shopName, serial, unit);
  return stickerHtml(item, shopName, serial);
}

/** Build HTML document for direct / store-server label printing (one label per page). */
export function buildPrintTagsHtml(opts: {
  shopName: string;
  format: LabelFormat;
  labels: Array<{ item: PrintTagItem; serial: number }>;
  unit?: string;
}): string {
  const { shopName, format, labels, unit } = opts;
  const pageSize = labelPageSize(format);
  const body = labels
    .map(({ item, serial }) => labelHtml(format, item, shopName, serial, unit))
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Barcode Tags</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; color: #111; }
  .label {
    width: 60mm;
    height: 40mm;
    padding: 2mm;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5mm;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .label:last-child { page-break-after: auto; break-after: auto; }
  .shop { font-size: 6px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #666; width: 100%; }
  .sticker .head {
    display: flex;
    width: 100%;
    align-items: baseline;
    justify-content: space-between;
    gap: 2mm;
    margin: 0.5mm 0;
  }
  .sticker .head .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sticker .head .price {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }
  .name { font-size: 11px; font-weight: 800; line-height: 1.2; }
  .variant, .tags { font-size: 7px; color: #555; width: 100%; line-height: 1.2; }
  .code { font-size: 7px; font-family: monospace; color: #666; }
  .price { font-size: 13px; font-weight: 900; }
  .barcode { max-width: 100%; margin-top: auto; }
  .barcode svg { max-width: 100%; height: auto; display: block; }
  .hangtag .band {
    width: 100%;
    background: #111;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2mm 1mm;
    margin-bottom: 2mm;
  }
  .hangtag .chips span {
    display: inline-block;
    border: 1px solid #ccc;
    border-radius: 2px;
    padding: 0.5mm 1.5mm;
    font-size: 8px;
    margin: 0 1mm;
  }
  .shelf { text-align: left; align-items: stretch; }
  .shelf .band {
    background: #047857;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    padding: 1.5mm 2mm;
    display: flex;
    justify-content: space-between;
  }
  .shelf .row { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; padding: 1mm 0; }
  .shelf .price { font-size: 14px; color: #047857; white-space: nowrap; }
  @media print {
    @page { size: ${pageSize}; margin: 0; }
    body { padding: 0; }
  }
</style>
</head>
<body>${body}</body></html>`;
}
