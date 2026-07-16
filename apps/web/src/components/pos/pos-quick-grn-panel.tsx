"use client";

import * as React from "react";
import { AlertTriangle, Loader2, PackageCheck, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { formatNumber } from "@/lib/utils";

type CartLine = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
};

type SupplierProduct = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  costPrice: number;
  stock: number;
  lastBuyingPrice?: number | null;
  supplierProductCode?: string | null;
  lastPurchaseDate?: string | null;
  lastPurchaseQty?: number | null;
  stockAtLastPurchase?: number | null;
  soldAfterLastPurchase?: number | null;
  stockDecreased?: boolean;
};

type SupplierRow = {
  id: string;
  name: string;
};

type OpenPo = {
  id: string;
  poNumber: string;
  status: string;
  supplier: { id: string; name: string };
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

export function PosQuickGrnPanel({
  items,
  onPosted,
  onBack,
  onClearCart,
  onAddGrnItem,
  onUpdateQuantity,
  onRemoveItem,
}: {
  items: CartLine[];
  onPosted: () => void;
  onBack: () => void;
  onClearCart: () => void;
  onAddGrnItem: (p: SupplierProduct, qty?: number) => void;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
  onRemoveItem: (variantId: string) => void;
}) {
  const { profile } = useShopWorkspace();

  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [supplierLoading, setSupplierLoading] = React.useState(true);
  const [supplierId, setSupplierId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [supplierProducts, setSupplierProducts] = React.useState<SupplierProduct[]>([]);
  const [lineCosts, setLineCosts] = React.useState<Record<string, string>>({});
  const [lineExpiries, setLineExpiries] = React.useState<Record<string, string>>({});
  const [lineBatches, setLineBatches] = React.useState<Record<string, string>>({});
  const [openPos, setOpenPos] = React.useState<OpenPo[]>([]);

  const cartByVariant = React.useMemo(
    () => new Map(items.map((i) => [i.variantId, i])),
    [items],
  );

  const grnLines = React.useMemo(() => {
    const variantSet = new Set(supplierProducts.map((p) => p.variantId));
    return items
      .filter((i) => i.quantity > 0 && variantSet.has(i.variantId))
      .map((i) => {
        const p = supplierProducts.find((x) => x.variantId === i.variantId);
        const unitCost = parseFloat(lineCosts[i.variantId] ?? "") || p?.lastBuyingPrice || p?.costPrice || 0;
        return { ...i, unitCost, lineTotal: unitCost * i.quantity, product: p };
      });
  }, [items, supplierProducts, lineCosts]);

  const total = React.useMemo(
    () => grnLines.reduce((s, l) => s + l.lineTotal, 0),
    [grnLines],
  );

  const loadSuppliers = React.useCallback(async () => {
    setSupplierLoading(true);
    try {
      const res = await api.get<{ data: SupplierRow[] }>("/suppliers?limit=100");
      setSuppliers(res.data?.data ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load suppliers");
    } finally {
      setSupplierLoading(false);
    }
  }, []);

  const loadSupplierProducts = React.useCallback(async (sid: string, autoLoadCart = false) => {
    if (!sid) {
      setSupplierProducts([]);
      setOpenPos([]);
      return;
    }
    setProductsLoading(true);
    try {
      const [prodRes, poRes] = await Promise.all([
        api.get<SupplierProduct[]>(`/pos/products?supplierId=${encodeURIComponent(sid)}&limit=500`),
        api.get<{ data: OpenPo[] }>("/purchases?limit=200"),
      ]);
      const rows = Array.isArray(prodRes.data) ? prodRes.data : [];
      setSupplierProducts(rows);

      const allPos = poRes.data?.data ?? (poRes.data as unknown as OpenPo[]) ?? [];
      const receivable = ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED"];
      setOpenPos(allPos.filter((p) => p.supplier?.id === sid && receivable.includes(p.status)));

      const costs: Record<string, string> = {};
      for (const p of rows) {
        costs[p.variantId] = String(p.lastBuyingPrice ?? p.costPrice ?? 0);
      }
      setLineCosts(costs);

      if (autoLoadCart) {
        onClearCart();
        for (const p of rows) {
          onAddGrnItem(p, 1);
        }
        if (rows.length > 0) {
          toast.success(`${rows.length} assigned item(s) loaded to cart`);
        } else {
          toast.info("No products assigned to this supplier");
        }
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load supplier products");
      setSupplierProducts([]);
      setOpenPos([]);
    } finally {
      setProductsLoading(false);
    }
  }, [onAddGrnItem, onClearCart]);

  React.useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  React.useEffect(() => {
    if (!supplierId) return;
    void loadSupplierProducts(supplierId, true);
  }, [supplierId, loadSupplierProducts]);

  const postQuickGrn = async () => {
    if (!supplierId) {
      toast.error("Select supplier");
      return;
    }
    if (grnLines.length === 0) {
      toast.error("Cart is empty — load supplier items first");
      return;
    }
    if (grnLines.some((l) => l.unitCost <= 0)) {
      toast.error("Enter buying price for all lines");
      return;
    }
    const missingExp = grnLines.find((l) => !String(lineExpiries[l.variantId] ?? "").trim());
    if (missingExp) {
      toast.error(`Expiry date required for ${missingExp.productName}`);
      return;
    }
    if (openPos.length > 0) {
      const names = openPos.map((p) => p.poNumber).join(", ");
      const ok = window.confirm(
        `Open PO(s) exist: ${names}.\n\nBest option: Receive against PO (Purchases page).\n\nPost Quick GRN anyway?`,
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await api.post<{ grnNumber?: string; id?: string }>("/procurement/grn/quick", {
        supplierId,
        notes: notes || undefined,
        lines: grnLines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          expiryDate: lineExpiries[l.variantId],
          ...(lineBatches[l.variantId]?.trim()
            ? { batchNumber: lineBatches[l.variantId].trim() }
            : {}),
        })),
      });
      const grnNo = res.data?.grnNumber ?? res.data?.id ?? "GRN";
      toast.success(`Quick GRN posted — ${grnNo}`);
      setNotes("");
      setSupplierId("");
      setSupplierProducts([]);
      setLineCosts({});
      setLineExpiries({});
      setLineBatches({});
      onPosted();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Quick GRN failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">Quick GRN (Cashier)</h2>
          <Badge className="ml-1 text-[10px]" style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
            Exception
          </Badge>
          <Badge className="ml-1 text-[10px]" style={{ background: "rgba(79,110,247,0.15)", color: "#c4b5fd" }}>
            {profile.label}
          </Badge>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg transition-colors"
          style={{ color: "#6a8ab8" }}
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-3 flex-1 min-h-0">
        {/* Left: supplier + assigned products */}
        <div
          className="rounded-xl border p-4 space-y-3 overflow-y-auto min-h-0"
          style={{ background: "#162338", borderColor: "#1e3356" }}
        >
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Supplier</label>
            <div className="flex gap-2">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={supplierLoading || busy}
                className="flex-1 h-10 rounded-xl text-sm px-3 text-white outline-none"
                style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
              >
                <option value="">{supplierLoading ? "Loading..." : "Select supplier..."}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadSuppliers()}
                disabled={supplierLoading || busy}
                className="h-10 gap-1.5 shrink-0"
                style={{ borderColor: "#1e3356", color: "#6a8ab8", background: "transparent" }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${supplierLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {supplierId && (
              <p className="text-[10px]" style={{ color: "#6a8ab8" }}>
                Use for walk-in cash only. Planned orders → Purchases → Receive from PO.
              </p>
            )}
            {openPos.length > 0 && (
              <div
                className="rounded-lg border p-2.5 space-y-1.5"
                style={{ background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.35)" }}
              >
                <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: "#fbbf24" }}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Open PO(s) for this supplier — prefer Receive against PO
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {openPos.slice(0, 4).map((p) => (
                    <a
                      key={p.id}
                      href={`/purchases/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border"
                      style={{ color: "#93c5fd", borderColor: "#1e3356", background: "#0f1f3a" }}
                    >
                      {p.poNumber}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: "#93c5fd" }}>
                Assigned Products
              </p>
              {productsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#4f6ef7" }} />}
            </div>
            {!supplierId ? (
              <p className="text-xs" style={{ color: "#4a6a8a" }}>Select a supplier to load assigned items.</p>
            ) : supplierProducts.length === 0 && !productsLoading ? (
              <p className="text-xs" style={{ color: "#4a6a8a" }}>No products assigned to this supplier.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {supplierProducts.map((p) => {
                  const inCart = cartByVariant.has(p.variantId);
                  return (
                    <div
                      key={p.variantId}
                      className="rounded-lg border p-3"
                      style={{ background: "#0f1f3a", borderColor: inCart ? "#4f6ef7" : "#1e3356" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white truncate">{p.productName}</p>
                          <p className="text-[10px] truncate" style={{ color: "#6a8ab8" }}>
                            {p.variantName !== "Default" ? p.variantName : p.sku}
                            {p.supplierProductCode ? ` · ${p.supplierProductCode}` : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={inCart ? "outline" : "default"}
                          className="h-7 text-[10px] gap-1 shrink-0"
                          onClick={() => onAddGrnItem(p, 1)}
                        >
                          <Plus className="h-3 w-3" />
                          {inCart ? "Add +1" : "Add"}
                        </Button>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <span style={{ color: "#6a8ab8" }}>Current stock</span>
                        <span className="text-right font-bold text-white tabular-nums">{p.stock}</span>
                        <span style={{ color: "#6a8ab8" }}>Last GRN qty</span>
                        <span className="text-right tabular-nums" style={{ color: "#c4b5fd" }}>{p.lastPurchaseQty ?? "-"}</span>
                        <span style={{ color: "#6a8ab8" }}>Last GRN date</span>
                        <span className="text-right" style={{ color: "#c4b5fd" }}>{fmtDate(p.lastPurchaseDate)}</span>
                        <span style={{ color: "#6a8ab8" }}>Stock after last GRN</span>
                        <span className="text-right tabular-nums" style={{ color: "#c4b5fd" }}>{p.stockAtLastPurchase ?? "-"}</span>
                        <span style={{ color: "#6a8ab8" }}>Sold since last GRN</span>
                        <span className="text-right tabular-nums" style={{ color: p.soldAfterLastPurchase ? "#f59e0b" : "#6a8ab8" }}>
                          {p.soldAfterLastPurchase ?? "-"}
                        </span>
                      </div>

                      {p.stockDecreased && (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold rounded-md px-2 py-1"
                          style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Stock decreased since last GRN ({p.stockAtLastPurchase} → {p.stock})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: GRN bill / cart lines */}
        <div
          className="rounded-xl border p-4 space-y-3 overflow-y-auto min-h-0 flex flex-col"
          style={{ background: "#162338", borderColor: "#1e3356" }}
        >
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Notes (optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cash purchase GRN"
              className="h-9 rounded-xl bg-[#1a2b4a] border-[#1e3356] text-white text-sm"
            />
          </div>

          <Card style={{ background: "#0f1f3a", borderColor: "#1e3356" }} className="flex-1 min-h-0">
            <CardContent className="p-3 space-y-2 h-full flex flex-col">
              <div className="flex items-center justify-between shrink-0">
                <p className="text-xs font-semibold" style={{ color: "#93c5fd" }}>GRN Bill (Cart)</p>
                <p className="text-xs font-mono font-bold" style={{ color: "#c4b5fd" }}>
                  LKR {formatNumber(total)}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {grnLines.length === 0 ? (
                  <p className="text-xs" style={{ color: "#4a6a8a" }}>
                    Select supplier — assigned items will load here.
                  </p>
                ) : (
                  grnLines.map((l) => (
                    <div key={l.variantId} className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: "#1e3356" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{l.productName}</p>
                          <p className="text-[10px] truncate" style={{ color: "#6a8ab8" }}>{l.sku}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(l.variantId)}
                          className="p-1 rounded hover:bg-white/10 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] block mb-0.5" style={{ color: "#6a8ab8" }}>Qty</label>
                          <Input
                            type="number"
                            min={1}
                            value={l.quantity}
                            onChange={(e) => onUpdateQuantity(l.variantId, Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="h-8 text-xs bg-[#1a2b4a] border-[#1e3356] text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] block mb-0.5" style={{ color: "#6a8ab8" }}>Buying</label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={lineCosts[l.variantId] ?? ""}
                            onChange={(e) => setLineCosts((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                            className="h-8 text-xs bg-[#1a2b4a] border-[#1e3356] text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] block mb-0.5" style={{ color: "#fbbf24" }}>Expiry *</label>
                          <Input
                            type="date"
                            value={lineExpiries[l.variantId] ?? ""}
                            onChange={(e) => setLineExpiries((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                            className="h-8 text-xs bg-[#1a2b4a] border-[#1e3356] text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] block mb-0.5" style={{ color: "#6a8ab8" }}>Batch</label>
                          <Input
                            value={lineBatches[l.variantId] ?? ""}
                            onChange={(e) => setLineBatches((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                            placeholder="Optional"
                            className="h-8 text-xs bg-[#1a2b4a] border-[#1e3356] text-white font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[9px]" style={{ color: "#6a8ab8" }}>Line total</p>
                        <p className="text-xs font-bold text-white tabular-nums">LKR {formatNumber(l.lineTotal)}</p>
                      </div>
                      {l.product?.stockDecreased && (
                        <p className="text-[9px] flex items-center gap-1" style={{ color: "#fbbf24" }}>
                          <AlertTriangle className="h-3 w-3" /> Stock down since last GRN
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={() => void postQuickGrn()}
            disabled={busy || grnLines.length === 0}
            className="h-10 gap-1.5 w-full shrink-0"
            style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)", color: "#fff" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Post Quick GRN Bill
          </Button>
        </div>
      </div>
    </div>
  );
}
