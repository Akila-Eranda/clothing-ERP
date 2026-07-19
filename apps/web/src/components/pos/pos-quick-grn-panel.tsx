"use client";

import * as React from "react";
import { AlertTriangle, Banknote, Loader2, Minus, PackageCheck, Plus, RefreshCw, Scan, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { barcodeLookupCandidates, findAllProductsByBarcodeCode, isLikelyBarcodeScan } from "@/lib/pos-barcode";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";
import { formatNumber } from "@/lib/utils";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { printGrnReceipt } from "@/lib/grn-receipt-print";
import { useAuthStore } from "@/stores/auth-store";

const INPUT_CLS =
  "w-full h-9 rounded-xl px-3 text-sm text-white outline-none focus:border-[#4f6ef7] transition-colors";
const INPUT_STYLE = { background: "#1a2b4a", border: "1px solid #1e3356" } as const;

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
  barcode?: string | null;
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
  onPosted,
  onBack,
}: {
  onPosted: () => void;
  onBack: () => void;
}) {
  const { profile } = useShopWorkspace();
  const showExpiry = hasExpiryTracking(profile);
  const showBatch = hasBatchTracking(profile);
  const { settings: receiptSettings } = useReceiptSettings();
  const userName = useAuthStore((s) => s.user?.name);

  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [supplierLoading, setSupplierLoading] = React.useState(true);
  const [supplierId, setSupplierId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [productsLoading, setProductsLoading] = React.useState(false);
  const [supplierProducts, setSupplierProducts] = React.useState<SupplierProduct[]>([]);
  const [productSearch, setProductSearch] = React.useState("");
  const [scanBusy, setScanBusy] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [lineCosts, setLineCosts] = React.useState<Record<string, string>>({});
  const [lineExpiries, setLineExpiries] = React.useState<Record<string, string>>({});
  const [lineBatches, setLineBatches] = React.useState<Record<string, string>>({});
  const [openPos, setOpenPos] = React.useState<OpenPo[]>([]);
  /** Local GRN bill — never writes to the POS sales cart. */
  const [grnItems, setGrnItems] = React.useState<CartLine[]>([]);

  // Pay supplier now
  const [payNow, setPayNow] = React.useState(true);
  const [payAmount, setPayAmount] = React.useState("");
  const [payAmountTouched, setPayAmountTouched] = React.useState(false);
  const [payMethod, setPayMethod] = React.useState("CASH");
  const [payReference, setPayReference] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [chequeDueDate, setChequeDueDate] = React.useState("");
  const [chequeBankName, setChequeBankName] = React.useState("");

  const addGrnItem = React.useCallback((p: SupplierProduct, qty = 1) => {
    setGrnItems((prev) => {
      const existing = prev.find((i) => i.variantId === p.variantId);
      if (existing) {
        return prev.map((i) =>
          i.variantId === p.variantId ? { ...i, quantity: i.quantity + qty } : i,
        );
      }
      return [
        ...prev,
        {
          variantId: p.variantId,
          productName: p.productName,
          variantName: p.variantName,
          sku: p.sku,
          quantity: qty,
        },
      ];
    });
    setLineCosts((prev) => ({
      ...prev,
      [p.variantId]: prev[p.variantId] ?? String(p.lastBuyingPrice ?? p.costPrice ?? 0),
    }));
  }, []);

  const updateGrnQuantity = React.useCallback((variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setGrnItems((prev) => prev.filter((i) => i.variantId !== variantId));
      return;
    }
    setGrnItems((prev) =>
      prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
    );
  }, []);

  const removeGrnItem = React.useCallback((variantId: string) => {
    setGrnItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, []);

  const cartByVariant = React.useMemo(
    () => new Map(grnItems.map((i) => [i.variantId, i])),
    [grnItems],
  );

  const filteredProducts = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return supplierProducts;
    return supplierProducts.filter((p) =>
      p.productName.toLowerCase().includes(q)
      || p.variantName.toLowerCase().includes(q)
      || p.sku.toLowerCase().includes(q)
      || (p.barcode ?? "").toLowerCase().includes(q)
      || (p.supplierProductCode ?? "").toLowerCase().includes(q),
    );
  }, [supplierProducts, productSearch]);

  const grnLines = React.useMemo(() => {
    return grnItems
      .filter((i) => i.quantity > 0)
      .map((i) => {
        const p = supplierProducts.find((x) => x.variantId === i.variantId);
        const unitCost = parseFloat(lineCosts[i.variantId] ?? "") || p?.lastBuyingPrice || p?.costPrice || 0;
        return { ...i, unitCost, lineTotal: unitCost * i.quantity, product: p };
      });
  }, [grnItems, supplierProducts, lineCosts]);

  const total = React.useMemo(
    () => grnLines.reduce((s, l) => s + l.lineTotal, 0),
    [grnLines],
  );

  // Keep pay amount synced to the GRN total until the cashier edits it manually
  React.useEffect(() => {
    if (payNow && !payAmountTouched) {
      setPayAmount(total > 0 ? String(Math.round(total * 100) / 100) : "");
    }
  }, [payNow, payAmountTouched, total]);

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

  const loadSupplierProducts = React.useCallback(async (sid: string) => {
    if (!sid) {
      setSupplierProducts([]);
      setOpenPos([]);
      setGrnItems([]);
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

      // Prefill local GRN bill only — never the POS sales cart
      setGrnItems(rows.map((p) => ({
        variantId: p.variantId,
        productName: p.productName,
        variantName: p.variantName,
        sku: p.sku,
        quantity: 1,
      })));
      if (rows.length > 0) {
        toast.success(`${rows.length} assigned item(s) loaded to GRN bill`);
      } else {
        toast.info("No products assigned to this supplier");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load supplier products");
      setSupplierProducts([]);
      setOpenPos([]);
      setGrnItems([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  React.useEffect(() => {
    if (!supplierId) {
      setGrnItems([]);
      setSupplierProducts([]);
      setOpenPos([]);
      return;
    }
    void loadSupplierProducts(supplierId);
  }, [supplierId, loadSupplierProducts]);

  React.useEffect(() => {
    setProductSearch("");
  }, [supplierId]);

  const addMatchedProduct = React.useCallback((p: SupplierProduct) => {
    addGrnItem(p, 1);
    toast.success(`${p.productName} added to GRN`);
    setProductSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [addGrnItem]);

  const handleProductSearchEnter = React.useCallback(async () => {
    const q = productSearch.trim();
    if (!q || !supplierId || scanBusy) return;

    const localExact = findAllProductsByBarcodeCode(q, supplierProducts.map((p) => ({
      ...p,
      barcode: p.barcode ?? undefined,
    })));
    if (localExact.length === 1) {
      addMatchedProduct(localExact[0]);
      return;
    }
    if (localExact.length > 1) {
      toast.info(`${localExact.length} items match this barcode — pick from list`);
      return;
    }

    // Name search: if only one filtered row, add it
    if (!isLikelyBarcodeScan(q) && filteredProducts.length === 1) {
      addMatchedProduct(filteredProducts[0]);
      return;
    }

    if (!isLikelyBarcodeScan(q) && filteredProducts.length > 1) {
      toast.info(`${filteredProducts.length} matches — pick from list`);
      return;
    }

    // Barcode API lookup scoped to this supplier
    setScanBusy(true);
    try {
      type Lookup = SupplierProduct & { requiresVariantPick?: boolean; variants?: SupplierProduct[]; supplierAssigned?: boolean };
      let found: Lookup | null = null;
      for (const key of barcodeLookupCandidates(q)) {
        try {
          const r = await api.get<Lookup>(
            `/pos/barcode/${encodeURIComponent(key)}?supplierId=${encodeURIComponent(supplierId)}`,
          );
          found = r.data;
          break;
        } catch {
          /* try next */
        }
      }
      if (!found) {
        toast.error(`Not found for this supplier: ${q}`);
        return;
      }
      const variants = Array.isArray(found.variants) ? found.variants : [];
      if (found.requiresVariantPick || variants.length > 1) {
        const assigned = variants.filter((v) =>
          supplierProducts.some((p) => p.variantId === v.variantId),
        );
        const pool = assigned.length > 0 ? assigned : variants;
        if (pool.length === 1) {
          const row = pool[0];
          setSupplierProducts((prev) =>
            prev.some((p) => p.variantId === row.variantId) ? prev : [...prev, row],
          );
          addMatchedProduct(row);
          return;
        }
        toast.info(`${pool.length} items share this barcode — pick from list`);
        setProductSearch(q);
        setSupplierProducts((prev) => {
          const map = new Map(prev.map((p) => [p.variantId, p]));
          for (const v of pool) map.set(v.variantId, { ...map.get(v.variantId), ...v });
          return [...map.values()];
        });
        return;
      }
      if (found.supplierAssigned === false) {
        toast.error(`${found.productName} is not assigned to this supplier`);
        return;
      }
      setSupplierProducts((prev) =>
        prev.some((p) => p.variantId === found!.variantId) ? prev : [...prev, found!],
      );
      addMatchedProduct(found);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Barcode lookup failed");
    } finally {
      setScanBusy(false);
    }
  }, [productSearch, supplierId, scanBusy, supplierProducts, filteredProducts, addMatchedProduct]);

  const postQuickGrn = async () => {
    if (!supplierId) {
      toast.error("Select supplier");
      return;
    }
    if (grnLines.length === 0) {
      toast.error("GRN bill is empty — add products first");
      return;
    }
    if (grnLines.some((l) => l.unitCost <= 0)) {
      toast.error("Enter buying price for all lines");
      return;
    }
    if (payNow) {
      const amt = parseFloat(payAmount);
      if (!(amt > 0)) {
        toast.error("Enter payment amount");
        return;
      }
      if (payMethod === "CHEQUE" && !chequeNumber.trim()) {
        toast.error("Cheque number is required");
        return;
      }
      if (payMethod === "CHEQUE" && !chequeDueDate.trim()) {
        toast.error("Cheque due date is required");
        return;
      }
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
          ...(showExpiry && lineExpiries[l.variantId]
            ? { expiryDate: lineExpiries[l.variantId] }
            : {}),
          ...(showBatch && lineBatches[l.variantId]?.trim()
            ? { batchNumber: lineBatches[l.variantId].trim() }
            : {}),
        })),
        ...(payNow
          ? {
              payment: {
                amount: parseFloat(payAmount),
                method: payMethod,
                reference: payReference.trim() || undefined,
                notes: "Paid on POS Quick GRN",
                ...(payMethod === "CHEQUE"
                  ? {
                      chequeNumber: chequeNumber.trim(),
                      chequeDueDate: chequeDueDate || undefined,
                      chequeBankName: chequeBankName.trim() || undefined,
                    }
                  : {}),
              },
            }
          : {}),
      });
      const grnNo = res.data?.grnNumber ?? res.data?.id ?? "GRN";
      const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "Supplier";
      const payAmt = payNow ? parseFloat(payAmount) : 0;
      try {
        await printGrnReceipt({
          settings: receiptSettings,
          data: {
            grnNumber: grnNo,
            supplierName,
            source: "QUICK",
            notes: notes || null,
            cashierName: userName ?? null,
            paymentMethod: payNow ? payMethod : null,
            paymentAmount: payAmt > 0 ? payAmt : null,
            items: grnLines.map((l) => ({
              name: l.variantName && l.variantName !== "Default"
                ? `${l.productName} · ${l.variantName}`
                : l.productName,
              sku: l.sku,
              qty: l.quantity,
              unitCost: l.unitCost,
              lineTotal: l.lineTotal,
              batchNumber: lineBatches[l.variantId] || null,
              expiryDate: lineExpiries[l.variantId] || null,
            })),
          },
        });
      } catch (printErr: unknown) {
        toast.error((printErr as Error).message ?? "GRN print failed — GRN was saved");
      }
      toast.success(payNow ? `GRN posted & supplier paid — ${grnNo}` : `Quick GRN posted — ${grnNo}`);
      setNotes("");
      setSupplierId("");
      setSupplierProducts([]);
      setGrnItems([]);
      setLineCosts({});
      setLineExpiries({});
      setLineBatches({});
      setPayNow(true);
      setPayAmount("");
      setPayAmountTouched(false);
      setPayMethod("CASH");
      setPayReference("");
      setChequeNumber("");
      setChequeDueDate("");
      setChequeBankName("");
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
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(79,110,247,0.15)" }}>
            <PackageCheck className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          </div>
          <h2 className="text-white font-bold text-base">Quick GRN (Cashier)</h2>
          <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
            Exception
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(79,110,247,0.15)", color: "#c4b5fd" }}>
            {profile.label}
          </span>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg transition-colors hover:bg-white/10"
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
              <button
                type="button"
                onClick={() => void loadSuppliers()}
                disabled={supplierLoading || busy}
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all hover:bg-white/10 disabled:opacity-50"
                style={{ border: "1px solid #1e3356", color: "#6a8ab8", background: "transparent" }}
              >
                <RefreshCw className={`h-4 w-4 ${supplierLoading ? "animate-spin" : ""}`} />
              </button>
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#6a8ab8" }}>
                Assigned Products
              </p>
              {productsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#4f6ef7" }} />}
            </div>

            {supplierId && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: "#6a8ab8" }} />
                <input
                  ref={searchRef}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleProductSearchEnter();
                    }
                    if (e.key === "Escape" && productSearch) {
                      e.preventDefault();
                      setProductSearch("");
                    }
                  }}
                  disabled={!supplierId || productsLoading || busy || scanBusy}
                  placeholder="Search name / SKU / barcode · Enter to add"
                  className="w-full h-10 pl-9 pr-16 rounded-xl text-sm text-white outline-none placeholder:text-white/30"
                  style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {scanBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#4f6ef7" }} />
                  ) : (
                    <Scan className="h-3.5 w-3.5" style={{ color: "#4a6a8a" }} />
                  )}
                  {productSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setProductSearch("");
                        searchRef.current?.focus();
                      }}
                      className="p-1 rounded hover:bg-white/10"
                    >
                      <X className="h-3.5 w-3.5" style={{ color: "#6a8ab8" }} />
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {!supplierId ? (
              <p className="text-xs" style={{ color: "#4a6a8a" }}>Select a supplier to load assigned items.</p>
            ) : supplierProducts.length === 0 && !productsLoading ? (
              <p className="text-xs" style={{ color: "#4a6a8a" }}>No products assigned to this supplier.</p>
            ) : filteredProducts.length === 0 && !productsLoading ? (
              <p className="text-xs" style={{ color: "#4a6a8a" }}>
                No match for “{productSearch.trim()}”. Press Enter to lookup barcode.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {productSearch.trim() && (
                  <p className="text-[10px]" style={{ color: "#6a8ab8" }}>
                    Showing {filteredProducts.length} of {supplierProducts.length}
                  </p>
                )}
                {filteredProducts.map((p) => {
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
                            {p.barcode ? ` · ${p.barcode}` : ""}
                            {p.supplierProductCode ? ` · ${p.supplierProductCode}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="h-7 px-2.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all hover:opacity-90"
                          style={inCart
                            ? { border: "1px solid #4f6ef7", color: "#93c5fd", background: "transparent" }
                            : { background: "#4f6ef7", color: "#fff" }}
                          onClick={() => addGrnItem(p, 1)}
                        >
                          <Plus className="h-3 w-3" />
                          {inCart ? "Add +1" : "Add"}
                        </button>
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
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cash purchase GRN"
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>

          <div className="flex-1 min-h-0 rounded-xl border flex flex-col" style={{ background: "#0f1f3a", borderColor: "#1e3356" }}>
            <div className="p-3 space-y-2 h-full flex flex-col">
              <div className="flex items-center justify-between shrink-0">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#6a8ab8" }}>GRN Bill (Cart)</p>
                <p className="text-sm font-mono font-bold text-white">
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
                    <div key={l.variantId} className="rounded-xl border p-3 space-y-2.5" style={{ background: "#162338", borderColor: "#1e3356" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{l.productName}</p>
                          <p className="text-[10px] truncate" style={{ color: "#6a8ab8" }}>{l.sku}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => updateGrnQuantity(l.variantId, Math.max(1, l.quantity - 1))} className="h-7 w-7 rounded flex items-center justify-center transition-all hover:opacity-80" style={{ background: "#1a2b4a" }}>
                            <Minus className="h-3.5 w-3.5 text-white" />
                          </button>
                          <span className="text-white text-sm font-bold w-7 text-center select-none tabular-nums">{l.quantity}</span>
                          <button type="button" onClick={() => updateGrnQuantity(l.variantId, l.quantity + 1)} className="h-7 w-7 rounded flex items-center justify-center transition-all hover:opacity-80" style={{ background: "#1a2b4a" }}>
                            <Plus className="h-3.5 w-3.5 text-white" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGrnItem(l.variantId)}
                            className="p-1 rounded hover:bg-white/10 ml-0.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Buying</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={lineCosts[l.variantId] ?? ""}
                            onChange={(e) => setLineCosts((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                            className={INPUT_CLS}
                            style={INPUT_STYLE}
                          />
                        </div>
                        {showExpiry && (
                          <div>
                            <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Expiry</label>
                            <input
                              type="date"
                              value={lineExpiries[l.variantId] ?? ""}
                              onChange={(e) => setLineExpiries((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                              className={INPUT_CLS}
                              style={INPUT_STYLE}
                            />
                          </div>
                        )}
                        {showBatch && (
                          <div>
                            <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Batch</label>
                            <input
                              value={lineBatches[l.variantId] ?? ""}
                              onChange={(e) => setLineBatches((prev) => ({ ...prev, [l.variantId]: e.target.value }))}
                              placeholder="Optional"
                              className={`${INPUT_CLS} font-mono`}
                              style={INPUT_STYLE}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "#1e3356" }}>
                        <p className="text-[10px]" style={{ color: "#6a8ab8" }}>Line total</p>
                        <p className="text-sm font-bold text-white tabular-nums">LKR {formatNumber(l.lineTotal)}</p>
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
            </div>
          </div>

          {/* Pay supplier now */}
          <div
            className="rounded-xl border p-3 space-y-2.5 shrink-0"
            style={{ background: "#0f1f3a", borderColor: payNow ? "rgba(16,185,129,0.45)" : "#1e3356" }}
          >
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={payNow}
                  onChange={(e) => setPayNow(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4 rounded accent-emerald-500"
                />
                <Banknote className="h-4 w-4" style={{ color: "#34d399" }} />
                Pay supplier now
              </label>
              <span className="text-[10px]" style={{ color: "#6a8ab8" }}>
                GRN total <span className="font-bold text-white tabular-nums">LKR {formatNumber(total)}</span>
              </span>
            </div>
            {payNow && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Amount (LKR)</label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => {
                      setPayAmount(e.target.value);
                      setPayAmountTouched(true);
                    }}
                    disabled={busy}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    disabled={busy}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Reference</label>
                  <input
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="Optional"
                    disabled={busy}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  />
                </div>
                {payMethod === "CHEQUE" && (
                  <>
                    <div>
                      <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Cheque # *</label>
                      <input
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        disabled={busy}
                        className={`${INPUT_CLS} font-mono`}
                        style={INPUT_STYLE}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Due date</label>
                      <input
                        type="date"
                        value={chequeDueDate}
                        onChange={(e) => setChequeDueDate(e.target.value)}
                        disabled={busy}
                        className={INPUT_CLS}
                        style={INPUT_STYLE}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-semibold block mb-1" style={{ color: "#6a8ab8" }}>Bank</label>
                      <input
                        value={chequeBankName}
                        onChange={(e) => setChequeBankName(e.target.value)}
                        disabled={busy}
                        className={INPUT_CLS}
                        style={INPUT_STYLE}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void postQuickGrn()}
            disabled={busy || grnLines.length === 0}
            className="h-12 gap-2 w-full shrink-0 rounded-xl flex items-center justify-center text-sm font-bold transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: payNow
                ? "linear-gradient(135deg,#059669,#0d9488)"
                : "linear-gradient(135deg,#4f6ef7,#7c3aed)",
              color: "#fff",
              boxShadow: payNow ? "0 4px 16px rgba(16,185,129,0.35)" : "0 4px 16px rgba(79,110,247,0.35)",
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : payNow ? <Banknote className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
            {payNow ? "Post GRN & Pay Supplier" : "Post Quick GRN Bill"}
          </button>
        </div>
      </div>
    </div>
  );
}
