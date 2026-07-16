"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, PackageCheck, Zap, RotateCcw, FileText, Plus, Loader2, RefreshCw, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";

type PrRow = {
  id: string;
  requestNumber: string;
  status: string;
  createdAt: string;
  items: { productName: string; requestedQty: number }[];
  convertedPo?: { poNumber: string } | null;
};

type GrnRow = {
  id: string;
  grnNumber: string;
  source: string;
  receivedAt: string;
  supplier: { name: string };
  purchase?: { poNumber: string } | null;
  _count: { items: number };
};

type ReturnRow = {
  id: string;
  returnNumber: string;
  status: string;
  createdAt: string;
  supplier: { name: string };
  _count: { items: number };
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  paidAmount: number;
  invoiceDate: string;
  supplier: { name: string };
  purchase?: { poNumber: string } | null;
};

type Supplier = { id: string; name: string };
type VariantOpt = { id: string; sku: string; name: string; costPrice: number; product: { name: string } };

export default function ProcurementHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<PrRow[]>([]);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Quick GRN form
  const [qgSupplier, setQgSupplier] = useState("");
  const [qgSku, setQgSku] = useState("");
  const [qgQty, setQgQty] = useState("1");
  const [qgCost, setQgCost] = useState("");
  const [qgVariant, setQgVariant] = useState<VariantOpt | null>(null);
  const [qgBusy, setQgBusy] = useState(false);

  // Invoice form
  const [invSupplier, setInvSupplier] = useState("");
  const [invNumber, setInvNumber] = useState("");
  const [invTotal, setInvTotal] = useState("");
  const [invBusy, setInvBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prR, grnR, retR, invR, supR] = await Promise.all([
        api.get<{ data: PrRow[] }>("/procurement/purchase-requests?limit=50"),
        api.get<{ data: GrnRow[] }>("/procurement/grn?limit=50"),
        api.get<{ data: ReturnRow[] }>("/procurement/supplier-returns?limit=50"),
        api.get<{ data: InvoiceRow[] }>("/procurement/supplier-invoices?limit=50"),
        api.get<{ data: Supplier[] }>("/suppliers?limit=100"),
      ]);
      setPrs(prR.data?.data ?? []);
      setGrns(grnR.data?.data ?? []);
      setReturns(retR.data?.data ?? []);
      setInvoices(invR.data?.data ?? []);
      setSuppliers(supR.data?.data ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load procurement data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const lookupSku = async () => {
    if (!qgSku.trim()) return;
    try {
      const barcode = await api.get<{
        id: string; sku: string; name: string; unitPrice?: number; costPrice?: number;
        productName?: string; product?: { name: string };
      }>(`/pos/barcode/${encodeURIComponent(qgSku.trim())}`);
      const v = barcode.data;
      if (!v?.id) {
        toast.error("SKU / barcode not found");
        setQgVariant(null);
        return;
      }
      const found: VariantOpt = {
        id: v.id,
        sku: v.sku,
        name: v.name,
        costPrice: (v as { costPrice?: number }).costPrice ?? 0,
        product: { name: v.productName ?? v.product?.name ?? "Product" },
      };
      setQgVariant(found);
      setQgCost(String(found.costPrice || 0));
      toast.success(`${found.product.name} — ${found.name}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Lookup failed");
    }
  };

  const submitQuickGrn = async () => {
    if (!qgSupplier) { toast.error("Select supplier"); return; }
    if (!qgVariant) { toast.error("Lookup a product first"); return; }
    const qty = parseInt(qgQty, 10);
    const cost = parseFloat(qgCost);
    if (!qty || qty < 1 || isNaN(cost)) { toast.error("Enter valid qty and cost"); return; }
    setQgBusy(true);
    try {
      const res = await api.post<{ grnNumber: string }>("/procurement/grn/quick", {
        supplierId: qgSupplier,
        lines: [{ variantId: qgVariant.id, quantity: qty, unitCost: cost }],
      });
      toast.success(`Quick GRN posted: ${(res.data as { grnNumber?: string })?.grnNumber ?? "OK"}`);
      setQgSku(""); setQgVariant(null); setQgQty("1"); setQgCost("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Quick GRN failed");
    } finally {
      setQgBusy(false);
    }
  };

  const createInvoice = async () => {
    if (!invSupplier || !invNumber || !invTotal) {
      toast.error("Supplier, invoice # and total required");
      return;
    }
    setInvBusy(true);
    try {
      await api.post("/procurement/supplier-invoices", {
        supplierId: invSupplier,
        invoiceNumber: invNumber,
        subtotal: parseFloat(invTotal),
        post: true,
      });
      toast.success("Supplier invoice posted");
      setInvNumber(""); setInvTotal("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Invoice create failed");
    } finally {
      setInvBusy(false);
    }
  };

  const submitPr = async (id: string) => {
    try {
      await api.post(`/procurement/purchase-requests/${id}/submit-approval`, {});
      toast.success("Submitted for approval");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Submit failed");
    }
  };

  const postReturn = async (id: string) => {
    try {
      await api.post(`/procurement/supplier-returns/${id}/post`, {});
      toast.success("Supplier return posted — stock deducted");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Post failed");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Procurement</h1>
          <p className="text-sm text-muted-foreground">
            Purchase requests · PO · GRN (PO / Direct / Quick) · Returns · Invoices · Approvals
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} className="gap-1.5">
            Purchase Orders
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: "Purchase Requests", val: prs.length, icon: ClipboardList },
          { label: "Goods Receipts", val: grns.length, icon: PackageCheck },
          { label: "Supplier Returns", val: returns.length, icon: RotateCcw },
          { label: "Invoices", val: invoices.length, icon: FileText },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10"><k.icon className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-lg font-bold">{k.val}</p>
                <p className="text-[10px] text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="requests">Purchase Requests</TabsTrigger>
          <TabsTrigger value="grn">GRN Documents</TabsTrigger>
          <TabsTrigger value="quick">Quick GRN</TabsTrigger>
          <TabsTrigger value="returns">Supplier Returns</TabsTrigger>
          <TabsTrigger value="invoices">Supplier Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Request stock → approve → convert to PO</p>
            <Button size="sm" className="gap-1.5" onClick={async () => {
              toast.message("Create a draft PO from Purchases, or use Convert after approving a PR created via API");
              router.push("/purchases/new");
            }}>
              <Plus className="h-3.5 w-3.5" /> New PO / Request
            </Button>
          </div>
          <SimpleTable
            headers={["PR #", "Items", "Status", "Created", ""]}
            rows={prs.map((p) => [
              p.requestNumber,
              `${p.items?.length ?? 0} lines`,
              <Badge key="s" variant="secondary" className="text-[10px]">{p.status}</Badge>,
              new Date(p.createdAt).toLocaleDateString("en-LK"),
              <div key="a" className="flex gap-1 justify-end">
                {p.status === "DRAFT" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => submitPr(p.id)}>
                    <Send className="h-3 w-3" /> Submit
                  </Button>
                )}
                {p.status === "APPROVED" && !p.convertedPo && suppliers[0] && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={async () => {
                      try {
                        const po = await api.post<{ poNumber: string }>(`/procurement/purchase-requests/${p.id}/convert`, {
                          supplierId: suppliers[0].id,
                        });
                        toast.success(`Converted to ${(po.data as { poNumber?: string })?.poNumber ?? "PO"}`);
                        load();
                      } catch (e: unknown) {
                        toast.error((e as Error).message ?? "Convert failed");
                      }
                    }}
                  >
                    → PO
                  </Button>
                )}
                {p.convertedPo && <span className="text-[10px] font-mono text-muted-foreground">{p.convertedPo.poNumber}</span>}
              </div>,
            ])}
            empty="No purchase requests yet"
          />
        </TabsContent>

        <TabsContent value="grn" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Formal GRN documents from PO receive, Direct GRN, or Quick GRN. Partial receiving updates PO status.
          </p>
          <SimpleTable
            headers={["GRN #", "Source", "Supplier", "PO", "Lines", "Received"]}
            rows={grns.map((g) => [
              g.grnNumber,
              <Badge key="src" variant="outline" className="text-[10px]">{g.source}</Badge>,
              g.supplier?.name ?? "—",
              g.purchase?.poNumber ?? "—",
              String(g._count?.items ?? 0),
              new Date(g.receivedAt).toLocaleString("en-LK"),
            ])}
            empty="No GRN documents — receive a PO or use Quick GRN"
          />
        </TabsContent>

        <TabsContent value="quick" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-4 max-w-xl">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <h2 className="font-semibold text-sm">Quick GRN (Cashier)</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Walk-in / cash purchase — posts stock immediately without a PO. Creates a QUICK GRN document.
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Supplier</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={qgSupplier}
                  onChange={(e) => setQgSupplier(e.target.value)}
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Scan / enter SKU or barcode"
                  value={qgSku}
                  onChange={(e) => setQgSku(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookupSku()}
                  className="h-9"
                />
                <Button variant="outline" onClick={lookupSku}>Lookup</Button>
              </div>
              {qgVariant && (
                <p className="text-xs text-emerald-600 font-medium">
                  {qgVariant.product.name} — {qgVariant.name} ({qgVariant.sku})
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Qty</label>
                  <Input type="number" min={1} value={qgQty} onChange={(e) => setQgQty(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Unit Cost</label>
                  <Input type="number" min={0} value={qgCost} onChange={(e) => setQgCost(e.target.value)} className="h-9" />
                </div>
              </div>
              <Button onClick={submitQuickGrn} disabled={qgBusy} className="gap-1.5 w-full">
                {qgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                Post Quick GRN
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Draft → Post deducts stock (DAMAGE) and reduces supplier balance.</p>
          <SimpleTable
            headers={["Return #", "Supplier", "Lines", "Status", ""]}
            rows={returns.map((r) => [
              r.returnNumber,
              r.supplier?.name ?? "—",
              String(r._count?.items ?? 0),
              <Badge key="s" variant="secondary" className="text-[10px]">{r.status}</Badge>,
              r.status === "DRAFT" ? (
                <Button key="p" size="sm" variant="outline" className="h-7 text-xs" onClick={() => postReturn(r.id)}>Post</Button>
              ) : "—",
            ])}
            empty="No supplier returns"
          />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end max-w-3xl">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Supplier</label>
                <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={invSupplier} onChange={(e) => setInvSupplier(e.target.value)}>
                  <option value="">Select…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Invoice #</label>
                <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Total</label>
                <Input type="number" value={invTotal} onChange={(e) => setInvTotal(e.target.value)} className="h-9" />
              </div>
              <Button onClick={createInvoice} disabled={invBusy} className="h-9 gap-1.5">
                {invBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Post Invoice
              </Button>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Invoice #", "Supplier", "PO", "Total", "Paid", "Status"]}
            rows={invoices.map((i) => [
              i.invoiceNumber,
              i.supplier?.name ?? "—",
              i.purchase?.poNumber ?? "—",
              `LKR ${formatNumber(i.total)}`,
              `LKR ${formatNumber(i.paidAmount)}`,
              <Badge key="s" variant="secondary" className="text-[10px]">{i.status}</Badge>,
            ])}
            empty="No supplier invoices"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">{h || ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-sm text-muted-foreground">{empty}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-t">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-xs">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
