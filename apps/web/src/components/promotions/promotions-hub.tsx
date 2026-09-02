"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Clock, Pencil, Trash2, RefreshCw, Tag, Percent, DollarSign, Gift,
  Search, Zap, Copy, Sparkles, LayoutGrid, List, Ticket, TrendingUp,
  CalendarDays, Loader2,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { modalInlineFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { ReportKpiGrid, ReportsPageHeader, type ReportKpiItem } from "@/components/reports/reports-ui";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Promotion {
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

type PromoStatus = "live" | "scheduled" | "expired" | "inactive";
type FilterTab = "all" | PromoStatus | "coupons";
type ViewMode = "grid" | "table";

type PromotionForm = {
  name: string;
  description: string;
  discountType: Promotion["discountType"];
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  couponCode: string;
  applicableTo: string;
};

const EMPTY_FORM: PromotionForm = {
  name: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: 0,
  minOrderAmount: 0,
  maxDiscount: "",
  usageLimit: "",
  perCustomerLimit: "",
  startsAt: "",
  endsAt: "",
  couponCode: "",
  applicableTo: "ALL",
};

const DISCOUNT_CFG = {
  PERCENTAGE: {
    label: "Percentage",
    short: "% Off",
    icon: Percent,
    stripe: "from-blue-500 to-indigo-600",
    badge: "softInfo" as const,
    bg: "bg-blue-500/10",
    text: "text-blue-600",
  },
  FIXED: {
    label: "Fixed Amount",
    short: "Fixed Off",
    icon: DollarSign,
    stripe: "from-emerald-500 to-teal-600",
    badge: "softSuccess" as const,
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
  },
  BUY_X_GET_Y: {
    label: "Buy X Get Y",
    short: "BOGO",
    icon: Gift,
    stripe: "from-violet-500 to-purple-600",
    badge: "softWarning" as const,
    bg: "bg-violet-500/10",
    text: "text-violet-600",
  },
} as const;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "scheduled", label: "Scheduled" },
  { id: "expired", label: "Expired" },
  { id: "inactive", label: "Inactive" },
  { id: "coupons", label: "With Coupon" },
];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function getPromoStatus(p: Promotion): PromoStatus {
  const now = new Date();
  if (!p.isActive) return "inactive";
  if (p.endsAt && new Date(p.endsAt) < now) return "expired";
  if (new Date(p.startsAt) > now) return "scheduled";
  return "live";
}

function discountLabel(p: Promotion) {
  if (p.discountType === "PERCENTAGE") return `${p.discountValue}%`;
  if (p.discountType === "FIXED") return `LKR ${formatNumber(p.discountValue)}`;
  return "Buy X Get Y";
}

function randomCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function StatusBadge({ status }: { status: PromoStatus }) {
  const map = {
    live: { label: "Live", variant: "softSuccess" as const },
    scheduled: { label: "Scheduled", variant: "softInfo" as const },
    expired: { label: "Expired", variant: "softDanger" as const },
    inactive: { label: "Inactive", variant: "secondary" as const },
  };
  const cfg = map[status];
  return (
    <Badge variant={cfg.variant} className="h-5 rounded-full px-2 text-[10px] font-bold uppercase tracking-wide">
      {cfg.label}
    </Badge>
  );
}

function UsageBar({ count, limit }: { count: number; limit?: number | null }) {
  const pct = limit ? Math.min((count / limit) * 100, 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{limit ? `${count} / ${limit} used` : `${count} uses · Unlimited`}</span>
        {limit ? <span className="font-semibold tabular-nums">{Math.round(pct ?? 0)}%</span> : null}
      </div>
      {limit ? (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              (pct ?? 0) >= 90 ? "bg-red-500" : (pct ?? 0) >= 70 ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Hub ─────────────────────────────────────────────────────────────────────────
export function PromotionsHub() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PromotionForm>({ ...EMPTY_FORM });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Promotion[]>("/promotions");
      setPromos(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load promotions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const statuses = promos.map(getPromoStatus);
    return {
      live: statuses.filter((s) => s === "live").length,
      scheduled: statuses.filter((s) => s === "scheduled").length,
      expired: statuses.filter((s) => s === "expired").length,
      coupons: promos.filter((p) => p.couponCode).length,
      totalUses: promos.reduce((s, p) => s + p.usageCount, 0),
      total: promos.length,
    };
  }, [promos]);

  const kpis: ReportKpiItem[] = [
    { label: "Live Promos", value: String(stats.live), sub: "Currently active", icon: Zap, tone: "emerald" },
    { label: "Scheduled", value: String(stats.scheduled), sub: "Upcoming offers", icon: CalendarDays, tone: "blue" },
    { label: "With Coupon", value: String(stats.coupons), sub: "Code-based promos", icon: Ticket, tone: "violet" },
    { label: "Total Uses", value: String(stats.totalUses), sub: "Redemptions", icon: TrendingUp, tone: "teal" },
    { label: "Expired", value: String(stats.expired), sub: "Past end date", icon: Clock, tone: "amber" },
    { label: "All Promos", value: String(stats.total), sub: "In your catalog", icon: Tag, tone: "slate" },
  ];

  const filtered = useMemo(() => {
    return promos.filter((p) => {
      const status = getPromoStatus(p);
      const q = search.toLowerCase();
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        (p.couponCode ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filter === "all") return true;
      if (filter === "coupons") return Boolean(p.couponCode);
      return status === filter;
    });
  }, [promos, search, filter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, startsAt: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      discountType: p.discountType,
      discountValue: p.discountValue,
      minOrderAmount: p.minOrderAmount,
      maxDiscount: p.maxDiscount?.toString() ?? "",
      usageLimit: p.usageLimit?.toString() ?? "",
      perCustomerLimit: p.perCustomerLimit?.toString() ?? "",
      couponCode: p.couponCode ?? "",
      startsAt: p.startsAt.slice(0, 10),
      endsAt: p.endsAt?.slice(0, 10) ?? "",
      applicableTo: p.applicableTo,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.startsAt) {
      toast.error("Name and start date required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minOrderAmount: Number(form.minOrderAmount) || 0,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : undefined,
        startsAt: form.startsAt,
        endsAt: form.endsAt || undefined,
        couponCode: form.couponCode || undefined,
        applicableTo: form.applicableTo,
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
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: Promotion) => {
    try {
      await api.patch(`/promotions/${p.id}/toggle`, {});
      setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
      toast.success(p.isActive ? "Promotion deactivated" : "Promotion activated");
    } catch {
      toast.error("Failed to toggle");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this promotion? This cannot be undone.")) return;
    try {
      await api.delete(`/promotions/${id}`);
      setPromos((prev) => prev.filter((x) => x.id !== id));
      toast.success("Promotion deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Coupon code copied");
    } catch {
      toast.error("Could not copy code");
    }
  };

  const columns = useMemo<ColumnDef<Promotion>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Promotion" />,
        cell: ({ row }) => {
          const p = row.original;
          const status = getPromoStatus(p);
          return (
            <div className="min-w-[160px]">
              <OpenRecordButton onClick={() => openEdit(p)} className="font-medium">
                {p.name}
              </OpenRecordButton>
              {p.description ? (
                <p className="text-[11px] text-muted-foreground truncate max-w-[220px] mt-0.5">{p.description}</p>
              ) : null}
              <div className="mt-1.5">
                <TableStatusBadge status={status} />
              </div>
            </div>
          );
        },
      },
      {
        id: "couponCode",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Coupon" />,
        cell: ({ row }) => {
          const code = row.original.couponCode;
          if (!code) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <button
              type="button"
              onClick={() => void copyCode(code)}
              className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md hover:bg-primary/15 transition-colors"
            >
              {code}
              <Copy className="h-3 w-3 opacity-60" />
            </button>
          );
        },
      },
      {
        id: "discount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Discount" />,
        cell: ({ row }) => {
          const p = row.original;
          const cfg = DISCOUNT_CFG[p.discountType];
          return (
            <div>
              <p className="text-sm font-bold tabular-nums">{discountLabel(p)}</p>
              <p className={cn("text-[10px] font-medium", cfg.text)}>{cfg.label}</p>
            </div>
          );
        },
      },
      {
        id: "usage",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Usage" />,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="w-28">
              <UsageBar count={p.usageCount} limit={p.usageLimit} />
            </div>
          );
        },
      },
      {
        id: "validity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Validity" />,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              <p>{fmtDate(p.startsAt)}</p>
              <p>→ {p.endsAt ? fmtDate(p.endsAt) : "No end"}</p>
            </div>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <TableActionsRow
              editAction={{ action: () => openEdit(p) }}
              deleteAction={{ action: () => void handleDelete(p.id) }}
              dropMoreActions={[
                {
                  text: p.isActive ? "Deactivate" : "Activate",
                  function: () => void handleToggle(p),
                },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="promotions-hub min-h-screen bg-background">
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="page-shell py-4 space-y-4">
          <ReportsPageHeader
            title="Promotions & Coupons"
            description="Create discount offers, coupon codes, and track redemptions across POS"
            icon={Zap}
            actions={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={load}
                  className="h-9 gap-1.5"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Refresh
                </Button>
                <Button type="button" variant="default" size="sm" onClick={openCreate} className="h-9 gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New Promotion
                </Button>
              </>
            }
          />
        </div>

        <div className="border-t border-border/80 bg-muted/20">
          <div className="page-shell py-3 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted/40 border border-border/60">
              {FILTER_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    filter === t.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/80",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-1 lg:justify-end flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search name, code, description…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-8 text-xs bg-background"
                />
              </div>
              <div className="flex rounded-lg border border-border/60 p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "grid" ? "bg-background shadow-sm text-primary" : "text-muted-foreground",
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "table" ? "bg-background shadow-sm text-primary" : "text-muted-foreground",
                  )}
                  title="Table view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-shell py-6 space-y-5">
        <ReportKpiGrid items={kpis} loading={loading} cols={6} />

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-52 rounded-2xl border bg-card animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-2xl bg-primary/10 p-4 mb-4">
                <Tag className="h-8 w-8 text-primary opacity-80" />
              </div>
              <p className="font-semibold text-lg">No promotions found</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {search || filter !== "all"
                  ? "Try changing filters or search terms"
                  : "Create your first promotion or coupon to start driving sales"}
              </p>
              <Button variant="default" size="sm" className="mt-5 gap-1.5" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Create Promotion
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "table" ? (
          <ClientSideTable
            data={filtered}
            columns={columns}
            searchableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "promotions-export" }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((promo) => {
              const cfg = DISCOUNT_CFG[promo.discountType];
              const status = getPromoStatus(promo);
              const Icon = cfg.icon;
              return (
                <Card
                  key={promo.id}
                  className={cn(
                    "group overflow-hidden border-border/70 shadow-sm hover:shadow-md transition-all duration-200",
                    status === "live" && "ring-1 ring-primary/15",
                  )}
                >
                  <div className={cn("h-1.5 bg-gradient-to-r", cfg.stripe)} />
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <StatusBadge status={status} />
                          <Badge variant={cfg.badge} className="h-5 rounded-full px-2 text-[10px] font-bold">
                            {cfg.short}
                          </Badge>
                        </div>
                        <OpenRecordButton onClick={() => openEdit(promo)} className="text-base font-semibold truncate">
                          {promo.name}
                        </OpenRecordButton>
                        {promo.description ? (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{promo.description}</p>
                        ) : null}
                      </div>
                      <div className={cn("rounded-xl p-2.5 shrink-0", cfg.bg)}>
                        <Icon className={cn("h-5 w-5", cfg.text)} strokeWidth={1.75} />
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-3 rounded-xl bg-muted/40 border border-border/50 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Discount</p>
                        <p className="text-2xl font-bold tracking-tight tabular-nums">{discountLabel(promo)}</p>
                      </div>
                      {promo.couponCode ? (
                        <button
                          type="button"
                          onClick={() => void copyCode(promo.couponCode!)}
                          className="text-right group/code"
                          title="Copy coupon code"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Code</p>
                          <p className="font-mono text-sm font-bold text-primary inline-flex items-center gap-1">
                            {promo.couponCode}
                            <Copy className="h-3 w-3 opacity-0 group-hover/code:opacity-60 transition-opacity" />
                          </p>
                        </button>
                      ) : (
                        <p className="text-xs text-muted-foreground">Auto-applied offer</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      {promo.minOrderAmount > 0 ? (
                        <p>Min order: <span className="font-semibold text-foreground">LKR {formatNumber(promo.minOrderAmount)}</span></p>
                      ) : (
                        <p>No minimum order</p>
                      )}
                      {promo.maxDiscount ? (
                        <p className="text-right">Max off: <span className="font-semibold text-foreground">LKR {formatNumber(promo.maxDiscount)}</span></p>
                      ) : (
                        <p className="text-right">No cap</p>
                      )}
                      <p className="col-span-2 flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {fmtDate(promo.startsAt)} → {promo.endsAt ? fmtDate(promo.endsAt) : "No expiry"}
                      </p>
                    </div>

                    <UsageBar count={promo.usageCount} limit={promo.usageLimit} />

                    <div className="flex items-center justify-between pt-1 border-t border-border/60">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={promo.isActive}
                          onCheckedChange={() => void handleToggle(promo)}
                          aria-label={promo.isActive ? "Deactivate" : "Activate"}
                        />
                        <span className="text-xs text-muted-foreground">{promo.isActive ? "Active" : "Off"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(promo)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(promo.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {editing ? "Edit Promotion" : "Create Promotion"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Basic details</h3>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Promotion name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Summer Sale 2026"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional details shown to staff"
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Discount rules</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Discount type *</Label>
                  <Select
                    value={form.discountType}
                    onValueChange={(v) => setForm((f) => ({ ...f, discountType: v as PromotionForm["discountType"] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">Percentage %</SelectItem>
                      <SelectItem value="FIXED">Fixed amount (LKR)</SelectItem>
                      <SelectItem value="BUY_X_GET_Y">Buy X Get Y</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">
                    {form.discountType === "PERCENTAGE" ? "Discount %" : "Discount amount (LKR)"} *
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Minimum order (LKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.minOrderAmount}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: Number(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Maximum discount (LKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.maxDiscount}
                    onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                    placeholder="No limit"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Coupon & limits</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs mb-1.5 block">Coupon code</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.couponCode}
                      onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value.toUpperCase() }))}
                      placeholder="e.g. SAVE20 (leave empty for auto offers)"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 h-10"
                      onClick={() => setForm((f) => ({ ...f, couponCode: randomCouponCode() }))}
                    >
                      Generate
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Total usage limit</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.usageLimit}
                    onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Per customer limit</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.perCustomerLimit}
                    onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))}
                    placeholder="Unlimited"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Schedule</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Start date *</Label>
                  <Input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">End date</Label>
                  <Input
                    type="date"
                    value={form.endsAt}
                    onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <div className={modalInlineFooterClass}>
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="default" onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : editing ? "Update promotion" : "Create promotion"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
