"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Scan, Loader2, Package, Plus, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { barcodeLookupCandidates, isLikelyBarcodeScan } from "@/lib/pos-barcode";
import type { InventoryItem } from "@/components/inventory/stock-adjust-modal";

interface BarcodeHit {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string | null;
  stock: number;
}

interface ScanLog {
  id: string;
  code: string;
  name: string;
  qty: number;
  before: number;
  after: number;
  at: Date;
}

interface Props {
  stock: InventoryItem[];
  onRestocked: () => void;
}

async function lookupByBarcode(code: string): Promise<BarcodeHit | null> {
  for (const key of barcodeLookupCandidates(code)) {
    try {
      const r = await api.get<BarcodeHit>(`/pos/barcode/${encodeURIComponent(key)}`);
      if (r.data?.variantId) return r.data;
    } catch {
      /* try next key */
    }
  }
  return null;
}

export function StockBarcodeScanPanel({ stock, onRestocked }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");
  const [loading, setLoading] = useState(false);
  const [lastHit, setLastHit] = useState<BarcodeHit | null>(null);
  const [recent, setRecent] = useState<ScanLog[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addStock = useCallback(async () => {
    const trimmed = code.trim();
    const addQty = Math.max(1, parseInt(qty, 10) || 1);
    if (!trimmed) {
      toast.error("Scan or type a barcode / SKU");
      return;
    }

    setLoading(true);
    try {
      const hit = await lookupByBarcode(trimmed);
      if (!hit) {
        toast.error(`No product found for: ${trimmed}`);
        return;
      }

      const row = stock.find((s) => s.variantId === hit.variantId);
      const before = row?.quantity ?? hit.stock ?? 0;

      await api.post("/inventory/adjust", {
        variantId: hit.variantId,
        quantity: addQty,
        movementType: "PURCHASE",
        notes: `Barcode scan restock (${trimmed})`,
      });

      const after = before + addQty;
      setLastHit({ ...hit, stock: after });
      setRecent((prev) => [
        {
          id: `${Date.now()}`,
          code: trimmed,
          name: `${hit.productName} · ${hit.variantName}`,
          qty: addQty,
          before,
          after,
          at: new Date(),
        },
        ...prev,
      ].slice(0, 15));

      toast.success(`+${addQty} added — ${hit.productName} (now ${after} in stock)`);
      setCode("");
      onRestocked();
      inputRef.current?.focus();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to add stock");
    } finally {
      setLoading(false);
    }
  }, [code, qty, stock, onRestocked]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void addStock();
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Scan className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Barcode Scan — Add Stock</CardTitle>
              <CardDescription>
                Scan printed tag or type barcode / SKU, then press Enter to add stock (same codes as POS)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1.5 w-full">
              <Label className="text-xs font-semibold">Barcode / SKU</Label>
              <div className="relative">
                <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Scan barcode tag or type SKU…"
                  className="pl-9 font-mono"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              {code.trim() && !isLikelyBarcodeScan(code) && (
                <p className="text-[11px] text-muted-foreground">Press Enter to add stock for this code</p>
              )}
            </div>
            <div className="space-y-1.5 w-full sm:w-28">
              <Label className="text-xs font-semibold">Qty to add</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
              />
            </div>
            <Button onClick={() => void addStock()} disabled={loading || !code.trim()} className="gap-1.5 w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Stock
            </Button>
          </div>

          {lastHit && (
            <div className="rounded-xl border bg-emerald-500/5 border-emerald-500/20 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-sm">{lastHit.productName}</p>
                <p className="text-xs text-muted-foreground">{lastHit.variantName} · {lastHit.sku}</p>
                <p className="text-sm font-bold text-emerald-700 mt-1">Current stock: {lastHit.stock}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent scans</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-64 overflow-y-auto">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{r.code}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-emerald-600">+{r.qty}</p>
                    <p className="text-[10px] text-muted-foreground">{r.before} → {r.after}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
