"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList, FileText, Loader2, PackageCheck, Plus, RefreshCw, RotateCcw,
  Send, ShoppingBag, Wallet, Zap, ArrowRight, AlertCircle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientSideTable } from "../../../../components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";
import { QuickGrnModal } from "@/components/procurement/quick-grn-modal";
import { SupplierInvoiceModal } from "@/components/procurement/supplier-invoice-modal";
import { InvoicePaymentModal } from "@/components/procurement/invoice-payment-modal";

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
type BankAccount = { id: string; name: string; code: string };

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  APPROVED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  POSTED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PARTIALLY_PAID: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  CONVERTED: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  REJECTED: "bg-red-500/10 text-red-600 border-red-500/20",
  CANCELLED: "bg-red-500/10 text-red-600 border-red-500/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center ${STATUS_BADGE[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

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

  const [quickGrnOpen, setQuickGrnOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState<string | undefined>(undefined);

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
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
      cell: ({ row }) => <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{row.original.source}</Badge>,
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
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
      id: "due",
      accessorFn: (r) => Math.max(0, r.total - r.paidAmount),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => {
        const due = Math.max(0, row.original.total - row.original.paidAmount);
        return (
          <span className={`text-sm font-semibold ${due > 0.01 ? "text-amber-600" : "text-muted-foreground"}`}>
            LKR {formatNumber(due)}
          </span>
        );
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
            onClick={() => { setPayInvoiceId(row.original.id); setPayOpen(true); }}
          >
            <Wallet className="h-3 w-3" />
            Pay
          </Button>
        );
      },
    },
  ], []);

  const totalDue = useMemo(
    () => invoices.reduce((s, i) => s + Math.max(0, i.total - i.paidAmount), 0),
    [invoices],
  );
  const openDrafts = useMemo(
    () => prs.filter((p) => p.status === "DRAFT" || p.status === "PENDING_APPROVAL").length
      + returns.filter((r) => r.status === "DRAFT").length,
    [prs, returns],
  );

  const STATS = [
    { label: "Purchase Requests", value: String(prs.length), icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Goods Receipts", value: String(grns.length), icon: PackageCheck, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Payables Due", value: `LKR ${formatNumber(totalDue)}`, icon: Wallet, color: "text-amber-600", bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "Pending Actions", value: String(openDrafts), icon: AlertCircle, color: "text-indigo-600", bg: "bg-indigo-500/15", tint: "border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent" },
  ];

  const payableInvoices = useMemo(
    () => invoices.filter((i) => i.total - i.paidAmount > 0.01),
    [invoices],
  );

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Procurement</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {profile.label} · Requests, receipts, returns and supplier payables in one hub
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={load} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
              <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" onClick={() => setQuickGrnOpen(true)} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
              <Zap className="h-[18px] w-[18px] text-amber-500" /> Quick GRN
            </Button>
            <Button variant="outline" onClick={() => setInvoiceOpen(true)} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
              <FileText className="h-[18px] w-[18px]" /> Post Invoice
            </Button>
            <Button variant="outline" onClick={() => { setPayInvoiceId(undefined); setPayOpen(true); }} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
              <Wallet className="h-[18px] w-[18px]" /> Pay Invoice
            </Button>
            <Button variant="outline" onClick={() => router.push("/purchases")} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
              <ShoppingBag className="h-[18px] w-[18px]" /> Purchase Orders
            </Button>
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button className="h-10 rounded-[12px] gap-1.5 text-sm px-4" onClick={() => router.push("/purchases/new")}>
            <Plus className="h-[18px] w-[18px]" /> New PO
          </Button>
        </div>
      </div>

      {/* Workflow strip */}
      <div className="rounded-2xl border bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-transparent dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-transparent border-blue-200/60 dark:border-blue-900 px-5 py-4">
        <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Recommended purchase path</p>
        <div className="flex items-center gap-1.5 mt-2 text-xs font-medium flex-wrap">
          {["New PO", "Confirm", "Receive (GRN)", "Invoice", "Pay"].map((s, i, arr) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="bg-background/90 px-3 py-1.5 rounded-full border shadow-sm">{s}</span>
              {i < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-blue-400" />}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Quick GRN is for walk-in cash purchases only — if a PO already exists, receive against that PO.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {STATS.map((s) => (
          <Card
            key={s.label}
            className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
          >
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tabular-nums truncate">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tables */}
      <Tabs defaultValue="requests">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="requests" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Purchase Requests
          </TabsTrigger>
          <TabsTrigger value="grn" className="gap-1.5">
            <PackageCheck className="h-3.5 w-3.5" /> Goods Receipts
          </TabsTrigger>
          <TabsTrigger value="returns" className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Supplier Returns
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Supplier Invoices
          </TabsTrigger>
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Formal GRN documents from PO receive, Direct GRN, or Quick GRN.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setQuickGrnOpen(true)}>
              <Zap className="h-3.5 w-3.5 text-amber-500" /> Quick GRN
            </Button>
          </div>
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

        <TabsContent value="invoices" className="mt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Payable invoices — post new invoices and record payments from here.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setInvoiceOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Post Invoice
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setPayInvoiceId(undefined); setPayOpen(true); }}>
                <Wallet className="h-3.5 w-3.5" /> Pay Invoice
              </Button>
            </div>
          </div>
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

      {/* Modals */}
      <QuickGrnModal
        open={quickGrnOpen}
        onClose={() => setQuickGrnOpen(false)}
        onPosted={load}
        suppliers={suppliers}
        showExpiry={showExpiry}
        showBatch={showBatch}
      />
      <SupplierInvoiceModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onPosted={load}
        suppliers={suppliers}
      />
      <InvoicePaymentModal
        open={payOpen}
        onClose={() => { setPayOpen(false); setPayInvoiceId(undefined); }}
        onPaid={load}
        invoices={payableInvoices}
        banks={banks}
        initialInvoiceId={payInvoiceId}
      />
    </div>
  );
}
