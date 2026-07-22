"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  FileText, Plus, Loader2, RefreshCw, Trash2, Users, Send, CheckCircle2,
  Clock, Banknote, ExternalLink, Package, XCircle, Printer, GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalFooterButtonClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow } from "@/components/table";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { useAuthStore } from "@/stores/auth-store";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { QuotationApprovalPanel } from "@/components/quotations/quotation-approval-panel";
import { QuotationPrintModal } from "@/components/quotations/quotation-print-modal";
import { bypassesWorkflowApproval, type WorkflowInstanceLike } from "@/lib/workflow-access";

interface Quotation {
  id: string;
  quoteNumber: string;
  status: string;
  total: number;
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  validUntil?: string | null;
  createdAt: string;
  notes?: string | null;
  customer?: { firstName: string; lastName?: string | null; phone: string; email?: string | null } | null;
  items: {
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
    total?: number;
    variant: { sku: string; name?: string | null; product: { name: string } };
  }[];
}

interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface VariantOpt {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  stock?: number;
}
interface LineItem { variantId: string; label: string; quantity: number; unitPrice: number }

type StatusFilter = "ALL" | "DRAFT" | "PENDING_APPROVAL" | "SENT" | "ACCEPTED" | "REJECTED" | "CONVERTED" | "EXPIRED";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  DRAFT:              { label: "Draft",              variant: "secondary" },
  PENDING_APPROVAL:   { label: "Pending Approval",   variant: "warning"   },
  SENT:               { label: "Sent",               variant: "default"   },
  ACCEPTED:  { label: "Accepted",  variant: "success"   },
  REJECTED:  { label: "Rejected",  variant: "danger"    },
  CONVERTED: { label: "Converted", variant: "success"   },
  EXPIRED:   { label: "Expired",   variant: "warning"   },
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PENDING_APPROVAL", label: "Pending Approval" },
  { key: "SENT", label: "Sent" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CONVERTED", label: "Converted" },
  { key: "EXPIRED", label: "Expired" },
];

const GUIDE = [
  { title: "Create Quote", desc: "Add parts, set prices, optional customer and validity date for workshop or fleet clients." },
  { title: "Submit for Approval", desc: "Draft quotes go to Branch Manager → Admin approval before they can be sent to customers." },
  { title: "Print & Send", desc: "After approval, print a professional quotation PDF and share with the customer." },
  { title: "Accept & Convert", desc: "When the customer confirms, accept the quote and convert to a POS sale." },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function customerName(q: Quotation) {
  if (!q.customer) return "Walk-in";
  return `${q.customer.firstName} ${q.customer.lastName ?? ""}`.trim();
}

function buildColumns(
  onView: (q: Quotation) => void,
  onStatus: (id: string, status: string) => void,
  onSubmitApproval: (id: string) => void,
  onPrint: (q: Quotation) => void,
): ColumnDef<Quotation>[] {
  return [
    {
      accessorKey: "quoteNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Quote #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-[120px]">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <span className="font-mono text-xs font-semibold">{row.original.quoteNumber}</span>
        </div>
      ),
    },
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => {
        const q = row.original;
        return (
          <div>
            <p className="text-sm font-medium">{customerName(q)}</p>
            {q.customer?.phone && (
              <p className="text-[10px] text-muted-foreground font-mono">{q.customer.phone}</p>
            )}
          </div>
        );
      },
    },
    {
      id: "items",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {row.original.items.length}
        </span>
      ),
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => (
        <span className="text-sm font-bold">LKR {formatNumber(row.original.total)}</span>
      ),
    },
    {
      id: "validUntil",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Valid Until" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {row.original.validUntil ? fmtDate(row.original.validUntil) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = STATUS_CFG[row.original.status] ?? { label: row.original.status, variant: "secondary" as const };
        return <Badge variant={cfg.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center">{cfg.label}</Badge>;
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const q = row.original;
        const more: { text: string; function: () => void }[] = [];
        more.push({ text: "Print Quotation", function: () => onPrint(q) });
        if (q.status === "DRAFT") more.push({ text: "Submit for Approval", function: () => onSubmitApproval(q.id) });
        if (q.status === "SENT") {
          more.push({ text: "Accept", function: () => onStatus(q.id, "ACCEPTED") });
          more.push({ text: "Reject", function: () => onStatus(q.id, "REJECTED") });
        }
        if (q.status === "ACCEPTED") {
          more.push({ text: "Mark Converted", function: () => onStatus(q.id, "CONVERTED") });
        }
        return (
          <TableActionsRow
            showAction={{ action: () => onView(q) }}
            dropMoreActions={more}
          />
        );
      },
    },
  ];
}

function QuoteDetailDialog({
  quote,
  onClose,
  onStatus,
  onSubmitApproval,
  onPrint,
  workflow,
  workflowActing,
  onApprove,
  onReject,
  userId,
  userRole,
}: {
  quote: Quotation | null;
  onClose: () => void;
  onStatus: (id: string, status: string) => void;
  onSubmitApproval: (id: string) => void;
  onPrint: (q: Quotation) => void;
  workflow: WorkflowInstanceLike | null;
  workflowActing: boolean;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  userId?: string;
  userRole?: string;
}) {
  if (!quote) return null;
  const cfg = STATUS_CFG[quote.status] ?? { label: quote.status, variant: "secondary" as const };

  return (
    <Dialog open={!!quote} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono">{quote.quoteNumber}</span>
            <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border p-3 space-y-1">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Customer</p>
            <p className="font-medium">{customerName(quote)}</p>
            {quote.customer?.phone && <p className="text-xs text-muted-foreground font-mono">{quote.customer.phone}</p>}
          </div>
          <div className="rounded-xl border p-3 space-y-1">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Dates</p>
            <p className="text-xs">Created: <span className="font-medium">{fmtDate(quote.createdAt)}</span></p>
            <p className="text-xs">Valid until: <span className="font-medium">{quote.validUntil ? fmtDate(quote.validUntil) : "—"}</span></p>
          </div>
        </div>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                {["Part", "SKU", "Qty", "Unit Price", "Line Total"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {quote.items.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-xs font-medium">{item.variant.product.name}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{item.variant.sku}</td>
                  <td className="px-3 py-2 text-xs">{item.quantity}</td>
                  <td className="px-3 py-2 text-xs">LKR {formatNumber(item.unitPrice)}</td>
                  <td className="px-3 py-2 text-xs font-semibold">LKR {formatNumber(item.total ?? item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {quote.notes && (
          <div className="rounded-xl border p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">Notes</p>
            <p className="text-sm text-muted-foreground">{quote.notes}</p>
          </div>
        )}

        {quote.status === "PENDING_APPROVAL" && (
          <QuotationApprovalPanel
            instance={workflow}
            userId={userId}
            userRole={userRole}
            acting={workflowActing}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}

        <div className="flex justify-between items-center pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Subtotal: LKR {formatNumber(quote.subtotal)}</p>
            {(quote.taxAmount ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">Tax: LKR {formatNumber(quote.taxAmount ?? 0)}</p>
            )}
            <p className="text-lg font-bold">Total: LKR {formatNumber(quote.total)}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onPrint(quote)}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            {quote.status === "DRAFT" && (
              <Button size="sm" className="gap-1" onClick={() => { onSubmitApproval(quote.id); }}>
                <GitBranch className="h-3.5 w-3.5" /> Submit for Approval
              </Button>
            )}
            {quote.status === "SENT" && (
              <>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => { onStatus(quote.id, "ACCEPTED"); onClose(); }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Accept
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => { onStatus(quote.id, "REJECTED"); onClose(); }}>
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
              </>
            )}
            {quote.status === "ACCEPTED" && (
              <Button size="sm" className="gap-1" asChild>
                <Link href="/pos"><ExternalLink className="h-3.5 w-3.5" /> Open POS</Link>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QuotationsPage() {
  const { profile } = useShopWorkspace();
  const { user } = useAuthStore();
  const { settings: receiptSettings } = useReceiptSettings();
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewQuote, setViewQuote] = useState<Quotation | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [pickVariant, setPickVariant] = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [printQuote, setPrintQuote] = useState<Quotation | null>(null);
  const [viewWorkflow, setViewWorkflow] = useState<WorkflowInstanceLike | null>(null);
  const [workflowActing, setWorkflowActing] = useState(false);

  const shopBranding = useMemo(() => ({
    shopName: receiptSettings.shopName,
    tagline: receiptSettings.tagline,
    address1: receiptSettings.address1,
    address2: receiptSettings.address2,
    phone: receiptSettings.phone,
    email: receiptSettings.email,
    website: receiptSettings.website,
    logoUrl: receiptSettings.logoUrl,
  }), [receiptSettings]);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Quotation[]>("/spare-parts/quotations");
      setQuotes(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error("Failed to load quotations"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);
  useEffect(() => {
    api.get<{ data: Customer[] }>("/customers?limit=200")
      .then((r) => setCustomers(r.data?.data ?? (r.data as unknown as Customer[]) ?? []))
      .catch(() => {});
    api.get<Array<VariantOpt & { sellingPrice?: number }>>("/pos/products")
      .then((r) => {
        const raw = Array.isArray(r.data) ? r.data : [];
        setVariants(raw.map((v) => ({
          variantId: v.variantId,
          productName: v.productName,
          variantName: v.variantName,
          sku: v.sku,
          unitPrice: Number(v.unitPrice ?? v.sellingPrice ?? 0),
          stock: v.stock,
        })));
      })
      .catch(() => {});
  }, []);

  const loadWorkflow = useCallback(async (quoteId: string) => {
    try {
      const res = await api.get<WorkflowInstanceLike>(`/workflows/instances/Quotation/${quoteId}`);
      setViewWorkflow(res.data ?? null);
    } catch {
      setViewWorkflow(null);
    }
  }, []);

  useEffect(() => {
    if (viewQuote?.status === "PENDING_APPROVAL") {
      loadWorkflow(viewQuote.id);
    } else {
      setViewWorkflow(null);
    }
  }, [viewQuote?.id, viewQuote?.status, loadWorkflow]);

  const submitForApproval = useCallback(async (id: string) => {
    try {
      await api.post(`/spare-parts/quotations/${id}/submit-approval`);
      toast.success(bypassesWorkflowApproval(user?.role) ? "Quotation approved and marked Sent" : "Submitted for manager approval");
      fetchQuotes();
      if (viewQuote?.id === id) {
        const updated = await api.get<Quotation>(`/spare-parts/quotations/${id}`);
        setViewQuote(updated.data);
        if (updated.data.status === "PENDING_APPROVAL") loadWorkflow(id);
      }
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchQuotes, viewQuote?.id, user?.role, loadWorkflow]);

  const handleWorkflowApprove = useCallback(async (taskId: string) => {
    setWorkflowActing(true);
    try {
      await api.put(`/workflows/tasks/${taskId}/approve`, {});
      toast.success("Quotation approved");
      fetchQuotes();
      if (viewQuote) {
        const updated = await api.get<Quotation>(`/spare-parts/quotations/${viewQuote.id}`);
        setViewQuote(updated.data);
        loadWorkflow(viewQuote.id);
      }
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setWorkflowActing(false); }
  }, [fetchQuotes, viewQuote, loadWorkflow]);

  const handleWorkflowReject = useCallback(async (taskId: string) => {
    setWorkflowActing(true);
    try {
      await api.put(`/workflows/tasks/${taskId}/reject`, {});
      toast.success("Quotation rejected — returned to draft");
      fetchQuotes();
      if (viewQuote) {
        const updated = await api.get<Quotation>(`/spare-parts/quotations/${viewQuote.id}`);
        setViewQuote(updated.data);
        setViewWorkflow(null);
      }
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setWorkflowActing(false); }
  }, [fetchQuotes, viewQuote]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await api.put(`/spare-parts/quotations/${id}/status`, { status });
      toast.success("Status updated");
      fetchQuotes();
      setViewQuote((prev) => (prev?.id === id ? { ...prev, status } : prev));
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchQuotes]);

  const resetForm = () => {
    setCustomerId("");
    setValidUntil("");
    setNotes("");
    setItems([]);
    setPickVariant("");
    setPartSearch("");
  };

  const appendLineFromVariant = useCallback((variantId: string, showDuplicateToast = true): boolean => {
    const v = variants.find((x) => x.variantId === variantId);
    if (!v) return false;

    let added = false;
    setItems((prev) => {
      if (prev.some((i) => i.variantId === v.variantId)) {
        if (showDuplicateToast) toast.error("Part already added");
        return prev;
      }
      added = true;
      return [...prev, {
        variantId: v.variantId,
        label: `${v.productName} — ${v.sku}`,
        quantity: 1,
        unitPrice: v.unitPrice,
      }];
    });

    if (added) {
      setPickVariant("");
      setPartSearch("");
    }
    return added;
  }, [variants]);

  const addLine = () => {
    if (!pickVariant) {
      toast.error("Select a part to add");
      return;
    }
    appendLineFromVariant(pickVariant);
  };

  const handlePickVariant = (variantId: string) => {
    appendLineFromVariant(variantId);
  };

  const createQuote = async () => {
    let lines = [...items];
    if (pickVariant && !lines.some((i) => i.variantId === pickVariant)) {
      const v = variants.find((x) => x.variantId === pickVariant);
      if (v) {
        lines.push({
          variantId: v.variantId,
          label: `${v.productName} — ${v.sku}`,
          quantity: 1,
          unitPrice: v.unitPrice,
        });
      }
    }
    if (!lines.length) {
      toast.error("Add at least one part to the quotation");
      return;
    }
    setSaving(true);
    try {
      await api.post("/spare-parts/quotations", {
        customerId: customerId || undefined,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        items: lines.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
      });
      toast.success("Quotation created");
      setCreateOpen(false);
      resetForm();
      fetchQuotes();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const filteredVariants = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter((v) =>
      v.productName.toLowerCase().includes(q) ||
      v.sku.toLowerCase().includes(q) ||
      v.variantName.toLowerCase().includes(q),
    );
  }, [variants, partSearch]);

  const displayed = useMemo(() =>
    statusFilter === "ALL" ? quotes : quotes.filter((q) => q.status === statusFilter),
  [quotes, statusFilter]);

  const draftCount = quotes.filter((q) => q.status === "DRAFT").length;
  const sentCount = quotes.filter((q) => q.status === "SENT").length;
  const totalValue = quotes.reduce((s, q) => s + q.total, 0);
  const totalPreview = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const canSave = items.length > 0 || !!pickVariant;

  const selectedVariant = useMemo(
    () => variants.find((v) => v.variantId === pickVariant),
    [variants, pickVariant],
  );

  const STATS = [
    { label: "Total Quotes",  value: quotes.length,  icon: FileText,     color: "text-blue-600",    bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Draft",         value: draftCount,     icon: Clock,        color: "text-amber-600",   bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "Sent",          value: sentCount,      icon: Send,         color: "text-violet-600",  bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Pipeline Value", value: `LKR ${formatNumber(totalValue)}`, icon: Banknote, color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
  ];

  const columns = useMemo(
    () => buildColumns((q) => setViewQuote(q), updateStatus, submitForApproval, setPrintQuote),
    [updateStatus, submitForApproval],
  );

  return (
    <ModuleGate module="quotations">
      <div className="page-shell">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight flex items-center gap-2">
              <span>{profile.emoji}</span> Quotations
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Create quotes for workshops, fleet & wholesale customers
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={fetchQuotes} className="gap-1.5">
                <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" className="gap-1.5" asChild>
                <Link href="/customers"><Users className="h-[18px] w-[18px]" /> Customers</Link>
              </Button>
            </div>
            <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
            <Button className="gap-1.5" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-[18px] w-[18px]" /> New Quotation
            </Button>
          </div>
        </div>

        {/* KPI stats */}
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
                  <p className={`${typeof s.value === "string" ? "text-lg" : "text-[22px]"} font-bold leading-none tabular-nums`}>{loading && typeof s.value === "number" ? "—" : s.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          {STATUS_FILTERS.map((f) => {
            const count = f.key === "ALL" ? quotes.length : quotes.filter((q) => q.status === f.key).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  statusFilter === f.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40",
                )}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Table */}
        {displayed.length === 0 && !loading ? (
          <Card className="border-dashed rounded-[18px]">
            <CardContent className="p-10 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">No quotations yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create a quotation for workshop, fleet or wholesale customers with parts and custom pricing.
              </p>
              <Button className="gap-1.5 mt-2" onClick={() => { resetForm(); setCreateOpen(true); }}>
                <Plus className="h-4 w-4" /> New Quotation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ClientSideTable
            data={displayed}
            columns={columns}
            searchableColumns={[
              { id: "quoteNumber", title: "Quote #" },
            ]}
            filterableColumns={[
              {
                id: "status",
                title: "Status",
                options: STATUS_FILTERS.filter((f) => f.key !== "ALL").map((f) => ({
                  label: f.label,
                  value: f.key,
                })),
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "quotations-export" }}
          />
        )}

        {/* Guide */}
        <div className="flex flex-wrap gap-2">
          {GUIDE.map((g) => (
            <div
              key={g.title}
              title={g.desc}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-card text-xs font-medium max-w-full"
            >
              <span className="font-semibold text-foreground shrink-0">{g.title}</span>
              <span className="text-muted-foreground truncate hidden sm:inline">{g.desc}</span>
            </div>
          ))}
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Quotation</DialogTitle>
            </DialogHeader>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Customer (optional)</Label>
                <Select value={customerId || undefined} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Walk-in / select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName ?? ""} · {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valid until</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Add parts</Label>
              <Input
                placeholder="Search parts by name or SKU…"
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
              />
              <div className="flex gap-2">
                <Select value={pickVariant || undefined} onValueChange={handlePickVariant}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select part to add…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {filteredVariants.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">No parts match your search</div>
                    ) : filteredVariants.map((v) => (
                      <SelectItem key={v.variantId} value={v.variantId}>
                        {v.productName} — {v.sku} · LKR {formatNumber(v.unitPrice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={addLine} disabled={!pickVariant} className="gap-1 shrink-0">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
              {items.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Select a part from the list — it will be added automatically. You can add multiple parts before saving.
                </p>
              )}
              {selectedVariant && !items.some((i) => i.variantId === selectedVariant.variantId) && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  <span className="text-amber-800">
                    {selectedVariant.variantName !== selectedVariant.productName
                      ? `${selectedVariant.variantName} · `
                      : ""}
                    Stock: {selectedVariant.stock ?? 0} — click Add or pick again to include this part
                  </span>
                  <span className="font-semibold text-primary">
                    LKR {formatNumber(selectedVariant.unitPrice)}
                  </span>
                </div>
              )}
              {selectedVariant && items.some((i) => i.variantId === selectedVariant.variantId) && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {selectedVariant.variantName !== selectedVariant.productName
                      ? `${selectedVariant.variantName} · `
                      : ""}
                    Stock: {selectedVariant.stock ?? 0}
                  </span>
                  <span className="font-semibold text-primary">
                    Unit price: LKR {formatNumber(selectedVariant.unitPrice)}
                  </span>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      {["Part", "Qty", "Unit Price", ""].map((h) => (
                        <th key={h || "rm"} className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => (
                      <tr key={item.variantId}>
                        <td className="px-3 py-2 text-xs truncate max-w-[200px]">{item.label}</td>
                        <td className="px-3 py-2">
                          <Input type="number" min={1} className="w-16 h-8"
                            value={item.quantity}
                            onChange={(e) => setItems((prev) => prev.map((it, i) =>
                              i === idx ? { ...it, quantity: parseInt(e.target.value, 10) || 1 } : it,
                            ))} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} className="w-24 h-8"
                            value={item.unitPrice}
                            onChange={(e) => setItems((prev) => prev.map((it, i) =>
                              i === idx ? { ...it, unitPrice: parseFloat(e.target.value) || 0 } : it,
                            ))} />
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} placeholder="Terms, delivery notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <span className="font-bold">Total: LKR {formatNumber(totalPreview)}</span>
              <div className={cn(modalFooterButtonClass, "flex gap-2")}>
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="button" onClick={createQuote} disabled={saving || !canSave} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Save Quotation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <QuoteDetailDialog
          quote={viewQuote}
          onClose={() => setViewQuote(null)}
          onStatus={updateStatus}
          onSubmitApproval={submitForApproval}
          onPrint={setPrintQuote}
          workflow={viewWorkflow}
          workflowActing={workflowActing}
          onApprove={handleWorkflowApprove}
          onReject={handleWorkflowReject}
          userId={user?.id}
          userRole={user?.role}
        />

        {printQuote && (
          <QuotationPrintModal
            quote={printQuote}
            shop={shopBranding}
            onClose={() => setPrintQuote(null)}
          />
        )}
      </div>
    </ModuleGate>
  );
}
