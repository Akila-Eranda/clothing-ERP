"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Package, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { FORM_ORANGE_BTN, FORM_OUTLINE_BTN } from "@/lib/form-shell-theme";

export type PoSalesRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  soldQty: number;
  revenue: number;
  stock: number;
  lastPoQty: number | null;
  lastPoDate: string | null;
  lastPoNumber: string | null;
};

type SalesPayload = {
  startDate: string;
  endDate: string;
  productCount: number;
  totalSoldQty: number;
  totalRevenue: number;
  rows: PoSalesRow[];
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, can limit lookup to these variant IDs (e.g. current order lines). */
  orderLineVariantIds?: string[];
}

export function PoProductSalesModal({ open, onClose, orderLineVariantIds = [] }: Props) {
  const [startDate, setStartDate] = useState(() => isoDaysAgo(30));
  const [endDate, setEndDate] = useState(() => todayIso());
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "order">("order");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SalesPayload | null>(null);

  const canUseOrderScope = orderLineVariantIds.length > 0;

  const load = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Select start and end dates");
      return;
    }
    if (scope === "order" && !orderLineVariantIds.length) {
      toast.error("No products on Order Lines yet — switch to All sold products");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        limit: "300",
      });
      if (search.trim()) params.set("search", search.trim());
      if (scope === "order" && orderLineVariantIds.length) {
        params.set("variantIds", orderLineVariantIds.join(","));
      }
      const res = await api.get<SalesPayload>(`/purchases/product-sales?${params.toString()}`);
      setData(res.data);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to load product sales");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, search, scope, orderLineVariantIds]);

  useEffect(() => {
    if (!open) return;
    if (scope === "order" && !canUseOrderScope) setScope("all");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when opened
  }, [open]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Product sales check</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              See how much each product sold in a date range — does not change your PO lines
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 space-y-3 border-b px-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] font-semibold uppercase text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void load();
                    }
                  }}
                  placeholder="Product, barcode, SKU…"
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[7, 14, 30].map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant="outline"
                className={cn("h-8", FORM_OUTLINE_BTN)}
                onClick={() => {
                  setStartDate(isoDaysAgo(d));
                  setEndDate(todayIso());
                }}
              >
                Last {d} days
              </Button>
            ))}
            <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <Button
              type="button"
              size="sm"
              variant={scope === "order" ? "default" : "outline"}
              disabled={!canUseOrderScope}
              className={cn("h-8", scope === "order" ? FORM_ORANGE_BTN : FORM_OUTLINE_BTN)}
              onClick={() => setScope("order")}
            >
              Order lines only
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === "all" ? "default" : "outline"}
              className={cn("h-8", scope === "all" ? FORM_ORANGE_BTN : FORM_OUTLINE_BTN)}
              onClick={() => setScope("all")}
            >
              All sold products
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn("ml-auto h-8 gap-1.5", FORM_ORANGE_BTN)}
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              Check sales
            </Button>
          </div>
        </div>

        {data && (
          <div className="grid shrink-0 grid-cols-3 gap-2 border-b px-5 py-3 text-center">
            <div className="rounded-lg border bg-muted/30 px-2 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Products</p>
              <p className="text-sm font-bold tabular-nums">{data.productCount}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-2 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Qty sold</p>
              <p className="text-sm font-bold tabular-nums">{formatNumber(data.totalSoldQty)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 px-2 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Revenue</p>
              <p className="text-sm font-bold tabular-nums">LKR {formatNumber(data.totalRevenue)}</p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading sales…</p>
            </div>
          ) : !rows.length ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
              <Package className="h-8 w-8 opacity-40" />
              <p className="text-sm font-medium text-foreground">No sales in this range</p>
              <p className="text-xs">Try a wider date range or switch to All sold products</p>
            </div>
          ) : (
            <table className="w-full min-w-[780px] text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-semibold">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Barcode</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Stock</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Last PO qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Sold</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.variantId} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium leading-snug">{r.productName}</p>
                      {r.variantName && r.variantName !== "Default" && (
                        <p className="text-[11px] text-muted-foreground">{r.variantName}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.barcode || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatNumber(r.stock)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.lastPoQty != null ? (
                        <div>
                          <p className="font-semibold">{formatNumber(r.lastPoQty)}</p>
                          {r.lastPoDate && (
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(r.lastPoDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short" })}
                              {r.lastPoNumber ? ` · ${r.lastPoNumber}` : ""}
                            </p>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{formatNumber(r.soldQty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">LKR {formatNumber(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t px-5 py-3">
          <Button type="button" variant="outline" className={FORM_OUTLINE_BTN} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
