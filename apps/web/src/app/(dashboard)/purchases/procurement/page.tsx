"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList, FileText, Loader2, PackageCheck, Plus, RefreshCw, RotateCcw, Send, ShoppingBag, Wallet, Zap,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";

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
type BankAccount = { id: string; name: string; code: string };

export default function ProcurementHubPage() {
  const router = useRouter();
  const { profile } = useShopWorkspace();
  const showExpiry = hasExpiryTracking(profile);
  const showBatch = hasBatchTracking(profile);
  const [loading, setLoading] = useState(true);
  const [prs, setPrs] = useState<PrRow[]>([]);
  const [grns, setGrns] = useState<GrnRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);

  const [qgSupplier, setQgSupplier] = useState("");
  const [qgSku, setQgSku] = useState("");
  const [qgQty, setQgQty] = useState("1");
  const [qgCost, setQgCost] = useState("");
  const [qgExpiry, setQgExpiry] = useState("");
  const [qgBatch, setQgBatch] = useState("");
  const [qgVariant, setQgVariant] = useState<VariantOpt | null>(null);
  const [qgBusy, setQgBusy] = useState(false);

  const [invSupplier, setInvSupplier] = useState("");
  const [invNumber, setInvNumber] = useState("");
  const [invTotal, setInvTotal] = useState("");
  const [invBusy, setInvBusy] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payChequeDueDate, setPayChequeDueDate] = useState("");
  const [payChequeBankName, setPayChequeBankName] = useState("");
  const [payChequeBankAccountId, setPayChequeBankAccountId] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prR, grnR, retR, invR, supR, bankR] = await Promise.all([
        api.get<{ data: PrRow[] }>("/procurement/purchase-requests?limit=50"),
        api.get<{ data: GrnRow[] }>("/procurement/grn?limit=50"),
        api.get<{ data: ReturnRow[] }>("/procurement/supplier-returns?limit=50"),
        api.get<{ data: InvoiceRow[] }>("/procurement/supplier-invoices?limit=50"),
        api.get<{ data: Supplier[] }>("/suppliers?limit=100"),
        api.get<BankAccount[]>("/accounting/bank-accounts"),
      ]);
      setPrs(prR.data?.data ?? []);
      setGrns(grnR.data?.data ?? []);
      setReturns(retR.data?.data ?? []);
      setInvoices(invR.data?.data ?? []);
      setSuppliers(supR.data?.data ?? []);
      setBanks(Array.isArray(bankR.data) ? bankR.data : []);
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
    if (showExpiry && !qgExpiry.trim()) { toast.error("Expiry date is required"); return; }
    setQgBusy(true);
    try {
      const res = await api.post<{ grnNumber: string }>("/procurement/grn/quick", {
        supplierId: qgSupplier,
        lines: [{
          variantId: qgVariant.id,
          quantity: qty,
          unitCost: cost,
          ...(showExpiry && qgExpiry ? { expiryDate: qgExpiry } : {}),
          ...(showBatch && qgBatch.trim() ? { batchNumber: qgBatch.trim() } : {}),
        }],
      });
      toast.success(`Quick GRN posted: ${(res.data as { grnNumber?: string })?.grnNumber ?? "OK"}`);
      setQgSku(""); setQgVariant(null); setQgQty("1"); setQgCost(""); setQgExpiry(""); setQgBatch("");
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

  const submitInvoicePayment = async () => {
    if (!payInvoiceId) { toast.error("Select an invoice"); return; }
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter valid payment amount"); return; }
    if (payMethod === "CHEQUE" && !payReference.trim()) {
      toast.error("Cheque number required");
      return;
    }
    setPayBusy(true);
    try {
      await api.post(`/procurement/supplier-invoices/${payInvoiceId}/pay`, {
        amount,
        method: payMethod,
        reference: payReference || undefined,
        notes: payNotes || undefined,
        chequeNumber: payMethod === "CHEQUE" ? payReference : undefined,
        chequeDueDate: payMethod === "CHEQUE" && payChequeDueDate ? payChequeDueDate : undefined,
        chequeBankName: payMethod === "CHEQUE" && payChequeBankName ? payChequeBankName : undefined,
        chequeBankAccountId: payMethod === "CHEQUE" && payChequeBankAccountId ? payChequeBankAccountId : undefined,
      });
      toast.success("Supplier payment recorded");
      setPayAmount("");
      setPayReference("");
      setPayNotes("");
      setPayChequeDueDate("");
      setPayChequeBankName("");
      setPayChequeBankAccountId("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Invoice payment failed");
    } finally {
      setPayBusy(false);
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

  const convertPr = async (id: string) => {
    if (!suppliers[0]) { toast.error("Add a supplier first"); return; }
    try {
      const po = await api.post<{ poNumber: string }>(`/procurement/purchase-requests/${id}/convert`, {
        supplierId: suppliers[0].id,
      });
      toast.success(`Converted to ${(po.data as { poNumber?: string })?.poNumber ?? "PO"}`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Convert failed");
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

  const prColumns = useMemo<ColumnDef<PrRow>[]>(() => [
    {
      id: "requestNumber",
      accessorKey: "requestNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="PR #" />,
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.requestNumber}</span>,
    },
    {
      id: "items",
      accessorFn: (r) => r.items?.length ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => <span className="text-sm">{row.original.items?.length ?? 0} lines</span>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <Badge variant="secondary" className="text-[10px]">{row.original.status}</Badge>,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("en-LK")}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex gap-1 justify-end">
            {p.status === "DRAFT" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => submitPr(p.id)}>
                <Send className="h-3 w-3" /> Submit
              </Button>
            )}
            {p.status === "APPROVED" && !p.convertedPo && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => convertPr(p.id)}>
                → PO
              </Button>
            )}
            {p.convertedPo && (
              <span className="text-[10px] font-mono text-muted-foreground">{p.convertedPo.poNumber}</span>
            )}
          </div>
        );
      },
    },
  ], [suppliers]);

  const grnColumns = useMemo<ColumnDef<GrnRow>[]>(() => [
    {
      id: "grnNumber",
      accessorKey: "grnNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="GRN #" />,
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.grnNumber}</span>,
    },
    {
      id: "source",
      accessorKey: "source",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.source}</Badge>,
    },
    {
      id: "supplier",
      accessorFn: (r) => r.supplier?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => <span className="text-sm">{row.original.supplier?.name ?? "—"}</span>,
    },
    {
      id: "po",
      accessorFn: (r) => r.purchase?.poNumber ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="PO" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.purchase?.poNumber ?? "—"}</span>,
    },
    {
      id: "lines",
      accessorFn: (r) => r._count?.items ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,
      cell: ({ row }) => <span className="text-sm">{row.original._count?.items ?? 0}</span>,
    },
    {
      id: "receivedAt",
      accessorKey: "receivedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Received" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.receivedAt).toLocaleString("en-LK")}
        </span>
      ),
    },
  ], []);

  const returnColumns = useMemo<ColumnDef<ReturnRow>[]>(() => [
    {
      id: "returnNumber",
      accessorKey: "returnNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Return #" />,
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.returnNumber}</span>,
    },
    {
      id: "supplier",
      accessorFn: (r) => r.supplier?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => <span className="text-sm">{row.original.supplier?.name ?? "—"}</span>,
    },
    {
      id: "lines",
      accessorFn: (r) => r._count?.items ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,
      cell: ({ row }) => <span className="text-sm">{row.original._count?.items ?? 0}</span>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <Badge variant="secondary" className="text-[10px]">{row.original.status}</Badge>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        row.original.status === "DRAFT" ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => postReturn(row.original.id)}>
            Post
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ], []);

  const invoiceColumns = useMemo<ColumnDef<InvoiceRow>[]>(() => [
    {
      id: "invoiceNumber",
      accessorKey: "invoiceNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      id: "supplier",
      accessorFn: (r) => r.supplier?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => <span className="text-sm">{row.original.supplier?.name ?? "—"}</span>,
    },
    {
      id: "po",
      accessorFn: (r) => r.purchase?.poNumber ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="PO" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.purchase?.poNumber ?? "—"}</span>,
    },
    {
      id: "total",
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => <span className="text-sm font-medium">LKR {formatNumber(row.original.total)}</span>,
    },
    {
      id: "paid",
      accessorKey: "paidAmount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Paid" />,
      cell: ({ row }) => (
        <span className="text-sm text-emerald-600">LKR {formatNumber(row.original.paidAmount)}</span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <Badge variant="secondary" className="text-[10px]">{row.original.status}</Badge>,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const due = Math.max(0, row.original.total - row.original.paidAmount);
        if (due <= 0.01) return <span className="text-xs text-muted-foreground">Settled</span>;
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => {
              setPayInvoiceId(row.original.id);
              setPayAmount(due.toFixed(2));
            }}
          >
            <Wallet className="h-3 w-3" />
            Pay
          </Button>
        );
      },
    },
  ], []);

  const STATS = [
    { label: "Purchase Requests", value: prs.length, icon: ClipboardList, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Goods Receipts", value: grns.length, icon: PackageCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Supplier Returns", value: returns.length, icon: RotateCcw, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Invoices", value: invoices.length, icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Procurement</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Recommended: PO → Receive → Invoice → Pay
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} className="gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" /> Purchase Orders
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/purchases/new")}>
            <Plus className="h-3.5 w-3.5" /> New PO
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-900 p-4">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Best purchase path</p>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs font-medium flex-wrap">
          {["New PO", "→ Confirm", "→ Receive (GRN)", "→ Invoice", "→ Pay"].map((s) => (
            <span key={s} className="bg-background/80 px-2.5 py-1 rounded-full border">{s}</span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Quick GRN is for walk-in cash only. If a PO already exists, receive against that PO.
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="requests">Purchase Requests</TabsTrigger>
          <TabsTrigger value="grn">GRN Documents</TabsTrigger>
          <TabsTrigger value="quick">Quick GRN (exception)</TabsTrigger>
          <TabsTrigger value="returns">Supplier Returns</TabsTrigger>
          <TabsTrigger value="invoices">Supplier Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Request stock → approve → convert to PO</p>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={prs}
              columns={prColumns}
              pageCount={Math.ceil(prs.length / 10) || 1}
              searchableColumns={[
                { id: "requestNumber", title: "PR #" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "purchase-requests" }}
            />
          )}
        </TabsContent>

        <TabsContent value="grn" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Formal GRN documents from PO receive, Direct GRN, or Quick GRN.
          </p>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={grns}
              columns={grnColumns}
              pageCount={Math.ceil(grns.length / 10) || 1}
              searchableColumns={[
                { id: "grnNumber", title: "GRN #" },
                { id: "supplier", title: "Supplier" },
                { id: "source", title: "Source" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "grn-documents" }}
            />
          )}
        </TabsContent>

        <TabsContent value="quick" className="mt-4">
          <Card>
            <CardContent className="p-5 space-y-4 max-w-xl">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Quick GRN (exception)</h2>
                  <p className="text-xs text-muted-foreground">
                    Walk-in cash only — if open PO exists, use Purchases → Receive Items instead
                  </p>
                </div>
              </div>
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
                {showExpiry && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Expiry Date <span className="text-destructive">*</span></label>
                    <Input type="date" value={qgExpiry} onChange={(e) => setQgExpiry(e.target.value)} className="h-9" />
                  </div>
                )}
                {showBatch && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Batch #</label>
                    <Input value={qgBatch} onChange={(e) => setQgBatch(e.target.value)} placeholder="Optional" className="h-9 font-mono" />
                  </div>
                )}
              </div>
              <Button onClick={submitQuickGrn} disabled={qgBusy} className="gap-1.5 w-full">
                {qgBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                Post Quick GRN
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Draft → Post deducts stock and reduces supplier balance.</p>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={returns}
              columns={returnColumns}
              pageCount={Math.ceil(returns.length / 10) || 1}
              searchableColumns={[
                { id: "returnNumber", title: "Return #" },
                { id: "supplier", title: "Supplier" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "supplier-returns" }}
            />
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Supplier</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={invSupplier}
                  onChange={(e) => setInvSupplier(e.target.value)}
                >
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
          <Card>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Invoice</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={payInvoiceId}
                  onChange={(e) => setPayInvoiceId(e.target.value)}
                >
                  <option value="">Select invoice…</option>
                  {invoices.map((inv) => {
                    const due = inv.total - inv.paidAmount;
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} · {inv.supplier?.name ?? "Supplier"} · Due {formatNumber(Math.max(0, due))}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Amount</label>
                <Input type="number" min="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Method</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">{payMethod === "CHEQUE" ? "Cheque #" : "Reference"}</label>
                <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} className="h-9" />
              </div>
              <Button onClick={submitInvoicePayment} disabled={payBusy} className="h-9 gap-1.5">
                {payBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                Pay Invoice
              </Button>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Notes</label>
                <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="h-9" />
              </div>
              {payMethod === "CHEQUE" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Cheque due date</label>
                    <Input type="date" value={payChequeDueDate} onChange={(e) => setPayChequeDueDate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Cheque bank</label>
                    <Input value={payChequeBankName} onChange={(e) => setPayChequeBankName(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Company bank account</label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={payChequeBankAccountId}
                      onChange={(e) => setPayChequeBankAccountId(e.target.value)}
                    >
                      <option value="">Select account…</option>
                      {banks.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                    </select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={invoices}
              columns={invoiceColumns}
              pageCount={Math.ceil(invoices.length / 10) || 1}
              searchableColumns={[
                { id: "invoiceNumber", title: "Invoice #" },
                { id: "supplier", title: "Supplier" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "supplier-invoices" }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
