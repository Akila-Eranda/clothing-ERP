"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";

export type PurchaseReturnRecord = {
  id: string;
  returnNumber: string;
  status: string;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  postedAt?: string | null;
  supplier: { id: string; name: string; phone?: string | null; email?: string | null };
  purchase?: { id: string; poNumber: string } | null;
  goodsReceipt?: { id: string; grnNumber: string } | null;
  items: {
    id: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
  }[];
};

interface Props {
  returnId: string | null;
  onClose: () => void;
  onPosted?: () => void;
}

export function ViewPurchaseReturnModal({ returnId, onClose, onPosted }: Props) {
  const [data, setData] = useState<PurchaseReturnRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!returnId) {
      setData(null);
      return;
    }
    setLoading(true);
    api.get<PurchaseReturnRecord>(`/procurement/supplier-returns/${returnId}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load return details"))
      .finally(() => setLoading(false));
  }, [returnId]);

  const post = async () => {
    if (!data) return;
    setPosting(true);
    try {
      await api.post(`/procurement/supplier-returns/${data.id}/post`, {});
      toast.success("Return posted — stock deducted & supplier credited");
      onPosted?.();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Post failed");
    } finally {
      setPosting(false);
    }
  };

  if (!returnId) return null;

  const total = (data?.items ?? []).reduce((s, i) => s + i.quantity * i.unitCost, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-center gap-3 border-b px-6 py-4 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
            <RotateCcw className="h-5 w-5 text-orange-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-base font-bold">{data?.returnNumber ?? "…"}</h2>
              {data && (
                <TableStatusBadge status={data.status} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{data?.supplier?.name ?? "Loading…"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground">Reason</p>
                  <p className="font-medium">{data.reason ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Created</p>
                  <p className="font-medium">{new Date(data.createdAt).toLocaleString()}</p>
                </div>
                {data.purchase && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">Linked PO</p>
                    <p className="font-mono font-medium">{data.purchase.poNumber}</p>
                  </div>
                )}
                {data.notes && (
                  <div className="col-span-2">
                    <p className="text-[11px] text-muted-foreground">Notes</p>
                    <p className="text-sm">{data.notes}</p>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-xs">{item.productName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(item.unitCost)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(item.quantity * item.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/20 font-bold">
                      <td colSpan={3} className="px-3 py-2.5 text-right">Credit total</td>
                      <td className="px-3 py-2.5 text-right text-primary tabular-nums">LKR {formatNumber(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {data?.status === "DRAFT" && (
            <Button onClick={post} disabled={posting} className="gap-1.5 min-w-[120px]">
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Post Return
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
