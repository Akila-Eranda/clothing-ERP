"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Plus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

interface Quotation {
  id: string; quoteNumber: string; status: string; total: number; subtotal: number;
  validUntil?: string | null; createdAt: string; notes?: string | null;
  customer?: { firstName: string; lastName?: string | null; phone: string } | null;
  items: { quantity: number; unitPrice: number; variant: { sku: string; product: { name: string } } }[];
}
interface Customer { id: string; firstName: string; lastName?: string | null; phone: string }
interface VariantOpt { variantId: string; productName: string; variantName: string; sku: string; sellingPrice: number }
interface LineItem { variantId: string; label: string; quantity: number; unitPrice: number }

export default function QuotationsPage() {
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [pickVariant, setPickVariant] = useState("");
  const [saving, setSaving] = useState(false);

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
    api.get<{ data: Customer[] }>("/customers?limit=200").then((r) => setCustomers(r.data?.data ?? (r.data as unknown as Customer[]) ?? [])).catch(() => {});
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const addLine = () => {
    const v = variants.find((x) => x.variantId === pickVariant);
    if (!v || items.some((i) => i.variantId === v.variantId)) return;
    setItems((prev) => [...prev, { variantId: v.variantId, label: `${v.productName} — ${v.sku}`, quantity: 1, unitPrice: v.sellingPrice }]);
    setPickVariant("");
  };

  const createQuote = async () => {
    if (!items.length) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      await api.post("/spare-parts/quotations", {
        customerId: customerId || undefined, validUntil: validUntil || undefined, notes: notes || undefined,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
      });
      toast.success("Quotation created");
      setOpen(false); setItems([]); setCustomerId(""); setValidUntil(""); setNotes("");
      fetchQuotes();
    } catch (e: unknown) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/spare-parts/quotations/${id}/status`, { status });
      toast.success("Status updated"); fetchQuotes();
    } catch (e: unknown) { toast.error((e as Error).message); }
  };

  const totalPreview = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Quotations</h1>
          <p className="text-sm text-muted-foreground">Create quotes for workshops, fleet & wholesale customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchQuotes} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Quotation</Button>
        </div>
      </div>

      {open && (
        <Card><CardContent className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">New Quotation</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Customer (optional)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Walk-in / select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName ?? ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Valid until</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={pickVariant} onValueChange={setPickVariant}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Add part..." /></SelectTrigger>
              <SelectContent>{variants.map((v) => <SelectItem key={v.variantId} value={v.variantId}>{v.productName} — {v.sku}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" onClick={addLine}><Plus className="h-4 w-4" /></Button>
          </div>
          {items.map((item, idx) => (
            <div key={item.variantId} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{item.label}</span>
              <Input type="number" min={1} className="w-16 h-8" value={item.quantity}
                onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value, 10) || 1 } : it))} />
              <Input type="number" min={0} className="w-24 h-8" value={item.unitPrice}
                onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, unitPrice: parseFloat(e.target.value) || 0 } : it))} />
              <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-red-500" /></button>
            </div>
          ))}
          <Textarea rows={2} placeholder="Notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-between items-center">
            <span className="font-bold">Total: LKR {formatNumber(totalPreview)}</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createQuote} disabled={saving || !items.length}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Quotation"}
              </Button>
            </div>
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>{["Quote #", "Customer", "Items", "Total", "Status", "Date", "Actions"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y">
              {quotes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No quotations yet</td></tr>
              ) : quotes.map((q) => (
                <tr key={q.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">{q.quoteNumber}</td>
                  <td className="px-3 py-2 text-xs">{q.customer ? `${q.customer.firstName} ${q.customer.lastName ?? ""}` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{q.items.length} item(s)</td>
                  <td className="px-3 py-2 font-semibold">LKR {formatNumber(q.total)}</td>
                  <td className="px-3 py-2"><Badge variant="secondary" className="text-[9px]">{q.status}</Badge></td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(q.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    {q.status === "DRAFT" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateStatus(q.id, "SENT")}>Mark Sent</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
