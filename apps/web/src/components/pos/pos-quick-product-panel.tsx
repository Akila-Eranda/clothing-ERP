"use client";

import * as React from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type Category = { id: string; name: string };

export function PosQuickProductPanel({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (variantId?: string) => void;
}) {
  const { profile } = useShopWorkspace();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [sellingPrice, setSellingPrice] = React.useState("");
  const [costPrice, setCostPrice] = React.useState("");
  const [mrp, setMrp] = React.useState("");
  const [stockQty, setStockQty] = React.useState("0");

  React.useEffect(() => {
    api
      .get<Category[]>("/categories")
      .then((r) => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

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

      toast.success(`Product created: ${name.trim()}`);
      setName("");
      setBarcode("");
      setSellingPrice("");
      setCostPrice("");
      setMrp("");
      setStockQty("0");
      setCategoryId("");
      onCreated(variantId);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create product");
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle = {
    background: "#1a2b4a",
    border: "1px solid #1e3356",
    color: "#fff",
  } as const;

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">Quick Product</h2>
          <Badge className="ml-1 text-[10px]" style={{ background: "rgba(79,110,247,0.15)", color: "#c4b5fd" }}>
            {profile.label}
          </Badge>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg"
          style={{ color: "#6a8ab8" }}
        >
          ← Back
        </button>
      </div>

      <div
        className="rounded-xl border p-4 space-y-3 overflow-y-auto max-w-xl"
        style={{ background: "#162338", borderColor: "#1e3356" }}
      >
        <p className="text-[11px]" style={{ color: "#6a8ab8" }}>
          Create a simple product fast (no variants). Opens with selling / cost / MRP.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className="h-10 rounded-xl border-0 text-white"
            style={fieldStyle}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Barcode</label>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Optional"
              className="h-10 rounded-xl border-0 text-white"
              style={fieldStyle}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-10 rounded-xl text-sm px-3 outline-none"
              style={fieldStyle}
            >
              <option value="">Optional…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Selling *</label>
            <Input
              type="number"
              min={0}
              value={sellingPrice}
              onChange={(e) => {
                setSellingPrice(e.target.value);
                if (!mrp) setMrp(e.target.value);
              }}
              className="h-10 rounded-xl border-0 text-white"
              style={fieldStyle}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Cost *</label>
            <Input
              type="number"
              min={0}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="h-10 rounded-xl border-0 text-white"
              style={fieldStyle}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>MRP</label>
            <Input
              type="number"
              min={0}
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              className="h-10 rounded-xl border-0 text-white"
              style={fieldStyle}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Opening stock (optional)</label>
          <Input
            type="number"
            min={0}
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
            className="h-10 rounded-xl border-0 text-white"
            style={fieldStyle}
          />
        </div>

        <Button
          onClick={() => void submit()}
          disabled={busy}
          className="w-full h-10 gap-1.5"
          style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)", color: "#fff" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
          Create Product
        </Button>
      </div>
    </div>
  );
}
