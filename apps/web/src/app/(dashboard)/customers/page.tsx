"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Star, Crown,
  Users, Gift, RefreshCw, Download, Diamond, Wallet,
  UserCheck, UserMinus, UserPlus, CreditCard, TrendingUp,
  Trophy, Layers, Clock,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { useShopWorkspace, hasShopModule } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";
import { api } from "@/lib/api";
import { cn, formatNumber, getInitials } from "@/lib/utils";
import { AddCustomerModal, type Customer } from "@/components/customers/add-customer-modal";
import { ViewCustomerModal } from "@/components/customers/view-customer-modal";
import { OpenRecordButton } from "@/components/table/open-record-button";

// ── Tier config ───────────────────────────────────────────────────────────
const TIER_ORDER = ["DIAMOND", "PLATINUM", "GOLD", "SILVER", "BRONZE"] as const;

const TIER_CONF: Record<string, {
  label: string; color: string; bg: string; ring: string; bar: string; icon: React.ElementType;
}> = {
  BRONZE:   { label: "Bronze",   color: "text-orange-800", bg: "bg-orange-50 border border-orange-200",  ring: "ring-orange-200",  bar: "bg-orange-400",  icon: Star },
  SILVER:   { label: "Silver",   color: "text-slate-700",  bg: "bg-slate-100 border border-slate-300",   ring: "ring-slate-300",   bar: "bg-slate-400",   icon: Star },
  GOLD:     { label: "Gold",     color: "text-amber-700",  bg: "bg-amber-50 border border-amber-200",    ring: "ring-amber-300",   bar: "bg-amber-400",   icon: Crown },
  PLATINUM: { label: "Platinum", color: "text-violet-700", bg: "bg-violet-50 border border-violet-200",  ring: "ring-violet-300",  bar: "bg-violet-500",  icon: Crown },
  DIAMOND:  { label: "Diamond",  color: "text-cyan-700",   bg: "bg-cyan-50 border border-cyan-200",      ring: "ring-cyan-300",    bar: "bg-cyan-500",    icon: Diamond },
};

function TierChip({ tier, className }: { tier: string; className?: string }) {
  const conf = TIER_CONF[tier] ?? TIER_CONF.BRONZE;
  const Icon = conf.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", conf.bg, conf.color, className)}>
      <Icon className="h-2.5 w-2.5" />
      {conf.label}
    </span>
  );
}

// ── Segments (mirror API logic client-side so chips filter the table) ─────
const DAY = 86_400_000;

function lastActivity(c: Customer): number {
  return c.lastPurchaseAt ? Date.parse(c.lastPurchaseAt) : Date.parse(c.createdAt);
}

const SEGMENTS: {
  key: string; label: string; hint: string; icon: React.ElementType;
  match: (c: Customer, now: number) => boolean;
}[] = [
  { key: "HIGH_VALUE", label: "High Value", hint: "100k+ lifetime", icon: TrendingUp, match: (c) => c.totalSpent >= 100_000 },
  { key: "ACTIVE",     label: "Active",     hint: "bought in 90d",  icon: UserCheck,  match: (c, now) => now - lastActivity(c) <= 90 * DAY },
  { key: "DORMANT",    label: "Dormant",    hint: "quiet for 90d+", icon: UserMinus,  match: (c, now) => now - lastActivity(c) > 90 * DAY },
  { key: "NEW",        label: "New",        hint: "joined in 30d",  icon: UserPlus,   match: (c, now) => now - Date.parse(c.createdAt) <= 30 * DAY },
  { key: "CREDIT",     label: "Credit Due", hint: "owes credit",    icon: CreditCard, match: (c) => c.creditBalance > 0 },
];

// ── CSV export ────────────────────────────────────────────────────────────
function exportCsv(customers: Customer[]) {
  const rows = customers.map((c) => [
    `"${c.firstName} ${c.lastName ?? ""}"`, `"${c.phone}"`, `"${c.email ?? ""}"`,
    c.tier, c.totalSpent, c.totalOrders, c.loyaltyPoints, c.walletBalance,
  ].join(","));
  const csv = ["Name,Phone,Email,Tier,TotalSpent,Orders,Points,Wallet", ...rows].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "customers-export.csv" });
  a.click();
}

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onView:   (c: Customer) => void,
  onEdit:   (c: Customer) => void,
  onDelete: (c: Customer) => void,
  opts: { showLoyalty: boolean; customerLabel: string; maxSpent: number },
): ColumnDef<Customer>[] {
  const cols: ColumnDef<Customer>[] = [
    {
      accessorKey: "firstName",
      header: ({ column }) => <DataTableColumnHeader column={column} title={opts.customerLabel.replace(/s$/, "")} />,
      cell: ({ row }) => {
        const c = row.original;
        const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
        const conf = TIER_CONF[c.tier] ?? TIER_CONF.BRONZE;
        return (
          <div className="flex items-center gap-3">
            <Avatar className={cn("h-9 w-9 shrink-0 ring-2 ring-offset-1 ring-offset-card", conf.ring)}>
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <OpenRecordButton onClick={() => onView(c)} className="text-sm truncate max-w-full">
                {name}
              </OpenRecordButton>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                {c.code}{c.city ? ` · ${c.city}` : ""}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "tier",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tier" />,
      cell: ({ row }) => <TierChip tier={row.original.tier} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "phone",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contact" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-mono tabular-nums text-foreground/90">{row.original.phone}</p>
          {row.original.email && (
            <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{row.original.email}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "totalSpent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lifetime Spend" />,
      cell: ({ row }) => {
        const pct = opts.maxSpent > 0 ? Math.max(4, Math.round((row.original.totalSpent / opts.maxSpent) * 100)) : 0;
        return (
          <div className="min-w-[120px]">
            <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.totalSpent)}</span>
            <div className="h-1 w-full max-w-[110px] rounded-full bg-muted mt-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "totalOrders",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Orders" />,
      cell: ({ row }) => <span className="text-sm font-medium tabular-nums">{row.original.totalOrders}</span>,
    },
  ];
  if (opts.showLoyalty) {
    cols.push({
      accessorKey: "loyaltyPoints",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Points" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 tabular-nums">
          <Gift className="h-3 w-3" />
          {formatNumber(row.original.loyaltyPoints)}
        </span>
      ),
    });
  }
  cols.push(
    {
      accessorKey: "walletBalance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Wallet / Credit" />,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div>
            <span className={cn("text-sm font-semibold tabular-nums", c.walletBalance > 0 ? "text-emerald-700" : "text-muted-foreground")}>
              LKR {formatNumber(c.walletBalance)}
            </span>
            {c.creditBalance > 0 && (
              <p className="text-[11px] font-semibold text-red-600 tabular-nums mt-0.5">
                Credit LKR {formatNumber(c.creditBalance)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "lastPurchaseAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Purchase" />,
      cell: ({ row }) => {
        const last = row.original.lastPurchaseAt;
        return (
          <span className={cn("inline-flex items-center gap-1.5 text-xs", last ? "text-foreground/80" : "text-muted-foreground/70")}>
            <Clock className="h-3 w-3 shrink-0" />
            {last ? `${formatDistanceToNowStrict(new Date(last))} ago` : "Never"}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          showAction={{ action: () => onView(row.original), tooltip: "View Profile" }}
          editAction={{ action: () => onEdit(row.original) }}
          deleteAction={{ action: () => onDelete(row.original) }}
        />
      ),
    },
  );
  return cols;
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const { profile, workspace } = useShopWorkspace();
  const showLoyalty = hasShopModule(profile, "loyalty");
  const customerTitle = profile.type === ShopType.AGRICULTURE
    ? `${workspace.customerLabel} & Accounts`
    : `${workspace.customerLabel} & CRM`;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [viewId, setViewId] = useState<string | null>(null);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Customer[] }>("/customers?limit=500");
      setCustomers(res.data?.data ?? (res.data as unknown as Customer[]) ?? []);
    } catch {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleDelete = async (c: Customer) => {
    if (!window.confirm(`Delete ${c.firstName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      toast.success("Customer deleted");
      fetchCustomers();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  // ── Derived CRM data ────────────────────────────────────────────────────
  const now = Date.now();

  const segmentCounts = useMemo(
    () => Object.fromEntries(SEGMENTS.map((s) => [s.key, customers.filter((c) => s.match(c, now)).length])),
    [customers, now],
  );

  const filtered = useMemo(() => {
    if (!activeSegment) return customers;
    const seg = SEGMENTS.find((s) => s.key === activeSegment);
    return seg ? customers.filter((c) => seg.match(c, now)) : customers;
  }, [customers, activeSegment, now]);

  const totalPoints  = customers.reduce((s, c) => s + c.loyaltyPoints, 0);
  const totalWallet  = customers.reduce((s, c) => s + c.walletBalance, 0);
  const totalCredit  = customers.reduce((s, c) => s + c.creditBalance, 0);
  const premium      = customers.filter((c) => ["GOLD", "PLATINUM", "DIAMOND"].includes(c.tier)).length;
  const newThisMonth = segmentCounts.NEW ?? 0;
  const maxSpent     = Math.max(0, ...filtered.map((c) => c.totalSpent));

  const tierBreakdown = useMemo(
    () => TIER_ORDER
      .map((t) => ({ tier: t, count: customers.filter((c) => c.tier === t).length }))
      .filter((t) => t.count > 0),
    [customers],
  );

  const topCustomers = useMemo(
    () => [...customers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5).filter((c) => c.totalSpent > 0),
    [customers],
  );

  const STATS = [
    {
      label: `Total ${workspace.customerLabel}`,
      value: customers.length,
      sub: newThisMonth > 0 ? `+${newThisMonth} new this month` : "no new this month",
      subClass: newThisMonth > 0 ? "text-emerald-600" : "text-muted-foreground",
      icon: Users,
      tile: "bg-gradient-to-br from-indigo-500 to-violet-600",
    },
    ...(showLoyalty
      ? [
          {
            label: "Gold+ Members",
            value: premium,
            sub: customers.length ? `${Math.round((premium / customers.length) * 100)}% of base` : "—",
            subClass: "text-muted-foreground",
            icon: Crown,
            tile: "bg-gradient-to-br from-amber-400 to-orange-500",
          },
          {
            label: "Loyalty Points",
            value: formatNumber(totalPoints),
            sub: customers.length ? `avg ${formatNumber(Math.round(totalPoints / customers.length))} / member` : "—",
            subClass: "text-muted-foreground",
            icon: Gift,
            tile: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
          },
        ]
      : []),
    {
      label: "Wallet Balance",
      value: `LKR ${formatNumber(totalWallet)}`,
      sub: totalCredit > 0 ? `LKR ${formatNumber(totalCredit)} credit due` : "no credit outstanding",
      subClass: totalCredit > 0 ? "text-red-600" : "text-muted-foreground",
      icon: Wallet,
      tile: "bg-gradient-to-br from-emerald-500 to-teal-600",
    },
  ];

  const columns = buildColumns(
    (c) => setViewId(c.id),
    (c) => {
      setEditCustomer(c);
      setAddOpen(true);
    },
    handleDelete,
    { showLoyalty, customerLabel: workspace.customerLabel, maxSpent },
  );

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{customerTitle}</h1>
          <p className="text-sm font-normal text-muted-foreground leading-relaxed">
            Manage {workspace.customerLabel.toLowerCase()}
            {showLoyalty ? " relationships and loyalty" : " accounts and credit"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="outline" size="sm" onClick={fetchCustomers} className="gap-1.5 h-10">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(customers)}
            disabled={!customers.length}
            className="gap-1.5 h-10"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-10 shadow-button"
            onClick={() => {
              setEditCustomer(undefined);
              setAddOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add {workspace.customerLabel.replace(/s$/, "")}
          </Button>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${showLoyalty ? "xl:grid-cols-4" : "xl:grid-cols-2"}`}>
        {STATS.map((s) => (
          <Card key={s.label} className="card-hover overflow-hidden">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md", s.tile)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight tabular-nums truncate">{s.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{s.label}</p>
                <p className={cn("text-[11px] font-semibold mt-0.5", s.subClass)}>{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Segment filter rail */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          type="button"
          onClick={() => setActiveSegment(null)}
          className={cn(
            "inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-xs font-semibold border transition-all",
            !activeSegment
              ? "bg-primary text-primary-foreground border-primary shadow-button"
              : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
          )}
        >
          <Users className="h-3.5 w-3.5" />
          All
          <span className={cn("tabular-nums", !activeSegment ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
            {customers.length}
          </span>
        </button>
        {SEGMENTS.map((s) => {
          const active = activeSegment === s.key;
          return (
            <button
              key={s.key}
              type="button"
              title={s.hint}
              onClick={() => setActiveSegment(active ? null : s.key)}
              className={cn(
                "inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-xs font-semibold border transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-button"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
              )}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
              <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                {segmentCounts[s.key] ?? 0}
              </span>
            </button>
          );
        })}
        {activeSegment && (
          <span className="text-xs text-muted-foreground">
            showing {filtered.length} of {customers.length}
          </span>
        )}
      </div>

      {/* Table + insights rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <ClientSideTable
          data={filtered}
          columns={columns}
          pageCount={Math.ceil(filtered.length / 10)}
          searchableColumns={[
            { id: "firstName", title: "Name" },
            { id: "phone", title: "Phone" },
          ]}
          filterableColumns={[
            {
              id: "tier",
              title: "Tier",
              options: Object.entries(TIER_CONF).map(([v, c]) => ({ value: v, label: c.label })),
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "customers-export" }}
        />

        <div className="space-y-5">
          {/* Tier distribution */}
          {showLoyalty && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Tier Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {tierBreakdown.length === 0 && (
                  <p className="text-xs text-muted-foreground">No members yet</p>
                )}
                {tierBreakdown.map(({ tier, count }) => {
                  const conf = TIER_CONF[tier];
                  const pct = customers.length ? Math.round((count / customers.length) * 100) : 0;
                  return (
                    <div key={tier}>
                      <div className="flex items-center justify-between mb-1">
                        <TierChip tier={tier} />
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", conf.bar)} style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Top customers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top {workspace.customerLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {topCustomers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No purchases recorded yet</p>
              ) : (
                <div className="space-y-1">
                  {topCustomers.map((c, i) => {
                    const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setViewId(c.id)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                          i === 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground",
                        )}>
                          {i + 1}
                        </span>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.totalOrders} orders</p>
                        </div>
                        <span className="text-xs font-bold tabular-nums shrink-0">
                          LKR {formatNumber(c.totalSpent)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddCustomerModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditCustomer(undefined);
        }}
        onSaved={() => {
          fetchCustomers();
          setAddOpen(false);
          setEditCustomer(undefined);
        }}
        editCustomer={editCustomer}
      />
      <ViewCustomerModal
        customerId={viewId}
        onClose={() => setViewId(null)}
        onEdit={(c) => {
          setEditCustomer(c);
          setAddOpen(true);
        }}
      />
    </div>
  );
}
