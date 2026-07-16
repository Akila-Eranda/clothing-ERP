"use client";

import * as React from "react";
import { Loader2, PackageCheck, RefreshCw } from "lucide-react";
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

type ProductForCost = {
  variantId: string;
  costPrice: number;
};

type SupplierRow = {
  id: string;
  name: string;
};

export function PosQuickGrnPanel({
  items,
  products,
  onPosted,
  onBack,
}: {
  items: CartLine[];
  products: ProductForCost[];
  onPosted: () => void;
  onBack: () => void;
}) {
  const { profile } = useShopWorkspace();

  const [loading, setLoading] = React.useState(false);
  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [supplierLoading, setSupplierLoading] = React.useState(true);
  const [supplierId, setSupplierId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const pm = React.useMemo(() => new Map(products.map((p) => [p.variantId, p])), [products]);
  const cartLines = React.useMemo(() => items.filter((i) => i.quantity > 0), [items]);

  const totals = React.useMemo(() => {
    const lines = cartLines.map((l) => {
      const unitCost = pm.get(l.variantId)?.costPrice ?? 0;
      return { ...l, unitCost, lineTotal: unitCost * l.quantity };
    });
    const total = lines.reduce((s, x) => s + x.lineTotal, 0);
    return { lines, total };
  }, [cartLines, pm]);

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

  React.useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const postQuickGrn = async () => {
    if (!supplierId) {
      toast.error("Select supplier");
      return;
    }
    if (totals.lines.length === 0) {
      toast.error("Cart is empty — add items before posting GRN");
      return;
    }
    if (totals.lines.some((l) => l.unitCost <= 0)) {
      toast.error("Missing cost price for one or more items (variant costPrice is 0)");
      return;
    }

    setBusy(true);
    setLoading(true);
    try {
      await api.post("/procurement/grn/quick", {
        supplierId,
        notes: notes || undefined,
        lines: totals.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      });
      toast.success("Quick GRN posted successfully");
      setNotes("");
      setSupplierId("");
      onPosted();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Quick GRN failed");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">Quick GRN (Cashier)</h2>
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

      <div
        className="rounded-xl border p-4 space-y-3 overflow-y-auto"
        style={{ background: "#162338", borderColor: "#1e3356" }}
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>
            Supplier
          </label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={supplierLoading || busy}
            className="w-full h-10 rounded-xl text-sm px-3 text-white outline-none"
            style={{
              background: "#1a2b4a",
              border: "1px solid #1e3356",
              opacity: supplierLoading ? 0.7 : 1,
            }}
          >
            <option value="">{supplierLoading ? "Loading..." : "Select supplier..."}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2 items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSuppliers()}
              disabled={supplierLoading || busy}
              className="h-9 gap-1.5"
              style={{ borderColor: "#1e3356", color: "#6a8ab8", background: "transparent" }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${supplierLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>
            Notes (optional)
          </label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cash purchase GRN"
            className="h-10 rounded-xl bg-[#1a2b4a] border-[#1e3356] text-white"
          />
        </div>

        <Card style={{ background: "#0f1f3a", borderColor: "#1e3356" }}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: "#93c5fd" }}>
                GRN Lines (from cart)
              </p>
              <p className="text-xs font-mono" style={{ color: "#c4b5fd" }}>
                Total: LKR {formatNumber(totals.total)}
              </p>
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              {totals.lines.length === 0 ? (
                <p className="text-xs" style={{ color: "#4a6a8a" }}>
                  Add items to cart first.
                </p>
              ) : (
                <div className="space-y-2">
                  {totals.lines.map((l) => (
                    <div key={l.variantId} className="flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-bold truncate">{l.productName}</p>
                        <p className="text-[10px] truncate" style={{ color: "#6a8ab8" }}>
                          {l.variantName !== "Default" ? l.variantName : l.sku}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-bold tabular-nums">
                          {l.quantity} × {formatNumber(l.unitCost)}
                        </p>
                        <p className="text-[10px] font-mono" style={{ color: "#6a8ab8" }}>
                          Line: LKR {formatNumber(l.lineTotal)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="pt-1 flex items-center justify-between gap-3">
          <div className="text-xs" style={{ color: "#6a8ab8" }}>
            Creates GRN directly (no PO needed)
          </div>
          <Button
            onClick={() => void postQuickGrn()}
            disabled={busy || totals.lines.length === 0}
            className="h-10 gap-1.5"
            style={{
              background: "linear-gradient(135deg,#4f6ef7,#7c3aed)",
              color: "#fff",
              opacity: busy ? 0.8 : 1,
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Post Quick GRN
          </Button>
        </div>
      </div>
    </div>
  );
}

