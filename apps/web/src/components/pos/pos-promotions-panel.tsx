"use client";

import * as React from "react";
import {
  Loader2, Percent, DollarSign, RefreshCw, Tag, Check, Power,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { formatNumber } from "@/lib/utils";

type Promotion = {
  id: string;
  name: string;
  description?: string | null;
  discountType: "PERCENTAGE" | "FIXED" | "BUY_X_GET_Y";
  discountValue: number;
  minOrderAmount: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usageCount: number;
  startsAt: string;
  endsAt?: string | null;
  isActive: boolean;
  couponCode?: string | null;
};

function fmtPromo(p: Promotion) {
  if (p.discountType === "PERCENTAGE") return `${p.discountValue}% off`;
  if (p.discountType === "FIXED") return `LKR ${formatNumber(p.discountValue)} off`;
  return `Buy X Get Y`;
}

function isLive(p: Promotion) {
  if (!p.isActive) return false;
  const now = Date.now();
  if (new Date(p.startsAt).getTime() > now) return false;
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return false;
  if (p.usageLimit != null && p.usageCount >= p.usageLimit) return false;
  return true;
}

export function PosPromotionsPanel({
  cartSubtotal,
  onBack,
  onApplyCoupon,
  canManage = false,
}: {
  cartSubtotal: number;
  onBack: () => void;
  onApplyCoupon: (code: string, discountAmount: number) => void;
  canManage?: boolean;
}) {
  const { profile } = useShopWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [promos, setPromos] = React.useState<Promotion[]>([]);
  const [search, setSearch] = React.useState("");

  const [name, setName] = React.useState("");
  const [couponCode, setCouponCode] = React.useState("");
  const [discountType, setDiscountType] = React.useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = React.useState("10");
  const [minOrder, setMinOrder] = React.useState("0");
  const [endsAt, setEndsAt] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Promotion[]>("/promotions");
      setPromos(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load promotions");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return promos;
    return promos.filter(
      (p) =>
        p.name.toLowerCase().includes(q)
        || (p.couponCode ?? "").toLowerCase().includes(q),
    );
  }, [promos, search]);

  const applyPromo = async (p: Promotion) => {
    if (!p.couponCode) {
      toast.error("This promotion has no coupon code — use cart % discount instead");
      return;
    }
    if (cartSubtotal <= 0) {
      toast.error("Add items to cart first");
      return;
    }
    setBusy(true);
    try {
      const r = await api.get<{
        valid: boolean;
        reason?: string;
        discountAmount?: number;
        name?: string;
      }>(`/pos/coupons/validate/${encodeURIComponent(p.couponCode)}?amount=${cartSubtotal}`);
      if (!r.data?.valid) {
        toast.error(r.data?.reason ?? "Coupon not valid");
        return;
      }
      onApplyCoupon(p.couponCode.toUpperCase(), r.data.discountAmount ?? 0);
      toast.success(`${p.name} applied — LKR ${formatNumber(r.data.discountAmount ?? 0)} off`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to apply coupon");
    } finally {
      setBusy(false);
    }
  };

  const createPromo = async () => {
    if (!canManage) {
      toast.error("Only admin can create promotions");
      return;
    }
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const value = parseFloat(discountValue);
    if (!(value > 0)) {
      toast.error("Enter discount value");
      return;
    }
    setBusy(true);
    try {
      await api.post("/promotions", {
        name: name.trim(),
        discountType,
        discountValue: value,
        minOrderAmount: parseFloat(minOrder) || 0,
        startsAt: today,
        endsAt: endsAt || undefined,
        couponCode: couponCode.trim() || undefined,
        applicableTo: "ALL",
      });
      toast.success("Promotion created");
      setName("");
      setCouponCode("");
      setDiscountValue("10");
      setMinOrder("0");
      setEndsAt("");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create promotion");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: Promotion) => {
    if (!canManage) {
      toast.error("Only admin can toggle promotions");
      return;
    }
    try {
      await api.patch(`/promotions/${p.id}/toggle`, {});
      setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
      toast.success(p.isActive ? "Promotion paused" : "Promotion activated");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to toggle");
    }
  };

  const fieldStyle = {
    background: "var(--pos-input)",
    border: "1px solid var(--pos-border)",
    color: "var(--pos-text)",
  } as const;

  const liveCount = promos.filter(isLive).length;

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">Discounts & Promotions</h2>
          <Badge className="ml-1 text-[10px]" style={{ background: "rgba(79,110,247,0.15)", color: "var(--pos-violet-soft)" }}>
            {profile.label}
          </Badge>
          <Badge className="text-[10px]" style={{ background: "rgba(16,185,129,0.15)", color: "var(--pos-success-soft)" }}>
            {liveCount} live
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ color: "var(--pos-muted)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onBack}
            className="text-xs font-semibold px-3 h-8 rounded-lg"
            style={{ color: "var(--pos-muted)" }}
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-3 flex-1 min-h-0">
        {/* Create */}
        <div
          className="rounded-xl border p-4 space-y-3 overflow-y-auto"
          style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--pos-accent-soft)" }}>
            Quick create coupon
          </p>
          {!canManage && (
            <p className="text-[10px]" style={{ color: "var(--pos-warn-soft)" }}>
              View & apply only — admin can create / toggle.
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekend 10%"
              disabled={!canManage || busy}
              className="h-9 rounded-xl border-0 text-white text-sm"
              style={fieldStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "PERCENTAGE" | "FIXED")}
                disabled={!canManage || busy}
                className="w-full h-9 rounded-xl text-sm px-2 outline-none"
                style={fieldStyle}
              >
                <option value="PERCENTAGE">Percentage %</option>
                <option value="FIXED">Fixed LKR</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Value *</label>
              <Input
                type="number"
                min={0}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                disabled={!canManage || busy}
                className="h-9 rounded-xl border-0 text-white text-sm"
                style={fieldStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Coupon code</label>
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="SAVE10"
                disabled={!canManage || busy}
                className="h-9 rounded-xl border-0 text-white text-sm font-mono"
                style={fieldStyle}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Min order</label>
              <Input
                type="number"
                min={0}
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                disabled={!canManage || busy}
                className="h-9 rounded-xl border-0 text-white text-sm"
                style={fieldStyle}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Ends (optional)</label>
            <Input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              disabled={!canManage || busy}
              className="h-9 rounded-xl border-0 text-white text-sm"
              style={fieldStyle}
            />
          </div>

          <Button
            onClick={() => void createPromo()}
            disabled={busy || !canManage}
            className="w-full h-9 gap-1.5"
            style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)", color: "#fff" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
            Create Promotion
          </Button>

          <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
            Cart total now: LKR {formatNumber(cartSubtotal)}. Apply a live coupon to the bill.
          </p>
        </div>

        {/* List */}
        <div
          className="rounded-xl border p-4 flex flex-col min-h-0 overflow-hidden"
          style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}
        >
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / coupon…"
              className="h-9 rounded-xl border-0 text-white text-sm flex-1"
              style={fieldStyle}
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#4f6ef7" }} />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-center py-10" style={{ color: "var(--pos-muted-2)" }}>
                No promotions yet
              </p>
            ) : (
              filtered.map((p) => {
                const live = isLive(p);
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border p-3"
                    style={{
                      background: "var(--pos-panel)",
                      borderColor: live ? "rgba(79,110,247,0.45)" : "var(--pos-border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white truncate">{p.name}</p>
                          <Badge
                            className="text-[9px]"
                            style={{
                              background: live ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.2)",
                              color: live ? "var(--pos-success-soft)" : "#9ca3af",
                            }}
                          >
                            {live ? "Live" : p.isActive ? "Scheduled" : "Off"}
                          </Badge>
                        </div>
                        <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: "var(--pos-muted)" }}>
                          {p.discountType === "PERCENTAGE" ? (
                            <Percent className="h-3 w-3" />
                          ) : (
                            <DollarSign className="h-3 w-3" />
                          )}
                          {fmtPromo(p)}
                          {p.couponCode ? ` · ${p.couponCode}` : " · no code"}
                          {p.minOrderAmount > 0 ? ` · min LKR ${formatNumber(p.minOrderAmount)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => void toggle(p)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center"
                            title="Toggle"
                            style={{ color: p.isActive ? "var(--pos-success-soft)" : "var(--pos-muted)", background: "var(--pos-input)" }}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <Button
                          size="sm"
                          disabled={busy || !p.couponCode || !live}
                          onClick={() => void applyPromo(p)}
                          className="h-8 text-[10px] gap-1"
                          style={{
                            background: live && p.couponCode ? "#4f6ef7" : "var(--pos-input)",
                            color: live && p.couponCode ? "#fff" : "var(--pos-muted)",
                            opacity: live && p.couponCode ? 1 : 0.5,
                          }}
                        >
                          <Check className="h-3 w-3" />
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
