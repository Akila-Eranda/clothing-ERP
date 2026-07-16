"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronRight, Pencil, Phone, Mail, MapPin,
  Package, CreditCard, Star, Calendar, TrendingUp, X, Loader2, Banknote, Search, Trash2, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getSupplierPageCopy } from "@/lib/shop-vertical";

// ── Types ────────────────────────────────────────────────────────────────
type POStatus = "DRAFT" | "SENT" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

interface PurchaseOrder {
  id: string; poNumber: string; status: POStatus;
  total: number; paidAmount: number;
  orderDate: string; expectedDate?: string | null; receivedDate?: string | null;
  notes?: string | null;
}
interface SupplierPayment {
  id: string; amount: number; method: string; paidAt: string; notes?: string | null;
}
interface SupplierDetail {
  id: string; code?: string | null; name: string;
  contactPerson?: string | null; phone: string;
  email?: string | null; address?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null;
  gstNumber?: string | null; panNumber?: string | null;
  creditDays: number; creditLimit: number; balance: number;
  rating: number; isActive: boolean; notes?: string | null;
  createdAt: string; updatedAt: string;
  purchases: PurchaseOrder[];
  payments: SupplierPayment[];
}
interface VariantOpt {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  costPrice: number;
}
interface SupplierAssignment {
  id: string;
  variantId: string;
  supplierProductCode?: string | null;
  leadTimeDays?: number | null;
  lastBuyingPrice?: number | null;
  variant: {
    id: string;
    name: string;
    sku: string;
    product: { id: string; name: string };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });

const PO_STATUS: Record<POStatus, { label: string; variant: "success" | "secondary" | "warning" | "danger" | "default" }> = {
  DRAFT:              { label: "Draft",             variant: "secondary" },
  SENT:               { label: "Sent",              variant: "default"   },
  CONFIRMED:          { label: "Confirmed",         variant: "default"   },
  PARTIALLY_RECEIVED: { label: "Partial",           variant: "warning"   },
  RECEIVED:           { label: "Received",          variant: "success"   },
  CANCELLED:          { label: "Cancelled",         variant: "danger"    },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

// ── Payment Methods (supplier-relevant subset) ───────────────────────────
const PAY_METHODS = [
  { value: "CASH",          label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE",        label: "Cheque" },
  { value: "UPI",           label: "UPI" },
  { value: "CARD",          label: "Card" },
  { value: "WALLET",        label: "Wallet" },
];

// ── Record Payment Modal ──────────────────────────────────────────────────
function PaymentModal({
  supplierId, purchases, balance, paymentTitle,
  onClose, onSaved,
}: {
  supplierId: string;
  paymentTitle: string;
  purchases: { id: string; poNumber: string; total: number; paidAmount: number; orderDate: string }[];
  balance: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [method,     setMethod]     = useState("BANK_TRANSFER");
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [reference,  setReference]  = useState("");
  const [notes,      setNotes]      = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [chequeBankName, setChequeBankName] = useState("");
  const [chequeBankAccountId, setChequeBankAccountId] = useState("");
  const [banks, setBanks] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    api.get<{ id: string; code: string; name: string }[]>("/accounting/bank-accounts")
      .then((res) => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBanks([]));
  }, []);

  const unpaidPOs = purchases.filter((p) => p.total > p.paidAmount);
  const totalDue  = unpaidPOs.reduce((s, p) => s + (p.total - p.paidAmount), 0);
  const allSelected = unpaidPOs.length > 0 && selected.size === unpaidPOs.length;
  const selectedDue = unpaidPOs
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + (p.total - p.paidAmount), 0);

  const togglePO = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(unpaidPOs.map((p) => p.id)));
  };

  const submit = async () => {
    if (selectedDue <= 0 && selected.size === 0) { toast.error("Select at least one purchase order"); return; }
    if (selected.size === 0) {
      toast.error("Select at least one purchase order");
      return;
    }
    if (method === "CHEQUE" && !reference.trim()) {
      toast.error("Cheque number is required");
      return;
    }
    setLoading(true);
    try {
      const selectedPOs = unpaidPOs.filter((p) => selected.has(p.id));
      for (let i = 0; i < selectedPOs.length; i++) {
        const po = selectedPOs[i];
        const due = po.total - po.paidAmount;
        const isCheque = method === "CHEQUE";
        await api.post(`/suppliers/${supplierId}/payments`, {
          amount:     due,
          method,
          purchaseId: po.id,
          reference:  reference || undefined,
          notes:      notes     || undefined,
          chequeNumber: isCheque ? reference.trim() : undefined,
          chequeDueDate: isCheque && chequeDueDate ? chequeDueDate : undefined,
          chequeBankName: isCheque && chequeBankName ? chequeBankName : undefined,
          chequeBankAccountId: isCheque && chequeBankAccountId ? chequeBankAccountId : undefined,
          registerCheque: isCheque && i === 0,
          chequeAmount: isCheque && i === 0 ? selectedDue : undefined,
        });
      }
      toast.success(
        selectedPOs.length === 1
          ? `Payment of LKR ${selectedDue.toLocaleString("en-LK")} recorded — expense added`
          : `${selectedPOs.length} payments totalling LKR ${selectedDue.toLocaleString("en-LK")} recorded — expenses added`
      );
      onSaved();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to record payment");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Banknote className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold">{paymentTitle}</h2>
            <p className="text-xs text-muted-foreground">
              Total outstanding: <span className="text-amber-500 font-semibold">LKR {totalDue.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Outstanding breakdown table */}
          {unpaidPOs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Outstanding Purchase Orders — click a row to select &amp; auto-fill amount
              </p>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">PO #</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right font-bold text-amber-600">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unpaidPOs.map((p) => {
                      const due      = p.total - p.paidAmount;
                      const isSelected = selected.has(p.id);
                      return (
                        <tr key={p.id}
                          onClick={() => togglePO(p.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-inset ring-emerald-400"
                              : "hover:bg-muted/20"
                          }`}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {isSelected && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                              <span className="font-mono text-xs font-semibold text-primary">{p.poNumber}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground ml-4">
                              {new Date(p.orderDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs">{p.total.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-emerald-600">{p.paidAmount.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-amber-600">{due.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-right text-muted-foreground">Total Due</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-600">
                        {totalDue.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {selected.size > 0 && (
                <p className="text-xs text-emerald-600 font-medium">
                  ✓ {selected.size} purchase order{selected.size !== 1 ? "s" : ""} selected — click again to deselect
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              All purchase orders are fully paid. Recording a general advance payment.
            </div>
          )}

          {/* Payment fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Method <span className="text-destructive">*</span></Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {method === "CHEQUE" ? (
                <>Cheque No. <span className="text-destructive">*</span></>
              ) : (
                "Reference / Cheque No."
              )}
            </Label>
            <Input
              placeholder={method === "CHEQUE" ? "e.g. CHQ-001" : "e.g. CHQ-001 or TXN-12345"}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {method === "CHEQUE" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cheque due date</Label>
                <Input type="date" value={chequeDueDate} onChange={(e) => setChequeDueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cheque bank</Label>
                <Input placeholder="Bank name" value={chequeBankName} onChange={(e) => setChequeBankName(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-semibold">Company bank account</Label>
                <Select value={chequeBankAccountId || undefined} onValueChange={setChequeBankAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.code} · {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Cheque is registered in Accounting → Cheques as Issued (supplier).
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea rows={2} placeholder="Payment notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-3 px-5 py-4 border-t bg-muted/10 shrink-0">
          <div className="text-sm">
            {selectedDue > 0 && (
              <span className="text-muted-foreground">
                Paying: <strong className="text-foreground">LKR {selectedDue.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[150px] bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
              Record Payment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function SupplierDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const { profile, workspace } = useShopWorkspace();
  const copy = getSupplierPageCopy(profile, workspace);
  const [supplier, setSupplier]     = useState<SupplierDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [payOpen, setPayOpen]       = useState(false);
  const [assignments, setAssignments] = useState<SupplierAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [searchRows, setSearchRows] = useState<VariantOpt[]>([]);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, assigned] = await Promise.all([
        api.get<SupplierDetail>(`/suppliers/${id}`),
        api.get<SupplierAssignment[]>(`/suppliers/${id}/products`),
      ]);
      setSupplier(res.data);
      setAssignments(Array.isArray(assigned.data) ? assigned.data : []);
    } catch {
      toast.error(`Failed to load ${copy.singular.toLowerCase()}`);
      router.push("/suppliers");
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const searchProducts = async () => {
    const q = search.trim();
    if (!q) {
      setSearchRows([]);
      return;
    }
    try {
      const res = await api.get<VariantOpt[]>(`/pos/products?search=${encodeURIComponent(q)}&limit=25`);
      setSearchRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to search products");
    }
  };

  const assignVariant = async (v: VariantOpt) => {
    setAssignBusyId(v.variantId);
    try {
      await api.post(`/suppliers/${id}/products`, {
        variantId: v.variantId,
        lastBuyingPrice: v.costPrice,
      });
      toast.success("Product assigned to supplier");
      await load();
      setSearch("");
      setSearchRows([]);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Assign failed");
    } finally {
      setAssignBusyId(null);
    }
  };

  const unassignVariant = async (variantId: string) => {
    setAssignBusyId(variantId);
    try {
      await api.delete(`/suppliers/${id}/products/${variantId}`);
      toast.success("Product unassigned");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Unassign failed");
    } finally {
      setAssignBusyId(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
  if (!supplier) return null;

  const totalPOs     = supplier.purchases.length;
  const totalValue   = supplier.purchases.reduce((s, p) => s + p.total, 0);
  const totalPaid    = supplier.purchases.reduce((s, p) => s + p.paidAmount, 0);
  const stars        = Math.round(supplier.rating ?? 0);
  const location     = [supplier.city, supplier.state].filter(Boolean).join(", ");

  return (
    <div className="h-full flex flex-col bg-muted/30">

      {/* ── Top bar ── */}
      <div className="bg-background border-b px-6 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => router.push("/suppliers")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4" /> {copy.backLabel}
        </button>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => router.push("/suppliers")}>{copy.pageTitle}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold truncate max-w-[200px]">{supplier.name}</span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => router.push(`/suppliers/${id}/edit`)}>
          <Pencil className="h-3.5 w-3.5" /> {copy.editButton}
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">

        {/* ══ LEFT COLUMN ══ */}
        <div className="space-y-5">

          {/* Hero */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-2xl font-bold text-primary">{supplier.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold">{supplier.name}</h1>
                    <Badge variant={supplier.isActive ? "success" : "secondary"} className="text-[10px]">
                      {supplier.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {supplier.code && (
                      <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">{supplier.code}</span>
                    )}
                  </div>
                  {supplier.contactPerson && (
                    <p className="text-sm text-muted-foreground mt-0.5">{supplier.contactPerson}</p>
                  )}
                  {stars > 0 && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i < stars ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm text-muted-foreground text-right">
                <p>Since {fmtDate(supplier.createdAt)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground border-t pt-4">
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">{supplier.phone}</span>
              </div>
              {supplier.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span>{supplier.email}</span>
                </div>
              )}
              {location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{location}</span>
                </div>
              )}
              {supplier.gstNumber && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">GST: {supplier.gstNumber}</span>
                </div>
              )}
            </div>

            {supplier.address && (
              <p className="mt-2 text-sm text-muted-foreground">{supplier.address}{supplier.pincode ? `, ${supplier.pincode}` : ""}</p>
            )}

            {supplier.notes && (
              <p className="mt-3 text-sm italic text-muted-foreground border-t pt-3">{supplier.notes}</p>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Purchase Orders", value: totalPOs,               icon: Package,   color: "text-blue-500",    bg: "bg-blue-500/10" },
              { label: "Total Value",     value: `LKR ${fmt(totalValue)}`, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "Amount Paid",     value: `LKR ${fmt(totalPaid)}`,  icon: CreditCard, color: "text-violet-500", bg: "bg-violet-500/10" },
            ].map((stat) => (
              <div key={stat.label} className="bg-background border rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                <div className={`p-2.5 rounded-xl ${stat.bg}`}><stat.icon className={`h-4 w-4 ${stat.color}`} /></div>
                <div><p className="text-sm font-bold">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
              </div>
            ))}
          </div>

          {/* Recent Purchase Orders */}
          <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">Recent Purchase Orders</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                onClick={() => router.push(`/purchases?supplier=${id}`)}>
                View All
              </Button>
            </div>
            {supplier.purchases.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No purchase orders yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left">PO #</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="px-4 py-2.5 text-right">Paid</th>
                      <th className="px-4 py-2.5 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {supplier.purchases.map((po) => {
                      const st = PO_STATUS[po.status] ?? { label: po.status, variant: "secondary" as const };
                      return (
                        <tr key={po.id} className="hover:bg-muted/10 cursor-pointer"
                          onClick={() => router.push(`/purchases/${po.id}`)}>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{po.poNumber}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold">LKR {fmt(po.total)}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">LKR {fmt(po.paidAmount)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />{fmtDate(po.orderDate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Payments */}
          {supplier.payments.length > 0 && (
            <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b">
                <h3 className="font-semibold text-sm">Recent Payments</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-left">Method</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {supplier.payments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-muted/10">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(pay.paidAt)}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="secondary" className="text-[10px]">{pay.method}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">LKR {fmt(pay.amount)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[160px]">{pay.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Assigned Products */}
          <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b">
              <h3 className="font-semibold text-sm">Assigned Products</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Search and assign products for this supplier.
              </p>
            </div>
            <div className="p-4 space-y-3 border-b bg-muted/10">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchProducts()}
                    placeholder="Search by product name / SKU / barcode"
                    className="pl-8 h-9"
                  />
                </div>
                <Button size="sm" onClick={searchProducts}>
                  Search
                </Button>
              </div>
              {searchRows.length > 0 && (
                <div className="max-h-56 overflow-auto border rounded-xl bg-background">
                  {searchRows.map((v) => {
                    const already = assignments.some((a) => a.variantId === v.variantId);
                    return (
                      <div key={v.variantId} className="px-3 py-2.5 border-b last:border-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{v.productName}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{v.sku} · {v.variantName}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={already ? "outline" : "default"}
                          disabled={already || assignBusyId === v.variantId}
                          onClick={() => assignVariant(v)}
                          className="gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {already ? "Assigned" : "Assign"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {assignments.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No assigned products yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Product</th>
                      <th className="px-4 py-2.5 text-left">SKU</th>
                      <th className="px-4 py-2.5 text-right">Lead Time</th>
                      <th className="px-4 py-2.5 text-right">Last Buying</th>
                      <th className="px-4 py-2.5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {assignments.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/10">
                        <td className="px-4 py-2.5">
                          <p className="text-sm font-medium">{a.variant.product.name}</p>
                          <p className="text-xs text-muted-foreground">{a.variant.name}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono">{a.variant.sku}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{a.leadTimeDays ?? "-"}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{a.lastBuyingPrice != null ? `LKR ${fmt(a.lastBuyingPrice)}` : "-"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-red-600 hover:text-red-700"
                            disabled={assignBusyId === a.variantId}
                            onClick={() => unassignVariant(a.variantId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
        {/* ══ END LEFT ══ */}

        {/* ══ RIGHT SIDEBAR ══ */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Balance */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm border-b pb-3 mb-1">Financial Summary (LKR)</h3>
            <InfoRow label="Outstanding Balance" value={
              <span className={supplier.balance > 0 ? "text-amber-500 font-bold" : "text-emerald-500 font-bold"}>
                {supplier.balance > 0 ? `LKR ${fmt(supplier.balance)}` : "Clear"}
              </span>
            } />
            <InfoRow label="Credit Limit"   value={`LKR ${fmt(supplier.creditLimit)}`} />
            <InfoRow label="Credit Days"    value={`${supplier.creditDays} days`} />
            {supplier.creditLimit > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Credit Used</span>
                  <span>{Math.min(100, ((supplier.balance / supplier.creditLimit) * 100)).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${Math.min(100, (supplier.balance / supplier.creditLimit) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm border-b pb-3 mb-1">{copy.detailsSectionTitle}</h3>
            {supplier.code     && <InfoRow label="Code"       value={<span className="font-mono text-xs">{supplier.code}</span>} />}
            {supplier.gstNumber && <InfoRow label="GST"        value={<span className="font-mono text-xs">{supplier.gstNumber}</span>} />}
            {supplier.panNumber && <InfoRow label="PAN / BRN"  value={<span className="font-mono text-xs">{supplier.panNumber}</span>} />}
            <InfoRow label="Total POs"   value={totalPOs} />
            <InfoRow label="Last Updated" value={fmtDate(supplier.updatedAt)} />
          </div>

          {/* Actions */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-3">
            <Button className="w-full gap-2" onClick={() => router.push(`/suppliers/${id}/edit`)}>
              <Pencil className="h-4 w-4" /> {copy.editButton}
            </Button>
            <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setPayOpen(true)}>
              <Banknote className="h-4 w-4" /> Record Payment
            </Button>
            <Button variant="outline" className="w-full gap-2"
              onClick={() => router.push(`/purchases/new?supplier=${id}`)}>
              <Package className="h-4 w-4" /> New Purchase Order
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => router.push("/suppliers")}>
              {copy.backLabel}
            </Button>
          </div>

        </div>
        {/* ══ END SIDEBAR ══ */}

      </div>
      </div>

      {payOpen && supplier && (
        <PaymentModal
          supplierId={id}
          paymentTitle={copy.paymentModalTitle}
          purchases={supplier.purchases}
          balance={supplier.balance}
          onClose={() => setPayOpen(false)}
          onSaved={() => { setPayOpen(false); load(); }}
        />
      )}
    </div>
  );
}
