"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, ArrowLeft, Minus, Plus, Tag } from "lucide-react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { APP_NAME } from "@/lib/constants";
import { useShopProfile, variantColumnLabelsFromProfile } from "@/lib/use-shop-profile";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { executeReceiptPrint } from "@/lib/receipt-print";
import { buildPrintTagsHtml, type LabelFormat as TagLabelFormat } from "@/lib/print-tag-document";
import {
  printTagBaseCode,
  printTagBarcodeValue,
  sanitizeBarcodeText,
} from "@/lib/pos-barcode";

// ── Types ─────────────────────────────────────────────────────────────────
interface POItem {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  variant?: {
    id: string;
    barcode?: string | null;
    sellingPrice: number;
    color?: string | null;
    size?: string | null;
    style?: string | null;
    material?: string | null;
    product?: {
      name: string;
      barcode?: string | null;
      tags?: string[];
      oemNumber?: string | null;
      modelNumber?: string | null;
    };
  };
}
interface PO {
  id: string;
  poNumber: string;
  status: string;
  items: POItem[];
  supplier: { name: string };
}

type LabelFormat = TagLabelFormat;

const FORMAT_LABELS: Record<LabelFormat, string> = {
  sticker: "🏷️ Sticker",
  hangtag: "🎫 Hang Tag",
  shelf: "📋 Shelf Label",
};

// ── Barcode SVG component ─────────────────────────────────────────────────
const STICKER_BARCODE_OPTS = {
  format: "CODE128" as const,
  width: 1.15,
  height: 24,
  displayValue: true,
  fontSize: 7,
  fontOptions: "bold",
  textMargin: 1,
  margin: 0,
};

function BarcodeEl({
  value,
  renderKey,
  compact = false,
}: {
  value: string;
  renderKey: string;
  compact?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const safe = sanitizeBarcodeText(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || !safe) return;
    const barcodeOpts = compact
      ? STICKER_BARCODE_OPTS
      : { format: "CODE128" as const, width: 1.6, height: 44, displayValue: true, fontSize: 11, margin: 4 };
    try {
      JsBarcode(el, safe, barcodeOpts);
    } catch {
      try {
        JsBarcode(el, safe.replace(/\D/g, "").slice(0, 20) || "000000000000", barcodeOpts);
      } catch {
        el.innerHTML = "";
      }
    }
  }, [safe, renderKey, compact]);

  if (!safe) {
    return <p className="text-[8px] text-red-600 font-semibold">No barcode</p>;
  }

  return <svg ref={ref} className="max-w-full" aria-label={safe} />;
}

function variantFieldValue(variant: POItem["variant"], mapsTo?: string): string {
  if (!variant || !mapsTo) return "—";
  const val = variant[mapsTo as keyof NonNullable<POItem["variant"]>];
  return typeof val === "string" && val ? val : "—";
}

function variantDisplayLine(variant?: POItem["variant"], fallback?: string): string {
  const parts = [variant?.size, variant?.material, variant?.color, variant?.style].filter(Boolean);
  return parts.length ? parts.join(" / ") : (fallback ?? "");
}

const SYSTEM_TAG_PREFIXES = ["unit:", "exp:", "batch:"];

function productTags(item: POItem): string[] {
  return (item.variant?.product?.tags ?? []).filter(
    (t) => t.trim() && !SYSTEM_TAG_PREFIXES.some((p) => t.startsWith(p)),
  );
}

function tagsLine(item: POItem): string {
  const tags = productTags(item);
  return tags.length ? tags.join(" · ") : "";
}

function TagRow({ item, className = "" }: { item: POItem; className?: string }) {
  const line = tagsLine(item);
  if (!line) return null;
  return <p className={`text-[8px] font-semibold text-gray-600 leading-tight ${className}`}>{line}</p>;
}

function stickerMetaLine(item: POItem): string {
  const variant = variantDisplayLine(item.variant, item.variantName);
  const tags = tagsLine(item);
  if (variant && tags) return `${variant} · ${tags}`;
  return variant || tags;
}

function labelBarcode(item: POItem, serial: number): string {
  return printTagBarcodeValue(printTagBaseCode(item), serial);
}

// ── Sticker Label (thermal 60×40mm) ──────────────────────────────────────
function StickerLabel({ item, shopName, serial }: { item: POItem; shopName: string; serial: number }) {
  const barcodeVal = labelBarcode(item, serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const meta = stickerMetaLine(item);
  return (
    <div
      className="label-card label-format-sticker bg-white border border-gray-200 rounded-sm flex flex-col overflow-hidden shadow-sm"
      style={{ width: "6cm", height: "4cm", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div className="bg-gray-900 px-2 py-1 shrink-0">
        <p className="text-[6px] font-bold tracking-[0.14em] uppercase text-white text-center truncate">{shopName}</p>
      </div>
      <div className="flex flex-col flex-1 min-h-0 px-2 pt-1.5 pb-1 gap-0.5">
        <p className="text-[11px] font-extrabold leading-tight truncate text-left text-gray-900">{item.productName}</p>
        {meta && <p className="text-[7px] font-semibold text-gray-600 truncate text-left tracking-wide">{meta}</p>}
        <p className="text-[12px] font-black text-center bg-gray-100 border border-gray-200 rounded px-1 py-0.5 my-0.5">
          LKR {price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
        </p>
        <div className="mt-auto flex justify-center w-full">
          <BarcodeEl value={barcodeVal} renderKey={`sticker-${item.id}-${serial}`} compact />
        </div>
      </div>
    </div>
  );
}

// ── Hang Tag (clothing hang tag, portrait) ────────────────────────────────
function HangTag({ item, shopName, serial }: { item: POItem; shopName: string; serial: number }) {
  const barcodeVal = labelBarcode(item, serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const color = item.variant?.color;
  const size = item.variant?.size;
  return (
    <div
      className="label-card label-format-hangtag bg-white border-2 border-gray-800 rounded-lg flex flex-col items-center gap-1 text-center overflow-hidden"
      style={{ width: "6cm", minHeight: "10cm", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div className="w-full bg-gray-900 py-2 px-3">
        <p className="text-[11px] font-extrabold tracking-widest uppercase text-white">{shopName}</p>
      </div>
      <div className="w-5 h-5 rounded-full border-2 border-gray-400 mt-1" />
      <div className="px-3 py-1 flex flex-col items-center gap-1 flex-1">
        <p className="text-[13px] font-bold leading-snug text-gray-900">{item.productName}</p>
        {(color || size) && (
          <div className="flex gap-2 mt-0.5">
            {size && <span className="text-[9px] border border-gray-300 rounded px-1.5 py-0.5 font-semibold text-gray-600">{size}</span>}
            {color && <span className="text-[9px] border border-gray-300 rounded px-1.5 py-0.5 font-semibold text-gray-600">{color}</span>}
          </div>
        )}
        <TagRow item={item} className="mt-0.5" />
        <p className="text-[20px] font-extrabold text-gray-900 mt-1">LKR {price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</p>
        <div className="border-t w-full mt-1 pt-1">
          <BarcodeEl value={barcodeVal} renderKey={`hang-${item.id}-${serial}`} />
          <p className="text-[8px] font-mono text-gray-400">{barcodeVal || "—"}</p>
        </div>
      </div>
    </div>
  );
}

// ── Shelf Label (grocery shelf edge, landscape) ─────────────────────────
function ShelfLabel({ item, shopName, serial, unit }: { item: POItem; shopName: string; serial: number; unit?: string }) {
  const barcodeVal = labelBarcode(item, serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const variantLine = variantDisplayLine(item.variant, item.variantName);
  return (
    <div
      className="label-card label-format-shelf bg-white border-2 border-emerald-700 rounded flex flex-col justify-between overflow-hidden"
      style={{ width: "10cm", minHeight: "3.5cm", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <div className="bg-emerald-700 px-2 py-1 flex items-center justify-between">
        <p className="text-[9px] font-bold tracking-wider uppercase text-white truncate">{shopName}</p>
        {unit && <span className="text-[8px] font-semibold text-emerald-100 shrink-0 ml-2">/{unit}</span>}
      </div>
      <div className="px-2 py-1 flex items-end justify-between gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-[12px] font-bold leading-tight truncate">{item.productName}</p>
          {variantLine && <p className="text-[9px] text-gray-500 truncate">{variantLine}</p>}
          <TagRow item={item} className="truncate" />
        </div>
        <p className="text-[16px] font-extrabold text-emerald-800 shrink-0">
          {price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
        </p>
      </div>
      <div className="border-t px-1 pb-0.5 flex items-center justify-center">
        <BarcodeEl value={barcodeVal} renderKey={`shelf-${item.id}-${serial}`} />
      </div>
    </div>
  );
}

function LabelPreview({
  format,
  item,
  shopName,
  serial,
  unit,
}: {
  format: LabelFormat;
  item: POItem;
  shopName: string;
  serial: number;
  unit?: string;
}) {
  if (format === "hangtag") return <HangTag item={item} shopName={shopName} serial={serial} />;
  if (format === "shelf") return <ShelfLabel item={item} shopName={shopName} serial={serial} unit={unit} />;
  return <StickerLabel item={item} shopName={shopName} serial={serial} />;
}

const PRINT_CSS = `
  @media print {
    @page { margin: 5mm; size: auto; }
    body { background: white !important; }
    body * { visibility: hidden; }
    .print-root, .print-root * { visibility: visible; }
    .print-root {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
    }
    .print-root .no-print { display: none !important; }
    .print-root .print-grid {
      display: flex !important;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0;
    }
    .label-format-sticker {
      width: 6cm !important;
      height: 4cm !important;
      overflow: hidden !important;
    }
    .label-format-hangtag {
      width: 6cm !important;
      min-height: 10cm !important;
    }
    .label-format-shelf {
      width: 10cm !important;
      min-height: 3.5cm !important;
    }
    .label-card {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

// ── Page ──────────────────────────────────────────────────────────────────
export default function PrintTagsPage() {
  const shopProfile = useShopProfile();
  const { settings: receiptSettings } = useReceiptSettings();
  const templates = shopProfile.labelTemplates;
  const defaultFormat = (templates[0] ?? "sticker") as LabelFormat;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [format, setFormat] = useState<LabelFormat>(defaultFormat);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!templates.includes(format)) setFormat(defaultFormat);
  }, [templates, format, defaultFormat]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<PO>(`/purchases/${id}`);
      setPo(res.data);
      const init: Record<string, number> = {};
      res.data.items.forEach((it) => {
        init[it.id] = it.receivedQty > 0 ? it.receivedQty : it.orderedQty;
      });
      setQtys(init);
    } catch {
      toast.error("Failed to load PO");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const adjustQty = (itemId: string, delta: number) =>
    setQtys((p) => ({ ...p, [itemId]: Math.max(0, (p[itemId] ?? 1) + delta) }));

  const totalLabels = Object.values(qtys).reduce((s, v) => s + v, 0);

  const expandedLabels: { item: POItem; key: string; serial: number }[] = [];
  if (po) {
    po.items.forEach((item) => {
      const q = qtys[item.id] ?? 0;
      for (let i = 0; i < q; i++) {
        expandedLabels.push({ item, key: `${item.id}-${i}`, serial: i + 1 });
      }
    });
  }

  const shopName = receiptSettings.shopName || APP_NAME;

  const handlePrint = useCallback(async () => {
    if (totalLabels === 0) {
      toast.error("Set label quantity before printing");
      return;
    }

    const missing = (po?.items ?? []).filter((it) => {
      const q = qtys[it.id] ?? 0;
      return q > 0 && !printTagBaseCode(it);
    });
    if (missing.length > 0) {
      toast.warning(`${missing.length} item(s) have no barcode or SKU — tags may not scan at POS`);
    }

    setPrinting(true);
    try {
      const html = buildPrintTagsHtml({
        shopName,
        format,
        labels: expandedLabels.map(({ item, serial }) => ({ item, serial })),
        unit: shopProfile.defaultUnit,
      });

      const result = await executeReceiptPrint({
        html,
        printType: "LABEL",
        invoiceNumber: po?.poNumber,
        settings: receiptSettings,
        paperWidth: format === "shelf" ? "100mm" : "60mm",
        title: `Tags ${po?.poNumber ?? ""}`,
      });

      if (result.serverUsed) {
        toast.success(`Sent ${totalLabels} label(s) to ${receiptSettings.printerName || "store printer"}`);
      } else if (result.status === "FAILED") {
        toast.error(result.errorMessage ?? "Print server failed");
      } else {
        toast.info("Print server unavailable — sent to browser print dialog");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print failed");
    } finally {
      setPrinting(false);
    }
  }, [totalLabels, po, qtys, shopName, format, expandedLabels, shopProfile.defaultUnit, receiptSettings]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  }
  if (!po) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">PO not found</div>;
  }

  const [colA, colB] = variantColumnLabelsFromProfile(shopProfile);
  const attrA = shopProfile.variantAttributes[0]?.mapsTo;
  const attrB = shopProfile.variantAttributes[1]?.mapsTo;

  return (
    <div className="print-root">
      <style>{PRINT_CSS}</style>

      <div className="no-print min-h-screen bg-muted/30">
        <div className="bg-background border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/purchases/${id}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" /> Print Barcode Tags
              </h1>
              <p className="text-sm text-muted-foreground">
                {po.poNumber} · {po.supplier.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground font-medium">
              Total: <strong className="text-foreground">{totalLabels}</strong> labels
            </span>
            {receiptSettings.printServerEnabled && receiptSettings.printServerUrl ? (
              <span className="text-xs text-muted-foreground hidden md:inline">
                Printer: <strong className="text-foreground">{receiptSettings.printerName || "default"}</strong>
              </span>
            ) : (
              <span className="text-xs text-amber-700 hidden md:inline">Enable Store Print Server in Settings</span>
            )}
            <div className="flex rounded-lg border overflow-hidden">
              {templates.map((tpl, i) => (
                <button
                  key={tpl}
                  onClick={() => setFormat(tpl)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
                    format === tpl ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                  }`}
                >
                  {FORMAT_LABELS[tpl]}
                </button>
              ))}
            </div>
            <Button onClick={handlePrint} disabled={printing || totalLabels === 0} className="gap-2 px-5">
              <Printer className="h-4 w-4" /> {printing ? "Sending…" : "Print to Printer"}
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-background border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b bg-muted/20">
              <h3 className="font-semibold text-sm">Set Label Quantity Per Variant</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Defaults to received qty. Each tag gets a unique serial suffix (001, 002, …) for POS scanning.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/10">
                <tr>
                  <th className="px-5 py-2.5 text-left">Item</th>
                  <th className="px-5 py-2.5 text-left w-28">SKU</th>
                  <th className="px-5 py-2.5 text-left w-32">Barcode</th>
                  <th className="px-5 py-2.5 text-left w-32">Tags</th>
                  <th className="px-5 py-2.5 text-left w-20">{colA}</th>
                  <th className="px-5 py-2.5 text-left w-20">{colB}</th>
                  <th className="px-5 py-2.5 text-right w-24">Ordered</th>
                  <th className="px-5 py-2.5 text-right w-24">Received</th>
                  <th className="px-5 py-2.5 text-center w-36">Print Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {po.items.map((item) => {
                  const base = printTagBaseCode(item);
                  const sample = base ? printTagBarcodeValue(base, 1) : "";
                  return (
                    <tr key={item.id} className="hover:bg-muted/10">
                      <td className="px-5 py-3 font-medium">{item.productName}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground" title={sample}>
                        {base || <span className="text-red-600">Missing</span>}
                        {sample && qtys[item.id] > 0 && (
                          <span className="block text-[10px] text-muted-foreground/80">→ {sample}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground max-w-[8rem] truncate" title={tagsLine(item)}>
                        {tagsLine(item) || "—"}
                      </td>
                      <td className="px-5 py-3 text-xs">{variantFieldValue(item.variant, attrA)}</td>
                      <td className="px-5 py-3 text-xs">{variantFieldValue(item.variant, attrB)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{item.orderedQty}</td>
                      <td className="px-5 py-3 text-right text-green-600 font-medium">{item.receivedQty}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => adjustQty(item.id, -1)}
                            className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-semibold">{qtys[item.id] ?? 0}</span>
                          <button
                            onClick={() => adjustQty(item.id, 1)}
                            className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-background border rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm mb-4">Label Preview ({totalLabels} labels)</h3>
            {totalLabels === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Set qty above to preview labels</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {expandedLabels.map(({ item, key, serial }) => (
                  <LabelPreview
                    key={key}
                    format={format}
                    item={item}
                    shopName={shopName}
                    serial={serial}
                    unit={shopProfile.defaultUnit}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="print-grid hidden">
        {expandedLabels.map(({ item, key, serial }) => (
          <LabelPreview
            key={`print-${key}`}
            format={format}
            item={item}
            shopName={shopName}
            serial={serial}
            unit={shopProfile.defaultUnit}
          />
        ))}
      </div>
    </div>
  );
}
