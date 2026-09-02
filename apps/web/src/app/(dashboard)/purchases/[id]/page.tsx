"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { LoadingCenter } from "@/components/ui/loading";
import { useParams, useRouter } from "next/navigation";
import {
  Package, CheckCircle2, XCircle, Clock, Printer, Download, Ban, Tag, Send,
  ArrowLeft, Phone, Mail, MapPin, Calendar, Hash, FileText,
  Truck, MoreHorizontal, ChevronRight, Banknote, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageKpiGrid, pageKpi } from "@/components/ui/page-kpi";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { ReceiveItemsModal } from "@/components/purchases/receive-items-modal";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";
import { POApprovalPanel } from "@/components/purchases/po-approval-panel";
import type { WorkflowInstanceLike } from "@/lib/workflow-access";

interface POItem {
  id: string; variantId: string; productName: string; variantName: string; sku: string;
  orderedQty: number; receivedQty: number; rejectedQty: number;
  unitCost: number; discount: number; taxRate: number; taxAmount: number; total: number;
  variant?: { size?: string | null; color?: string | null; images?: string[] };
}
interface Supplier {
  id: string; name: string; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null;
}
interface PO {
  id: string; poNumber: string; status: string;
  orderDate: string; expectedDate?: string | null; receivedDate?: string | null;
  subtotal: number; taxAmount: number; discountAmount: number; total: number; paidAmount: number;
  notes?: string | null; reference?: string | null; paymentTerms?: string | null;
  createdAt: string; updatedAt: string; createdBy?: string | null;
  supplier: Supplier;
  items: POItem[];
  _count?: { items: number };
}

const STATUS_CFG: Record<string, {
  label: string;
  variant: "softSuccess" | "softWarning" | "softDanger" | "secondary" | "softInfo";
  icon: React.ElementType;
}> = {
  DRAFT:              { label: "Draft",            variant: "secondary",   icon: FileText },
  PENDING_APPROVAL:   { label: "Pending Approval", variant: "softWarning", icon: Clock },
  CONFIRMED:          { label: "Ordered",          variant: "softInfo",    icon: Truck },
  SENT:               { label: "Ordered",          variant: "softInfo",    icon: Truck },
  PARTIALLY_RECEIVED: { label: "Partial",          variant: "softWarning", icon: Package },
  RECEIVED:           { label: "Received",         variant: "softSuccess", icon: CheckCircle2 },
  CANCELLED:          { label: "Cancelled",        variant: "softDanger",  icon: XCircle },
};

function fmt(n: number) {
  return `LKR ${formatNumber(n)}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "2-digit" });
}

function MetaItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

function StatusTimeline({ status, orderDate }: { status: string; orderDate: string }) {
  const steps = [
    { key: "CONFIRMED",          label: "Ordered",            icon: Truck },
    { key: "PARTIALLY_RECEIVED", label: "Partially Received", icon: Package },
    { key: "RECEIVED",           label: "Completed",          icon: CheckCircle2 },
    { key: "CANCELLED",          label: "Cancelled",          icon: XCircle },
  ];
  const order = ["DRAFT", "CONFIRMED", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"];
  const currentIdx = order.indexOf(status);
  const cancelled = status === "CANCELLED";

  return (
    <div className="relative flex items-start justify-between gap-2">
      <div className="absolute left-[10%] right-[10%] top-5 h-0.5 bg-border" aria-hidden />
      {steps.map((step) => {
        const stepIdx = order.indexOf(step.key);
        const active = status === step.key || (status === "SENT" && step.key === "CONFIRMED");
        const done = !cancelled && currentIdx > stepIdx;
        const isCancel = step.key === "CANCELLED" && cancelled;
        const Icon = step.icon;
        return (
          <div key={step.key} className="relative z-[1] flex flex-1 flex-col items-center gap-2 text-center">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                isCancel && "border-red-500 bg-red-500 text-white",
                active && !isCancel && "border-primary bg-primary text-primary-foreground shadow-[0_4px_14px_hsl(var(--primary)/0.35)]",
                done && !active && "border-primary/40 bg-primary/10 text-primary",
                !active && !done && !isCancel && "border-border bg-card text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <p className={cn(
              "text-[11px] font-semibold leading-tight",
              (active || isCancel) ? "text-foreground" : done ? "text-primary" : "text-muted-foreground",
            )}>
              {step.label}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {active || isCancel ? fmtDate(orderDate) : done ? "Done" : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, workspace } = useShopWorkspace();
  const routeLabels = getRouteLabels(workspace, profile);
  const printLabel = routeLabels.printTags ?? "Print Labels";
  const showPrintLabels = profile.labelTemplates.length > 0;
  const router = useRouter();
  const { user } = useAuthStore();
  const adminBypass = bypassesWorkflowApproval(user?.role);

  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [workflowInstance, setWorkflowInstance] = useState<WorkflowInstanceLike | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<PO>(`/purchases/${id}`);
      setPo(res.data);
      try {
        const wf = await api.get<WorkflowInstanceLike>(`/workflows/instances/PurchaseOrder/${id}`);
        setWorkflowInstance(wf.data ?? null);
      } catch {
        setWorkflowInstance(null);
      }
    } catch { toast.error("Failed to load purchase order"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    if (!po) return;
    setActing(true);
    try {
      await api.put(`/purchases/${po.id}/status`, { status });
      toast.success(`Status updated to ${STATUS_CFG[status]?.label ?? status}`);
      load();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to update status"); }
    finally { setActing(false); }
  };

  const submitForApproval = async () => {
    if (!po) return;
    setActing(true);
    try {
      await api.post(`/purchases/${po.id}/submit-approval`);
      toast.success(
        adminBypass
          ? "Purchase order confirmed"
          : "Submitted for approval — Branch Manager then Accountant will review",
      );
      load();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to submit"); }
    finally { setActing(false); }
  };

  const actOnWorkflow = async (taskId: string, action: "approve" | "reject") => {
    setActing(true);
    try {
      await api.put(`/workflows/tasks/${taskId}/${action}`, {});
      toast.success(action === "approve" ? "Approved — order moves to next step" : "Purchase order rejected");
      load();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Action failed"); }
    finally { setActing(false); }
  };

  const totals = useMemo(() => {
    if (!po) return { items: 0, qty: 0, received: 0, due: 0 };
    const items = po.items?.length ?? po._count?.items ?? 0;
    const qty = (po.items ?? []).reduce((s, i) => s + i.orderedQty, 0);
    const received = (po.items ?? []).reduce((s, i) => s + i.receivedQty, 0);
    return { items, qty, received, due: po.total - po.paidAmount };
  }, [po]);

  if (loading) return <LoadingCenter className="min-h-[60vh] py-0" size={88} />;

  if (!po) return (
    <div className="page-shell flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Package className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground">Purchase order not found</p>
      <Button variant="outline" onClick={() => router.push("/purchases")}>Back to Purchases</Button>
    </div>
  );

  const statusConf = STATUS_CFG[po.status] ?? STATUS_CFG.DRAFT;
  const StatusIcon = statusConf.icon;
  const canReceive = ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED"].includes(po.status);
  const canCancel = !["RECEIVED", "CANCELLED", "PENDING_APPROVAL"].includes(po.status);

  const KPI = [
    pageKpi("Total Amount", fmt(po.total), DollarSign, "blue"),
    pageKpi("Amount Paid", fmt(po.paidAmount), CheckCircle2, "emerald"),
    pageKpi("Amount Due", fmt(totals.due), Banknote, totals.due > 0 ? "red" : "slate"),
    pageKpi("Line Items", String(totals.items), Package, "violet"),
  ];

  return (
    <div className="page-shell space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <button
            type="button"
            onClick={() => router.push("/purchases")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Purchase Orders
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight font-mono">{po.poNumber}</h1>
                <Badge variant={statusConf.variant} className="h-7 rounded-full px-3 text-xs font-bold gap-1">
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusConf.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {po.supplier.name} · Ordered {fmtDate(po.orderDate)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canReceive && (
            <Button className="gap-1.5 h-10 rounded-xl" onClick={() => setReceiveOpen(true)}>
              <Package className="h-4 w-4" /> Receive Items
            </Button>
          )}
          {po.status === "DRAFT" && (
            adminBypass ? (
              <Button variant="gradient" className="gap-1.5 h-10 rounded-xl" disabled={acting} onClick={submitForApproval}>
                <CheckCircle2 className="h-4 w-4" /> Confirm Order
              </Button>
            ) : (
              <Button variant="gradient" className="gap-1.5 h-10 rounded-xl" disabled={acting} onClick={submitForApproval}>
                <Send className="h-4 w-4" /> Submit for Approval
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-1.5 rounded-xl">
                <MoreHorizontal className="h-4 w-4" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => router.push(`/purchases/${po.id}/grn`)}>
                <Package className="mr-2 h-4 w-4" /> View GRN
              </DropdownMenuItem>
              {showPrintLabels && (
                <DropdownMenuItem onClick={() => router.push(`/purchases/${po.id}/print-tags`)}>
                  <Tag className="mr-2 h-4 w-4" /> {printLabel}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem>
                <Printer className="mr-2 h-4 w-4" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-4 w-4" /> Download
              </DropdownMenuItem>
              {canCancel && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={acting}
                    onClick={() => updateStatus("CANCELLED")}
                  >
                    <Ban className="mr-2 h-4 w-4" /> Cancel Order
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <PageKpiGrid items={KPI} />

      {/* ── Meta + Supplier + Totals ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)] xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-bold">Order Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              <MetaItem icon={Calendar} label="Order Date" value={fmtDate(po.orderDate)} />
              <MetaItem icon={Truck} label="Expected Date" value={fmtDate(po.expectedDate)} />
              <MetaItem icon={Hash} label="Reference" value={po.reference ?? "—"} />
              <MetaItem icon={FileText} label="Payment Terms" value={po.paymentTerms ?? "—"} />
            </div>
            {po.notes && (
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>
                <p className="text-sm mt-1">{po.notes}</p>
              </div>
            )}
            {po.status === "PENDING_APPROVAL" && (
              <POApprovalPanel
                instance={workflowInstance}
                userId={user?.id}
                userRole={user?.role}
                acting={acting}
                onApprove={(taskId) => actOnWorkflow(taskId, "approve")}
                onReject={(taskId) => actOnWorkflow(taskId, "reject")}
              />
            )}
            {po.status === "DRAFT" && !adminBypass && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Submit for approval before receiving goods. Branch Manager and Accountant must review.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)] xl:col-span-1">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Supplier</h3>
              <Link
                href={`/suppliers/${po.supplier.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                View profile <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-bold text-primary">
                {po.supplier.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 space-y-2">
                <p className="font-bold text-base">{po.supplier.name}</p>
                {po.supplier.phone && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />{po.supplier.phone}
                  </p>
                )}
                {po.supplier.email && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />{po.supplier.email}
                  </p>
                )}
                {po.supplier.address && (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{po.supplier.address}{po.supplier.city ? `, ${po.supplier.city}` : ""}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)] xl:col-span-1">
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-bold">Financial Summary</h3>
            {[
              ["Sub Total", fmt(po.subtotal)],
              ["Discount", fmt(po.discountAmount)],
              ["Tax", fmt(po.taxAmount)],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{val}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-3 text-base font-bold">
              <span>Total</span>
              <span className="text-primary tabular-nums">{fmt(po.total)}</span>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Paid
                </span>
                <span className="font-semibold tabular-nums text-emerald-600">{fmt(po.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span className="text-red-600">Due</span>
                <span className="tabular-nums text-red-600">{fmt(totals.due)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Items table ── */}
      <Card className="rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-bold">Order Items</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totals.items} items · {totals.qty} units ordered · {totals.received} received
            </p>
          </div>
        </div>
        <div className="overflow-x-auto" data-table-craft>
          <table className="enterprise-table w-full text-sm">
            <thead>
              <tr>
                {["#", "Item", "SKU", "Variant", "Qty", "Unit Cost", "Discount", "Tax", "Amount"].map((h) => (
                  <th key={h} className={h === "#" || h === "Item" || h === "SKU" || h === "Variant" ? "text-left" : "text-right"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(po.items ?? []).map((item, i) => (
                <tr key={item.id}>
                  <td className="text-muted-foreground text-xs">{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-[180px]">
                      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.variant?.images?.[0] ? (
                          <img src={item.variant.images[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <span className="font-medium text-sm">{item.productName}</span>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">{item.sku}</td>
                  <td className="text-sm">{item.variantName || "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{item.orderedQty}</td>
                  <td className="text-right tabular-nums">{formatNumber(item.unitCost)}</td>
                  <td className="text-right tabular-nums">{formatNumber(item.discount ?? 0)}</td>
                  <td className="text-right tabular-nums">{formatNumber(item.taxAmount)}</td>
                  <td className="text-right font-bold tabular-nums">{formatNumber(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={4} className="px-4 py-3 text-sm">
                  Total: {totals.items} items · {totals.qty} qty
                </td>
                <td colSpan={4} />
                <td className="px-4 py-3 text-right text-primary font-bold tabular-nums">
                  {formatNumber(po.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold mb-4">Audit Trail</h3>
            <div className="space-y-3">
              {[
                ["Created By", po.createdBy ?? "System"],
                ["Created On", new Date(po.createdAt).toLocaleString()],
                ["Last Updated", new Date(po.updatedAt).toLocaleString()],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between gap-4 text-sm border-b border-dashed pb-3 last:border-0 last:pb-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{val}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <CardContent className="p-5">
            <h3 className="text-sm font-bold mb-5">Order Progress</h3>
            <StatusTimeline status={po.status} orderDate={po.orderDate} />
          </CardContent>
        </Card>
      </div>

      {receiveOpen && (
        <ReceiveItemsModal
          po={po}
          onClose={() => setReceiveOpen(false)}
          onReceived={() => { setReceiveOpen(false); load(); toast.success("Items received"); }}
        />
      )}
    </div>
  );
}
