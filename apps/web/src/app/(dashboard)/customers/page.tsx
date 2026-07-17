"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Star, Crown,
  Users, Gift, RefreshCw, Download, Diamond, Wallet,
  UserCheck, UserMinus, UserPlus, CreditCard, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { useShopWorkspace, hasShopModule } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";
import { api } from "@/lib/api";
import { formatNumber, getInitials } from "@/lib/utils";
import { AddCustomerModal, type Customer } from "@/components/customers/add-customer-modal";
import { ViewCustomerModal } from "@/components/customers/view-customer-modal";
import { OpenRecordButton } from "@/components/table/open-record-button";

// ── Tier config ───────────────────────────────────────────────────────────
const TIER_CONF: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  BRONZE:   { label: "Bronze",   color: "text-amber-800",  bg: "bg-amber-50 border border-amber-200",  icon: Star },
  SILVER:   { label: "Silver",   color: "text-slate-700",  bg: "bg-slate-100 border border-slate-300", icon: Star },
  GOLD:     { label: "Gold",     color: "text-amber-700",  bg: "bg-amber-50 border border-amber-200",  icon: Crown },
  PLATINUM: { label: "Platinum", color: "text-violet-700", bg: "bg-violet-50 border border-violet-200", icon: Crown },
  DIAMOND:  { label: "Diamond",  color: "text-cyan-700",   bg: "bg-cyan-50 border border-cyan-200",   icon: Diamond },
};

const SEGMENT_ICON: Record<string, React.ElementType> = {
  high_value: TrendingUp,
  active: UserCheck,
  dormant: UserMinus,
  new: UserPlus,
  credit: CreditCard,
};

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
  opts: { showLoyalty: boolean; customerLabel: string },
): ColumnDef<Customer>[] {
  const cols: ColumnDef<Customer>[] = [
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title={opts.customerLabel.replace(/s$/, "")} />,
      cell: ({ row }) => {
        const c = row.original;
        const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
        const tierConf = TIER_CONF[c.tier] ?? TIER_CONF.BRONZE;
        const TierIcon = tierConf.icon;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <OpenRecordButton onClick={() => onView(c)} className="text-sm truncate block max-w-full">
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
        <span className="text-sm font-semibold text-amber-700 tabular-nums">
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
        <span className={`text-sm font-semibold tabular-nums ${row.original.walletBalance > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
          LKR {formatNumber(row.original.walletBalance)}
        </span>
      ),
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
    },
    ...(showLoyalty
      ? [
          {
            label: "Gold+ Members",
            value: premium,
            icon: Crown,
            color: "text-amber-600",
            bg: "bg-amber-50 border border-amber-200",
          },
          {
            label: "Loyalty Points",
            value: formatNumber(totalPoints),
            icon: Gift,
            color: "text-violet-600",
            bg: "bg-violet-50 border border-violet-200",
          },
        ]
      : []),
    {
      label: "Wallet Balance",
      value: `LKR ${formatNumber(totalWallet)}`,
      icon: Wallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50 border border-emerald-200",
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
          <Card key={s.label} className="card-hover">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight tabular-nums truncate">{s.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Segments */}
      {segments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {segments.map((s) => {
            const Icon = SEGMENT_ICON[s.key] ?? Users;
            return (
              <Card key={s.key}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold tabular-nums leading-none">{s.count}</p>
                    <p className="text-[11px] font-medium text-muted-foreground mt-1 leading-tight truncate">
                      {s.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Table */}
      <ClientSideTable
        data={customers}
        columns={columns}
        pageCount={Math.ceil(customers.length / 10)}
        searchableColumns={[
          { id: "phone", title: "Phone" },
          { id: "email", title: "Email" },
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
