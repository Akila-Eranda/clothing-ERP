"use client";

import * as React from "react";
import { Loader2, PackagePlus, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type Category = { id: string; name: string };
type SupplierRow = { id: string; name: string };

const INPUT_CLS =
  "w-full h-10 rounded-xl px-3 text-sm outline-none focus:border-[#4f6ef7] transition-colors";
const INPUT_STYLE = { background: "var(--pos-input)", border: "1px solid var(--pos-border)", color: "var(--pos-text)" } as const;

export function PosQuickProductPanel({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (variantId?: string) => void;
}) {
  const { profile } = useShopWorkspace();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [suppliersLoading, setSuppliersLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [sellingPrice, setSellingPrice] = React.useState("");
  const [costPrice, setCostPrice] = React.useState("");
  const [mrp, setMrp] = React.useState("");
  const [stockQty, setStockQty] = React.useState("0");

  const loadSuppliers = React.useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const r = await api.get<{ data: SupplierRow[] }>("/suppliers?limit=100");
      setSuppliers(r.data?.data ?? []);
    } catch {
      /* supplier list optional */
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    api
      .get<Category[]>("/categories")
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    void loadSuppliers();
  }, [loadSuppliers]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Product name required");
      return;
    }
    const sell = parseFloat(sellingPrice);
    const cost = parseFloat(costPrice);
    const m = parseFloat(mrp || sellingPrice);
    if (!(sell >= 0) || !(cost >= 0) || !(m >= 0)) {
      toast.error("Enter valid prices");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post<{ id: string; sku?: string }>("/products", {
        name: name.trim(),
        barcode: barcode.trim() || undefined,
        categoryId: categoryId || undefined,
        sellingPrice: sell,
        costPrice: cost,
        mrp: m,
        taxRate: 0,
        status: "ACTIVE",
        hasVariants: false,
        trackInventory: true,
        branchScope: "ALL",
      });

      const qty = Math.max(0, parseInt(stockQty, 10) || 0);
      let variantId: string | undefined;
      try {
        const detail = await api.get<{
          variants?: { id: string }[];
        }>(`/products/${res.data.id}`);
        variantId = detail.data?.variants?.[0]?.id;
        if (variantId && qty > 0) {
          await api.post("/inventory/adjust", {
            variantId,
            quantity: qty,
            movementType: "PURCHASE",
            unitCost: cost,
            notes: "POS quick product opening stock",
          });
        }
      } catch {
        /* product created; stock optional / may need inventory permission */
      }

      if (supplierId && variantId) {
        try {
          await api.post(`/suppliers/${supplierId}/products`, {
            variantId,
            lastBuyingPrice: cost > 0 ? cost : undefined,
          });
          const supName = suppliers.find((s) => s.id === supplierId)?.name ?? "supplier";
          toast.success(`Assigned to ${supName}`);
        } catch (e: unknown) {
          toast.error((e as Error).message ?? "Supplier assignment failed");
        }
      }

      toast.success(`Product created: ${name.trim()}`);
      setName("");
      setBarcode("");
      setSellingPrice("");
      setCostPrice("");
      setMrp("");
      setStockQty("0");
      setCategoryId("");
      setSupplierId("");
      onCreated(variantId);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">Quick Product</h2>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(79,110,247,0.15)", color: "#c4b5fd" }}
          >
            {profile.label}
          </span>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: "var(--pos-muted)" }}
        >
          ← Back
        </button>
      </div>

      <div
        className="rounded-xl border p-4 space-y-3 overflow-y-auto max-w-xl"
        style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}
      >
        <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>
          Create a simple product fast (no variants). Opens with selling / cost / MRP.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className={INPUT_CLS}
            style={INPUT_STYLE}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Barcode</label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Optional"
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-10 rounded-xl text-sm px-3 text-white outline-none"
              style={INPUT_STYLE}
            >
              <option value="">Optional…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--pos-muted)" }}>
            <Truck className="h-3.5 w-3.5" />
            Supplier (assign for Quick GRN)
          </label>
          <div className="flex gap-2">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={suppliersLoading || busy}
              className="flex-1 h-10 rounded-xl text-sm px-3 text-white outline-none disabled:opacity-60"
              style={INPUT_STYLE}
            >
              <option value="">{suppliersLoading ? "Loading..." : "Optional — select supplier…"}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadSuppliers()}
              disabled={suppliersLoading || busy}
              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all hover:bg-white/10 disabled:opacity-50"
              style={{ border: "1px solid var(--pos-border)", color: "var(--pos-muted)", background: "transparent" }}
            >
              <RefreshCw className={`h-4 w-4 ${suppliersLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {supplierId && (
            <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
              Buying price (cost) will be saved as last buying price for this supplier.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Selling *</label>
            <input
              type="number"
              min={0}
              value={sellingPrice}
              onChange={(e) => {
                setSellingPrice(e.target.value);
                if (!mrp) setMrp(e.target.value);
              }}
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Cost *</label>
            <input
              type="number"
              min={0}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>MRP</label>
            <input
              type="number"
              min={0}
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Opening stock (optional)</label>
          <input
            type="number"
            min={0}
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
          Create Product
        </button>
      </div>
    </div>
  );
}
