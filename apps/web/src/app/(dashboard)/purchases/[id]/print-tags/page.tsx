"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, ArrowLeft, Minus, Plus, Tag, Check, RotateCcw, Maximize2, Package } from "lucide-react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { APP_NAME } from "@/lib/constants";
import { useShopProfile, variantColumnLabelsFromProfile } from "@/lib/use-shop-profile";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { executeReceiptPrint } from "@/lib/receipt-print";
import { buildPrintTagsHtml, type LabelFormat as TagLabelFormat } from "@/lib/print-tag-document";
import { cn } from "@/lib/utils";
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
    images?: string[];
    imageUrl?: string | null;
    product?: {
      name: string;
      barcode?: string | null;
      tags?: string[];
      oemNumber?: string | null;
      modelNumber?: string | null;
      loadIndex?: string | null;
      speedRating?: string | null;
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
  sticker: "Sticker",
  hangtag: "Hang Tag",
  shelf: "Shelf Label",
};

// ── Barcode SVG component ─────────────────────────────────────────────────
function BarcodeEl({ value, renderKey }: { value: string; renderKey: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const safe = sanitizeBarcodeText(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || !safe) return;
    try {
      JsBarcode(el, safe, {
        format: "CODE128",
        width: 1.6,
        height: 44,
        displayValue: true,
        fontSize: 11,
        margin: 4,
      });
    } catch {
      try {
        JsBarcode(el, safe.replace(/\D/g, "").slice(0, 20) || "000000000000", {
          format: "CODE128",
          width: 1.6,
          height: 44,
          displayValue: true,
          fontSize: 11,
          margin: 4,
        });
      } catch {
        el.innerHTML = "";
      }
    }
  }, [safe, renderKey]);

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

function stickerTitleLine(item: POItem): string {
  const size = item.variant?.size?.trim();
  const style = item.variant?.style?.trim();
  if (style && ["OEM", "Aftermarket", "Genuine"].includes(style)) {
    return `${item.productName} - ${style}`;
  }
  if (size) return `${item.productName} - ${size}`;
  if (style) return `${item.productName} - ${style}`;
  return item.productName;
}

function stickerSubtitleLine(item: POItem): string {
  const parts: string[] = [];
  const season = item.variant?.style?.trim();
  const size = item.variant?.size?.trim();
  if (season && size) parts.push(season);
  const load = item.variant?.product?.loadIndex?.trim();
  const speed = item.variant?.product?.speedRating?.trim();
  if (load && speed) parts.push(`${load}${speed}`);
  else if (load) parts.push(`Load ${load}`);
  const tags = tagsLine(item);
  if (tags) parts.push(tags);
  return parts.join(" · ");
}

function labelBarcode(item: POItem, serial: number): string {
  return printTagBarcodeValue(printTagBaseCode(item), serial);
}

// ── Sticker Label (thermal 60×40mm) ──────────────────────────────────────
function StickerLabel({ item, shopName, serial }: { item: POItem; shopName: string; serial: number }) {
  const barcodeVal = labelBarcode(item, serial);
  const price = item.variant?.sellingPrice ?? item.unitCost;
  const title = stickerTitleLine(item);
  const subtitle = stickerSubtitleLine(item);
  return (
    <div
      className="label-card label-format-sticker bg-white border border-gray-300 rounded p-2 flex flex-col items-center gap-0.5 text-center"
      style={{ width: "7.5cm", minHeight: "4.5cm", breakInside: "avoid", pageBreakInside: "avoid" }}
    >
      <p className="text-[8px] font-bold tracking-widest uppercase text-gray-400">{shopName}</p>
      <p className="text-[11px] font-bold leading-tight">{title}</p>
      {subtitle && <p className="text-[9px] text-gray-500">{subtitle}</p>}
      <BarcodeEl value={barcodeVal} renderKey={`sticker-${item.id}-${serial}`} />
      <p className="text-[14px] font-extrabold text-gray-900">LKR {price.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</p>
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
      width: 7.5cm !important;
      min-height: 4.5cm !important;
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
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewCols, setPreviewCols] = useState(5);
  const [fullPreview, setFullPreview] = useState(false);

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

  const resetQtys = () => {
    if (!po) return;
    const init: Record<string, number> = {};
    po.items.forEach((it) => {
      init[it.id] = it.receivedQty > 0 ? it.receivedQty : it.orderedQty;
    });
    setQtys(init);
    toast.success("Quantities reset to received qty");
  };

  const itemThumb = (item: POItem) =>
    item.variant?.images?.[0] ?? item.variant?.imageUrl ?? null;

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
    return <div className="flex items-center justify-center min-h-screen bg-[#0a0c10] text-white/50">Loading...</div>;
  }
  if (!po) {
    return <div className="flex items-center justify-center min-h-screen bg-[#0a0c10] text-white/50">PO not found</div>;
  }

  const [colA, colB] = variantColumnLabelsFromProfile(shopProfile);
  const attrA = shopProfile.variantAttributes[0]?.mapsTo;
  const attrB = shopProfile.variantAttributes[1]?.mapsTo;

  const previewGridClass = {
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  }[previewCols] ?? "grid-cols-5";

  const PreviewGrid = ({ className }: { className?: string }) => (
    <div
      className={cn("grid gap-2 origin-top-left", previewGridClass, className)}
      style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: "top left" }}
    >
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
  );

  return (
    <div className="print-root">
      <style>{PRINT_CSS}</style>

      <div className="no-print min-h-screen bg-[#0a0c10] text-white">
        {/* Header */}
        <div className="border-b border-white/10 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/purchases/${id}`)}
              className="shrink-0 text-white/80 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-white">
                <Tag className="h-5 w-5 text-orange-400 shrink-0" />
                Print Barcode Tags
              </h1>
              <p className="text-sm text-white/50 truncate">
                {po.poNumber} · {po.supplier.name}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-white/45 font-semibold">Total Labels</p>
              <p className="text-2xl font-bold tabular-nums leading-none">{totalLabels}</p>
            </div>

            {receiptSettings.printServerEnabled && receiptSettings.printServerUrl ? (
              <span className="text-xs text-white/50 hidden lg:inline max-w-[140px]">
                Printer: <strong className="text-white">{receiptSettings.printerName || "default"}</strong>
              </span>
            ) : (
              <span className="text-xs text-orange-400 font-medium hidden sm:inline">
                Enable Store Print Server in Settings
              </span>
            )}

            <div className="flex rounded-lg border border-white/15 overflow-hidden bg-[#12151a]">
              {templates.map((tpl, i) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => setFormat(tpl)}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold transition-colors inline-flex items-center gap-1.5",
                    i > 0 && "border-l border-white/10",
                    format === tpl
                      ? "bg-orange-500 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5",
                  )}
                >
                  {format === tpl && <Check className="h-3.5 w-3.5" />}
                  {FORMAT_LABELS[tpl]}
                </button>
              ))}
            </div>

            <Button
              onClick={handlePrint}
              disabled={printing || totalLabels === 0}
              className="gap-2 px-5 bg-orange-500 hover:bg-orange-600 text-white border-0 font-semibold"
            >
              <Printer className="h-4 w-4" />
              {printing ? "Sending…" : "Print to Printer"}
            </Button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* Quantity table */}
          <div className="rounded-xl border border-white/10 bg-[#12151a] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm text-white">Set Label Quantity Per Variant</h3>
                <p className="text-xs text-white/45 mt-1 max-w-2xl">
                  Defaults to received quantity. Each tag gets a unique serial suffix (001, 002, …) for POS scanning.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  disabled={printing || totalLabels === 0}
                  className="gap-1.5 border-white/15 bg-transparent text-white hover:bg-white/10"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print All ({totalLabels})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetQtys}
                  className="gap-1.5 border-white/15 bg-transparent text-white hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead className="text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10 bg-white/[0.02]">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Item</th>
                    <th className="px-4 py-3 text-left font-semibold w-32">SKU</th>
                    <th className="px-4 py-3 text-left font-semibold w-36">Barcode (Base)</th>
                    <th className="px-4 py-3 text-left font-semibold w-28">Tags</th>
                    <th className="px-4 py-3 text-left font-semibold w-24">{colA}</th>
                    <th className="px-4 py-3 text-left font-semibold w-24">{colB}</th>
                    <th className="px-4 py-3 text-right font-semibold w-20">Ordered</th>
                    <th className="px-4 py-3 text-right font-semibold w-20">Received</th>
                    <th className="px-4 py-3 text-center font-semibold w-36">Print Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {po.items.map((item) => {
                    const base = printTagBaseCode(item);
                    const sample = base ? printTagBarcodeValue(base, 1) : "";
                    const thumb = itemThumb(item);
                    return (
                      <tr key={item.id} className="hover:bg-white/[0.03]">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-lg border border-white/10 bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
                              {thumb ? (
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-4 w-4 text-white/30" />
                              )}
                            </div>
                            <span className="font-medium text-white text-sm leading-snug">{item.productName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-white/55">{item.sku}</td>
                        <td className="px-4 py-3 font-mono text-xs text-white/55" title={sample}>
                          {base || <span className="text-red-400">Missing</span>}
                          {sample && qtys[item.id] > 0 && (
                            <span className="block text-[10px] text-white/35 mt-0.5">→ {sample}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-white/55 max-w-[7rem] truncate" title={tagsLine(item)}>
                          {tagsLine(item) || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-white/70">{variantFieldValue(item.variant, attrA)}</td>
                        <td className="px-4 py-3 text-xs text-white/70">{variantFieldValue(item.variant, attrB)}</td>
                        <td className="px-4 py-3 text-right text-white/50 tabular-nums">{item.orderedQty}</td>
                        <td className="px-4 py-3 text-right text-emerald-400 font-semibold tabular-nums">{item.receivedQty}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustQty(item.id, -1)}
                              className="h-8 w-8 rounded-lg border border-white/15 flex items-center justify-center hover:bg-white/10 transition-colors text-white/70"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center font-bold tabular-nums">{qtys[item.id] ?? 0}</span>
                            <button
                              type="button"
                              onClick={() => adjustQty(item.id, 1)}
                              className="h-8 w-8 rounded-lg border border-white/15 flex items-center justify-center hover:bg-white/10 transition-colors text-white/70"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Label preview */}
          <div className="rounded-xl border border-white/10 bg-[#12151a] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-sm text-white">Label Preview</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-white/15 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.max(50, z - 10))}
                    className="h-8 w-8 flex items-center justify-center hover:bg-white/10 text-white/70"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-3 text-xs font-semibold tabular-nums min-w-[52px] text-center">{previewZoom}%</span>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))}
                    className="h-8 w-8 flex items-center justify-center hover:bg-white/10 text-white/70"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <select
                  value={previewCols}
                  onChange={(e) => setPreviewCols(Number(e.target.value))}
                  className="h-8 rounded-lg border border-white/15 bg-[#0a0c10] text-xs font-medium px-3 text-white/80"
                >
                  {[3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>Grid: {n} × 4</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFullPreview(true)}
                  disabled={totalLabels === 0}
                  className="gap-1.5 border-white/15 bg-transparent text-white hover:bg-white/10"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Full Preview
                </Button>
              </div>
            </div>

            <div className="p-5 min-h-[280px] overflow-auto bg-[#0a0c10]/50">
              {totalLabels === 0 ? (
                <div className="py-16 text-center text-white/40 text-sm">Set qty above to preview labels</div>
              ) : (
                <PreviewGrid />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full preview overlay */}
      {fullPreview && totalLabels > 0 && (
        <div className="no-print fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h3 className="font-semibold text-white">Label Preview — {totalLabels} labels</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFullPreview(false)}
              className="border-white/15 text-white hover:bg-white/10"
            >
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <PreviewGrid />
          </div>
        </div>
      )}

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
