"use client";

import { useState, useEffect } from "react";
import { X, PackageCheck, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface POItem {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  rejectedQty: number;
  unitCost: number;
  taxRate: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: string;
  total: number;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  supplier: { id: string; name: string; phone: string };
  items?: POItem[];
  _count?: { items: number };
}

interface ReceiveRow { itemId: string; receivedQty: number; rejectedQty: number; }

interface Props {
  po: PurchaseOrder | null;
  onClose: () => void;
  onReceived: () => void;
}

export function ReceiveItemsModal({ po, onClose, onReceived }: Props) {
  const [rows, setRows]     = useState<ReceiveRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (po) {
      setRows((po.items ?? []).map((i) => ({
        itemId: i.id,
        receivedQty: Math.max(0, i.orderedQty - i.receivedQty),
        rejectedQty: 0,
      })));
    }
  }, [po]);

  const update = (idx: number, key: "receivedQty" | "rejectedQty", val: number) =>
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: Math.max(0, val) } : r));

  const submit = async () => {
    if (!po) return;
    const hasAny = rows.some((r) => r.receivedQty > 0 || r.rejectedQty > 0);
    if (!hasAny) { toast.error("Enter at least one received quantity"); return; }
    setLoading(true);
    try {
      await api.post(`/purchases/${po.id}/receive`, { items: rows });
      toast.success("Items received — inventory updated");
      onReceived();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Receive failed");
    } finally { setLoading(false); }
  };

  if (!po) return null;

  const STATUS_COLOR: Record<string, string> = {
    DRAFT:              "bg-muted text-muted-foreground border-border",
    ORDERED:            "bg-blue-500/10 text-blue-600 border-blue-500/30",
    SENT:               "bg-violet-500/10 text-violet-600 border-violet-500/30",
    IN_TRANSIT:         "bg-amber-500/10 text-amber-600 border-amber-500/30",
    PARTIALLY_RECEIVED: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    RECEIVED:           "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    CANCELLED:          "bg-red-500/10 text-red-600 border-red-500/30",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <PackageCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold">Receive Items</h2>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[po.status] ?? STATUS_COLOR.DRAFT}`}>
                {po.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono">{po.poNumber}</span> · {po.supplier.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {["Product / SKU", "Ordered", "Already Received", "Receive Now", "Reject"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(po.items ?? []).map((item, idx) => {
                  const remaining = item.orderedQty - item.receivedQty;
                  const fullyReceived = remaining <= 0;
                  return (
                    <tr key={item.id} className={`border-t ${fullyReceived ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-xs leading-tight">{item.productName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold">{item.orderedQty}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.receivedQty > 0 ? (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" />{item.receivedQty}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 w-20">
                        <Input type="number" min={0} max={remaining} value={rows[idx]?.receivedQty ?? 0}
                          disabled={fullyReceived}
                          className="h-7 text-xs px-2 w-20"
                          onChange={(e) => update(idx, "receivedQty", parseInt(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2.5 w-20">
                        <Input type="number" min={0} value={rows[idx]?.rejectedQty ?? 0}
                          disabled={fullyReceived}
                          className="h-7 text-xs px-2 w-20"
                          onChange={(e) => update(idx, "rejectedQty", parseInt(e.target.value) || 0)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-700 flex items-start gap-2">
            <PackageCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Received quantities will be <strong>added to inventory</strong> immediately. Status will update to Partially Received or Received automatically.
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[150px] bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Confirm Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
