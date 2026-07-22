"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Star, Crown,
  Users, Gift, RefreshCw, Diamond, Wallet,
  UserCheck, UserMinus, UserPlus, CreditCard, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { useShopWorkspace, hasShopModule } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";
import { api } from "@/lib/api";
import { formatNumber, getInitials } from "@/lib/utils";
import { AddCustomerModal, type Customer } from "@/components/customers/add-customer-modal";
import { ViewCustomerModal } from "@/components/customers/view-customer-modal";
// ── Tier config ───────────────────────────────────────────────────────────
const TIER_CONF: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  BRONZE:   { label: "Bronze",   color: "text-amber-800 dark:text-amber-300",  bg: "bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30",  icon: Star },
  SILVER:   { label: "Silver",   color: "text-slate-700 dark:text-slate-300",  bg: "bg-slate-100 border border-slate-300 dark:bg-slate-500/10 dark:border-slate-500/30", icon: Star },
  GOLD:     { label: "Gold",     color: "text-amber-700 dark:text-amber-300",  bg: "bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30",  icon: Crown },
  PLATINUM: { label: "Platinum", color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30", icon: Crown },
  DIAMOND:  { label: "Diamond",  color: "text-cyan-700 dark:text-cyan-300",   bg: "bg-cyan-50 border border-cyan-200 dark:bg-cyan-500/10 dark:border-cyan-500/30",   icon: Diamond },
};

const SEGMENT_ICON: Record<string, React.ElementType> = {
  high_value: TrendingUp,
  active: UserCheck,
  dormant: UserMinus,
  new: UserPlus,
  credit: CreditCard,
};

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onView:   (c: Customer) => void,
  onEdit:   (c: Customer) => void,
  onDelete: (c: Customer) => void,
  opts: { showLoyalty: boolean; customerLabel: string },
): ColumnDef<Customer>[] {
  const cols: ColumnDef<Customer>[] = [
    {
      id: "customer",
      accessorFn: (c) => `${c.firstName} ${c.lastName ?? ""} ${c.phone} ${c.email ?? ""}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title={opts.customerLabel.replace(/s$/, "")} />,
      cell: ({ row }) => {
        const c = row.original;
        const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
        const tierConf = TIER_CONF[c.tier] ?? TIER_CONF.BRONZE;
        const TierIcon = tierConf.icon;
        return (
          <div className="flex items-center gap-3 min-w-0" data-cell-wrap>
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <OpenRecordButton onClick={() => onView(c)} className="text-sm truncate max-w-full">
                {name}
              </OpenRecordButton>
              <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${tierConf.bg} ${tierConf.color}`}>
                <TierIcon className="h-2.5 w-2.5" />
                {tierConf.label}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => <span className="text-sm font-mono tabular-nums text-foreground/90">{row.original.phone}</span>,
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate max-w-[180px] block">
          {row.original.email ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "totalSpent",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Spent" />,
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.totalSpent)}</span>
      ),
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
        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
          {formatNumber(row.original.loyaltyPoints)}
        </span>
      ),
    });
  }
  cols.push(
    {
      accessorKey: "walletBalance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Wallet" />,
      cell: ({ row }) => (
        <span className={`text-sm font-semibold tabular-nums ${row.original.walletBalance > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
          LKR {formatNumber(row.original.walletBalance)}
        </span>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
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
  const [segments, setSegments] = useState<{ key: string; label: string; count: number }[]>([]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const [res, segRes] = await Promise.all([
        api.get<{ data: Customer[] }>("/customers?limit=500"),
        api.get<{ segments: { key: string; label: string; count: number }[] }>("/customers/segments"),
      ]);
      setCustomers(res.data?.data ?? (res.data as unknown as Customer[]) ?? []);
      setSegments(segRes.data?.segments ?? []);
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

  const totalPoints = customers.reduce((s, c) => s + c.loyaltyPoints, 0);
  const totalWallet = customers.reduce((s, c) => s + c.walletBalance, 0);
  const premium = customers.filter((c) => ["GOLD", "PLATINUM", "DIAMOND"].includes(c.tier)).length;

  const STATS = [
    {
      label: `Total ${workspace.customerLabel}`,
      value: customers.length,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50 border border-blue-200",
      tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent",
    },
    ...(showLoyalty
      ? [
          {
            label: "Gold+ Members",
            value: premium,
            icon: Crown,
            color: "text-amber-600",
            bg: "bg-amber-50 border border-amber-200",
            tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent",
          },
          {
            label: "Loyalty Points",
            value: formatNumber(totalPoints),
            icon: Gift,
            color: "text-violet-600",
            bg: "bg-violet-50 border border-violet-200",
            tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent",
          },
        ]
      : []),
    {
      label: "Wallet Balance",
      value: `LKR ${formatNumber(totalWallet)}`,
      icon: Wallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border border-emerald-200",
      tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent",
    },
  ];

  const columns = buildColumns(
    (c) => setViewId(c.id),
    (c) => {
      setEditCustomer(c);
      setAddOpen(true);
    },
    handleDelete,
    { showLoyalty, customerLabel: workspace.customerLabel },
  );

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">{customerTitle}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Manage {workspace.customerLabel.toLowerCase()}
            {showLoyalty ? " relationships and loyalty" : " accounts and credit"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={() => void fetchCustomers()} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button
            className="gap-1.5"
            onClick={() => {
              setEditCustomer(undefined);
              setAddOpen(true);
            }}
          >
            <Plus className="h-[18px] w-[18px]" />
            Add {workspace.customerLabel.replace(/s$/, "")}
          </Button>
        </div>
      </div>

      {/* KPIs — one clean row */}
      <div className={`grid grid-cols-2 gap-3 ${showLoyalty ? "xl:grid-cols-4" : "xl:grid-cols-2"}`}>
        {STATS.map((s) => (
          <Card
            key={s.label}
            className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
          >
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className={`${typeof s.value === "string" ? "text-lg" : "text-[22px]"} font-bold leading-none tabular-nums truncate`}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Segments — compact chips (not a second card grid) */}
      {segments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {segments.map((s) => {
            const Icon = SEGMENT_ICON[s.key] ?? Users;
            return (
              <div
                key={s.key}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-card text-xs font-medium"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-bold tabular-nums text-foreground">{s.count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Table — single search, tier filter, one export */}
      <ClientSideTable
        data={customers}
        columns={columns}
        searchableColumns={[
          { id: "customer", title: "Customer / phone / email" },
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

      <AddCustomerModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditCustomer(undefined);
        }}
        onSaved={() => {
          void fetchCustomers();
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
