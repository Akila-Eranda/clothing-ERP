"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronRight, Pencil, Phone, Mail, MapPin,
  Package, CreditCard, Star, Calendar, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";

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

// ── Page ─────────────────────────────────────────────────────────────────
export default function SupplierDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [supplier, setSupplier]     = useState<SupplierDetail | null>(null);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<SupplierDetail>(`/suppliers/${id}`);
      setSupplier(res.data);
    } catch {
      toast.error("Failed to load supplier");
      router.push("/suppliers");
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

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
          <ArrowLeft className="h-4 w-4" /> Back to Suppliers
        </button>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => router.push("/suppliers")}>Suppliers</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold truncate max-w-[200px]">{supplier.name}</span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => router.push(`/suppliers/${id}/edit`)}>
          <Pencil className="h-3.5 w-3.5" /> Edit Supplier
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
            <h3 className="font-semibold text-sm border-b pb-3 mb-1">Supplier Details</h3>
            {supplier.code     && <InfoRow label="Code"       value={<span className="font-mono text-xs">{supplier.code}</span>} />}
            {supplier.gstNumber && <InfoRow label="GST"        value={<span className="font-mono text-xs">{supplier.gstNumber}</span>} />}
            {supplier.panNumber && <InfoRow label="PAN / BRN"  value={<span className="font-mono text-xs">{supplier.panNumber}</span>} />}
            <InfoRow label="Total POs"   value={totalPOs} />
            <InfoRow label="Last Updated" value={fmtDate(supplier.updatedAt)} />
          </div>

          {/* Actions */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-3">
            <Button className="w-full gap-2" onClick={() => router.push(`/suppliers/${id}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit Supplier
            </Button>
            <Button variant="outline" className="w-full gap-2"
              onClick={() => router.push(`/purchases/new?supplier=${id}`)}>
              <Package className="h-4 w-4" /> New Purchase Order
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => router.push("/suppliers")}>
              Back to Suppliers
            </Button>
          </div>

        </div>
        {/* ══ END SIDEBAR ══ */}

      </div>
      </div>
    </div>
  );
}
