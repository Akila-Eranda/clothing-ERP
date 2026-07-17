"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ShieldCheck, Plus, Loader2, RefreshCw, Users, Package, Clock,
  CheckCircle2, XCircle, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { OpenRecordButton } from "@/components/table/open-record-button";
import { ModuleGate } from "@/components/shop/module-gate";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { productHasWarranty, warrantyPeriodLabel } from "@/lib/warranty";

interface Claim {
  id: string;
  claimNumber: string;
  status: string;
  warrantyMonths: number;
  purchaseDate: string;
  claimDate: string;
  issueDescription: string;
  resolution?: string | null;
  saleId?: string | null;
  customer: { firstName: string; lastName?: string | null; phone: string };
  variant: { sku: string; name: string; product: { name: string; warrantyMonths?: number | null } };
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface VariantOpt { variantId: string; productName: string; sku: string; warrantyMonths?: number | null }

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REPLACED" | "REJECTED" | "CLOSED";

const STATUS_CFG: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  PENDING:  { label: "Pending",  variant: "warning"   },
  APPROVED: { label: "Approved", variant: "default"   },
  REPLACED: { label: "Replaced", variant: "success"   },
  REJECTED: { label: "Rejected", variant: "danger"    },
  CLOSED:   { label: "Closed",   variant: "secondary" },
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REPLACED", label: "Replaced" },
  { key: "REJECTED", label: "Rejected" },
  { key: "CLOSED", label: "Closed" },
];

const GUIDE = [
  { title: "Submit Claim", desc: "Log customer warranty requests for tyres or parts with purchase date and issue details." },
  { title: "Review & Approve", desc: "Verify warranty coverage period and approve valid claims before replacement." },
  { title: "Replace Part", desc: "Mark as Replaced when a new unit is issued under warranty terms." },
  { title: "Close Record", desc: "Reject invalid claims or close completed cases for reporting and audit trail." },
];

function customerName(c: { firstName: string; lastName?: string | null }) {
  return `${c.firstName} ${c.lastName ?? ""}`.trim();
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function buildColumns(
  onView: (c: Claim) => void,
  onStatus: (id: string, status: string) => void,
): ColumnDef<Claim>[] {
  return [
    {
      accessorKey: "claimNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Claim #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5 min-w-[120px]">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <OpenRecordButton onClick={() => onView(row.original)} className="font-mono text-xs" title="View claim">
            {row.original.claimNumber}
          </OpenRecordButton>
        </div>
      ),
    },
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{customerName(row.original.customer)}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.customer.phone}</p>
        </div>
      ),
    },
    {
      id: "part",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.variant.product.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.original.variant.sku}</p>
        </div>
      ),
    },
    {
      accessorKey: "warrantyMonths",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Warranty" />,
      cell: ({ row }) => (
        <span className="text-xs">{warrantyPeriodLabel(row.original.warrantyMonths)}</span>
      ),
    },
    {
      accessorKey: "purchaseDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Purchased" />,
      cell: ({ row }) => <span className="text-xs">{fmtDate(row.original.purchaseDate)}</span>,
    },
    {
      id: "issue",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Issue" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[180px] truncate block">
          {row.original.issueDescription}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = STATUS_CFG[row.original.status] ?? { label: row.original.status, variant: "secondary" as const };
        return <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex gap-1 flex-wrap justify-end">
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onView(c)}>
              View
            </Button>
            {c.status === "PENDING" && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onStatus(c.id, "APPROVED")}>
                  Approve
                </Button>
                <Button size="sm" className="h-7 text-[10px]" onClick={() => onStatus(c.id, "REPLACED")}>
                  Replace
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];
}

function ClaimDetailDialog({
  claim,
  onClose,
  onStatus,
}: {
  claim: Claim | null;
  onClose: () => void;
  onStatus: (id: string, status: string) => void;
}) {
  if (!claim) return null;
  const cfg = STATUS_CFG[claim.status] ?? { label: claim.status, variant: "secondary" as const };

  return (
    <Dialog open={!!claim} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {claim.claimNumber}
            <Badge variant={cfg.variant} className="text-[10px] ml-1">{cfg.label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium">{customerName(claim.customer)}</p>
              <p className="text-xs font-mono text-muted-foreground">{claim.customer.phone}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Claim date</p>
              <p>{fmtDate(claim.claimDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Product</p>
              <p className="font-medium">{claim.variant.product.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{claim.variant.sku}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Warranty / Purchase</p>
              <p>{warrantyPeriodLabel(claim.warrantyMonths)}</p>
              <p className="text-xs text-muted-foreground">{fmtDate(claim.purchaseDate)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Issue description</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{claim.issueDescription}</p>
          </div>
          {claim.resolution && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Resolution</p>
              <p className="text-muted-foreground">{claim.resolution}</p>
            </div>
          )}
          {claim.saleId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Linked to POS sale
            </p>
          )}
          <div className="flex flex-wrap gap-2 justify-between pt-2 border-t">
            <div className="flex gap-2 flex-wrap">
              {claim.status === "PENDING" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => onStatus(claim.id, "APPROVED")}>Approve</Button>
                  <Button size="sm" onClick={() => onStatus(claim.id, "REPLACED")}>Mark Replaced</Button>
                  <Button size="sm" variant="destructive" onClick={() => onStatus(claim.id, "REJECTED")}>Reject</Button>
                </>
              )}
              {claim.status === "APPROVED" && (
                <Button size="sm" onClick={() => onStatus(claim.id, "REPLACED")}>Mark Replaced</Button>
              )}
              {(claim.status === "REPLACED" || claim.status === "REJECTED") && (
                <Button size="sm" variant="outline" onClick={() => onStatus(claim.id, "CLOSED")}>Close</Button>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WarrantyPage() {
  const { profile } = useShopWorkspace();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewClaim, setViewClaim] = useState<Claim | null>(null);
  const [form, setForm] = useState({ customerId: "", variantId: "", purchaseDate: "", issueDescription: "" });
  const [saving, setSaving] = useState(false);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Claim[]>("/spare-parts/warranty-claims");
      setClaims(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error("Failed to load warranty claims"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);
  useEffect(() => {
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? [])).catch(() => {});
    api.get<VariantOpt[]>("/pos/products").then((r) => {
      const all = Array.isArray(r.data) ? r.data : [];
      setVariants(all.filter((v) => productHasWarranty(v.warrantyMonths)));
    }).catch(() => {});
  }, []);

  const selectedVariant = variants.find((v) => v.variantId === form.variantId);

  const resetForm = () => setForm({ customerId: "", variantId: "", purchaseDate: "", issueDescription: "" });

  const createClaim = async () => {
    if (!form.customerId || !form.variantId || !form.issueDescription) { toast.error("Fill required fields"); return; }
    if (!productHasWarranty(selectedVariant?.warrantyMonths)) {
      toast.error("Selected product has no warranty coverage");
      return;
    }
    setSaving(true);
    try {
      await api.post("/spare-parts/warranty-claims", {
        customerId: form.customerId,
        variantId: form.variantId,
        purchaseDate: form.purchaseDate || new Date().toISOString().slice(0, 10),
        issueDescription: form.issueDescription,
      });
      toast.success("Warranty claim created");
      resetForm();
      setCreateOpen(false);
      fetchClaims();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await api.put(`/spare-parts/warranty-claims/${id}`, {
        status,
        resolution: status === "REPLACED" ? "Part replaced under warranty" : status === "REJECTED" ? "Claim rejected — outside warranty terms" : undefined,
      });
      toast.success("Claim updated");
      fetchClaims();
      setViewClaim((prev) => (prev?.id === id ? null : prev));
    } catch (e: unknown) { toast.error((e as Error).message); }
  }, [fetchClaims]);

  const displayed = useMemo(
    () => statusFilter === "ALL" ? claims : claims.filter((c) => c.status === statusFilter),
    [claims, statusFilter],
  );

  const pendingCount = claims.filter((c) => c.status === "PENDING").length;
  const resolvedCount = claims.filter((c) => ["REPLACED", "CLOSED"].includes(c.status)).length;

  const STATS = [
    { label: "Total Claims", value: claims.length, icon: ShieldCheck, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Pending", value: pendingCount, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Resolved", value: resolvedCount, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Rejected", value: claims.filter((c) => c.status === "REJECTED").length, icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
  ];

  const columns = useMemo(
    () => buildColumns(setViewClaim, updateStatus),
    [updateStatus],
  );

  return (
    <ModuleGate module="warranty">
      <div className="p-6 space-y-6 w-full">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span>{profile.emoji}</span> Warranty Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Track warranty claims, approvals, replacements & tyre/part coverage
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={fetchClaims} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/customers"><Users className="h-3.5 w-3.5" /> Customers</Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/products"><Package className="h-3.5 w-3.5" /> Products</Link>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> New Claim
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold">{loading && typeof s.value === "number" ? "—" : s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          {STATUS_FILTERS.map((f) => {
            const count = f.key === "ALL" ? claims.length : claims.filter((c) => c.status === f.key).length;
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

        {displayed.length === 0 && !loading ? (
          <Card className="border-dashed">
            <CardContent className="p-12 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">No warranty claims yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Submit a claim when a customer reports a defect on a tyre or part still under warranty coverage.
              </p>
              <Button className="gap-1.5 mt-2" onClick={() => { resetForm(); setCreateOpen(true); }}>
                <Plus className="h-4 w-4" /> New Claim
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ClientSideTable
            data={displayed}
            columns={columns}
            pageCount={Math.ceil(displayed.length / 10)}
            searchableColumns={[
              { id: "claimNumber", title: "Claim #" },
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
            isShowExportButtons={{ isShow: true, fileName: "warranty-claims-export" }}
          />
        )}

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          {GUIDE.map((g) => (
            <Card key={g.title} className="border-dashed">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-semibold">{g.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{g.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Warranty Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Customer</Label>
                <Select value={form.customerId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{customerName(c)} · {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">Only products with warranty months configured appear below.</p>
              <div className="space-y-1">
                <Label className="text-xs">Product / part</Label>
                <Select value={form.variantId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, variantId: v }))}>
                  <SelectTrigger><SelectValue placeholder={variants.length ? "Select product" : "No warranty products"} /></SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.variantId} value={v.variantId}>
                        {v.productName} — {v.sku} ({warrantyPeriodLabel(v.warrantyMonths)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Warranty period</Label>
                  <Input readOnly value={selectedVariant ? warrantyPeriodLabel(selectedVariant.warrantyMonths) : "—"} className="bg-muted/40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Purchase date</Label>
                  <Input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issue description</Label>
                <Textarea rows={3} value={form.issueDescription} onChange={(e) => setForm((f) => ({ ...f, issueDescription: e.target.value }))} placeholder="Describe the defect or failure…" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={createClaim} disabled={saving || !form.customerId || !form.variantId} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Submit Claim
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ClaimDetailDialog claim={viewClaim} onClose={() => setViewClaim(null)} onStatus={updateStatus} />
      </div>
    </ModuleGate>
  );
}
