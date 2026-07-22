"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, ToggleLeft, ToggleRight, Clock, Pencil, Trash2,
  RefreshCw, Tag, Percent, DollarSign, Gift, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { ModuleGate } from "@/components/shop/module-gate";
import { OpenRecordButton } from "@/components/table";
// ── Types ─────────────────────────────────────────────────────────────────────
interface Promotion {
  id: string;
  name: string;
  description?: string;
  discountType: "PERCENTAGE" | "FIXED" | "BUY_X_GET_Y";
  discountValue: number;
  minOrderAmount: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usageCount: number;
  perCustomerLimit?: number | null;
  startsAt: string;
  endsAt?: string | null;
  isActive: boolean;
  couponCode?: string | null;
  applicableTo: string;
}

const DISCOUNT_CFG = {
  PERCENTAGE:  { label: "Percentage",   icon: Percent,     bg: "bg-blue-500/10",   text: "text-blue-500"   },
  FIXED:       { label: "Fixed Amount", icon: DollarSign,  bg: "bg-emerald-500/10",text: "text-emerald-500" },
  BUY_X_GET_Y: { label: "Buy X Get Y",  icon: Gift,        bg: "bg-purple-500/10", text: "text-purple-500"  },
} as const;

type PromotionForm = {
  name: string;
  description: string;
  discountType: Promotion["discountType"];
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: string;
  usageLimit: string;
  startsAt: string;
  endsAt: string;
  couponCode: string;
  applicableTo: string;
};

const EMPTY_FORM: PromotionForm = {
  name: "", description: "", discountType: "PERCENTAGE",
  discountValue: 0, minOrderAmount: 0, maxDiscount: "",
  usageLimit: "", startsAt: "", endsAt: "", couponCode: "", applicableTo: "ALL",
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PromotionsPage() {
  const [promos, setPromos]       = useState<Promotion[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Promotion | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState<PromotionForm>({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Promotion[]>("/promotions");
      setPromos(Array.isArray(res.data) ? res.data : []);
    } catch { toast.error("Failed to load promotions"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setModalOpen(true); };
  const openEdit   = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? "",
      discountType: p.discountType, discountValue: p.discountValue,
      minOrderAmount: p.minOrderAmount, maxDiscount: p.maxDiscount?.toString() ?? "",
      usageLimit: p.usageLimit?.toString() ?? "", couponCode: p.couponCode ?? "",
      startsAt: p.startsAt.slice(0, 10), endsAt: p.endsAt?.slice(0, 10) ?? "",
      applicableTo: p.applicableTo,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.startsAt) { toast.error("Name and start date required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, description: form.description || undefined,
        discountType: form.discountType, discountValue: Number(form.discountValue),
        minOrderAmount: Number(form.minOrderAmount) || 0,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        startsAt: form.startsAt, endsAt: form.endsAt || undefined,
        couponCode: form.couponCode || undefined, applicableTo: form.applicableTo,
      };
      if (editing) {
        await api.put(`/promotions/${editing.id}`, payload);
        toast.success("Promotion updated");
      } else {
        await api.post("/promotions", payload);
        toast.success("Promotion created");
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      const msg = (e as { data?: { message?: string } })?.data?.message;
      toast.error(msg ?? "Failed to save promotion");
    } finally { setSaving(false); }
  };

  const handleToggle = async (p: Promotion) => {
    try {
      await api.patch(`/promotions/${p.id}/toggle`, {});
      setPromos((prev) => prev.map((x) => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
    } catch { toast.error("Failed to toggle"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this promotion?")) return;
    try {
      await api.delete(`/promotions/${id}`);
      setPromos((prev) => prev.filter((x) => x.id !== id));
      toast.success("Deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const filtered = promos.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.couponCode ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const active = promos.filter((p) => p.isActive).length;
  const totalUsed = promos.reduce((s, p) => s + p.usageCount, 0);

  return (
    <ModuleGate module="promotions">
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promotions & Coupons</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage discount coupons and offers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={load} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button variant="gradient" className="h-10 rounded-[12px] gap-1.5 text-sm px-4" onClick={openCreate}>
            <Plus className="h-[18px] w-[18px]" /> Create Promo
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Promos",    value: active,      color: "text-emerald-500" },
          { label: "Inactive Promos",  value: promos.length - active, color: "text-muted-foreground" },
          { label: "Total Uses",       value: totalUsed,   color: "text-blue-500" },
          { label: "Total Promos",     value: promos.length, color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search name or code…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 rounded-xl border bg-card animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground rounded-xl border bg-card">
          <Tag className="h-10 w-10 mb-3 opacity-20" />
          <p className="font-medium">No promotions found</p>
          <p className="text-sm mt-1">Create your first promotion to get started</p>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Create Promo</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((promo) => {
            const cfg = DISCOUNT_CFG[promo.discountType];
            const pct = promo.usageLimit ? Math.min((promo.usageCount / promo.usageLimit) * 100, 100) : null;
            const now = new Date();
            const expired = promo.endsAt ? new Date(promo.endsAt) < now : false;
            return (
              <div key={promo.id} className={`rounded-xl border bg-card p-5 transition-all ${promo.isActive && !expired ? "border-primary/20" : "opacity-60"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <OpenRecordButton onClick={() => openEdit(promo)} className="truncate" title="Edit promotion">
                        {promo.name}
                      </OpenRecordButton>
                      {expired && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">EXPIRED</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {promo.couponCode && (
                        <code className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono font-bold">{promo.couponCode}</code>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        {promo.discountType === "PERCENTAGE" ? `${promo.discountValue}% off`
                          : promo.discountType === "FIXED" ? `LKR ${formatNumber(promo.discountValue)} off`
                          : "Buy X Get Y"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button onClick={() => handleToggle(promo)} title={promo.isActive ? "Deactivate" : "Activate"}>
                      {promo.isActive
                        ? <ToggleRight className="h-6 w-6 text-primary" />
                        : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                    </button>
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(promo)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(promo.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {promo.minOrderAmount > 0 && <p>Min order: LKR {formatNumber(promo.minOrderAmount)}</p>}
                  {promo.maxDiscount && <p>Max discount: LKR {formatNumber(promo.maxDiscount)}</p>}
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {promo.endsAt ? `Expires: ${new Date(promo.endsAt).toLocaleDateString()}` : "No expiry"}
                  </div>
                </div>

                {promo.usageLimit ? (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{promo.usageCount} / {promo.usageLimit} used</span>
                      <span className="font-medium">{Math.round(pct ?? 0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct ?? 0}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">{promo.usageCount} uses · Unlimited</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Name *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Summer Sale 2025" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Description</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Discount Type *</Label>
                  <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v as typeof f.discountType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">Percentage %</SelectItem>
                      <SelectItem value="FIXED">Fixed Amount</SelectItem>
                      <SelectItem value="BUY_X_GET_Y">Buy X Get Y</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">
                    {form.discountType === "PERCENTAGE" ? "Discount %" : "Discount Amount (LKR)"} *
                  </Label>
                  <Input type="number" min={0} value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Min Order Amount</Label>
                  <Input type="number" min={0} value={form.minOrderAmount} onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Max Discount (LKR)</Label>
                  <Input type="number" min={0} value={form.maxDiscount} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))} placeholder="No limit" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Coupon Code</Label>
                  <Input value={form.couponCode} onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value.toUpperCase() }))} placeholder="e.g. SAVE20" className="font-mono" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Usage Limit</Label>
                  <Input type="number" min={1} value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} placeholder="Unlimited" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Start Date *</Label>
                  <Input type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">End Date</Label>
                  <Input type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className={modalInlineFooterClass}>
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
              <Button variant="gradient" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ModuleGate>
  );
}
