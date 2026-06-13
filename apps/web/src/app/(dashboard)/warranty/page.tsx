"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, Plus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface Claim {
  id: string; claimNumber: string; status: string; warrantyMonths: number;
  purchaseDate: string; claimDate: string; issueDescription: string; resolution?: string | null;
  saleId?: string | null;
  customer: { firstName: string; lastName?: string | null; phone: string };
  variant: { sku: string; name: string; product: { name: string; warrantyMonths?: number | null } };
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface VariantOpt { variantId: string; productName: string; sku: string }

const STATUS_VARIANT: Record<string, "warning" | "success" | "secondary" | "danger"> = {
  PENDING: "warning", APPROVED: "secondary", REPLACED: "success", REJECTED: "danger", CLOSED: "success",
};

export default function WarrantyPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [form, setForm] = useState({ customerId: "", variantId: "", warrantyMonths: "12", purchaseDate: "", issueDescription: "" });
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
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? (r.data as unknown as Customer[]) ?? [])).catch(() => {});
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const createClaim = async () => {
    if (!form.customerId || !form.variantId || !form.issueDescription) { toast.error("Fill required fields"); return; }
    setSaving(true);
    try {
      await api.post("/spare-parts/warranty-claims", {
        customerId: form.customerId, variantId: form.variantId,
        warrantyMonths: parseInt(form.warrantyMonths, 10) || 0,
        purchaseDate: form.purchaseDate || new Date().toISOString().slice(0, 10),
        issueDescription: form.issueDescription,
      });
      toast.success("Warranty claim created");
      setForm({ customerId: "", variantId: "", warrantyMonths: "12", purchaseDate: "", issueDescription: "" });
      fetchClaims();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/spare-parts/warranty-claims/${id}`, { status, resolution: status === "REPLACED" ? "Part replaced under warranty" : undefined });
      toast.success("Claim updated"); fetchClaims();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Warranty Management</h1>
          <p className="text-sm text-muted-foreground">Track warranty claims, replacements & reports</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchClaims} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1"><CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">New Warranty Claim</h3>
          <div className="space-y-1"><Label className="text-xs">Customer</Label>
            <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName ?? ""} · {c.phone}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Part</Label>
            <Select value={form.variantId} onValueChange={(v) => setForm((f) => ({ ...f, variantId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
              <SelectContent>{variants.map((v) => <SelectItem key={v.variantId} value={v.variantId}>{v.productName} — {v.sku}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Warranty (months)</Label>
              <Input type="number" value={form.warrantyMonths} onChange={(e) => setForm((f) => ({ ...f, warrantyMonths: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Purchase date</Label>
              <Input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Issue description</Label>
            <Textarea rows={3} value={form.issueDescription} onChange={(e) => setForm((f) => ({ ...f, issueDescription: e.target.value }))} />
          </div>
          <Button onClick={createClaim} disabled={saving} className="w-full gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Submit Claim
          </Button>
        </CardContent></Card>

        <Card className="xl:col-span-2"><CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>{["Claim #", "Customer", "Part", "Status", "Issue", "Invoice", "Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase text-muted-foreground">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y">
                {claims.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No warranty claims yet</td></tr>
                ) : claims.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{c.claimNumber}</td>
                    <td className="px-3 py-2 text-xs">{c.customer.firstName} {c.customer.lastName ?? ""}</td>
                    <td className="px-3 py-2 text-xs">{c.variant.product.name}<br /><span className="text-muted-foreground">{c.variant.sku}</span></td>
                    <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[c.status] ?? "secondary"} className="text-[9px]">{c.status}</Badge></td>
                    <td className="px-3 py-2 text-xs max-w-[160px] truncate">{c.issueDescription}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{c.saleId ? "POS linked" : "—"}</td>
                    <td className="px-3 py-2">
                      {c.status === "PENDING" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateStatus(c.id, "APPROVED")}>Approve</Button>
                          <Button size="sm" className="h-7 text-[10px]" onClick={() => updateStatus(c.id, "REPLACED")}>Replace</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
